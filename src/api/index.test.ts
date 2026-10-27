import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, AuthExpiredError, AUTH_EXPIRED_EVENT } from "./index";

// 单元测试:验证 api 封装正确拼接 URL / 携带 token / 处理错误
describe("api client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers with POST /auth/register and returns parsed body", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ token: "T", user: { id: 1 } }),
    });

    const data = await api.register({ username: "u", password: "123456" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/register",
      expect.objectContaining({ method: "POST" })
    );
    expect(data.token).toBe("T");
    expect(data.user.id).toBe(1);
  });

  it("attaches Authorization header from localStorage token", async () => {
    localStorage.setItem("duitang_token", "MY_TOKEN");
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ posts: [] }) });

    await api.getPosts();

    const called = fetchMock.mock.calls[0][1] as RequestInit;
    expect((called.headers as Record<string, string>)["Authorization"]).toBe("Bearer MY_TOKEN");
  });

  it("throws Error with backend message on non-ok", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: "标题必填" }) });
    await expect(api.createPost({ title: "", description: "", board: "", images: [], tags: [] }))
      .rejects.toThrow("标题必填");
  });

  it("getPosts encodes q into query string", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ posts: [], total: 0, page: 1, limit: 20 }) });
    await api.getPosts({ q: "测试", page: 2, limit: 10 });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("q=%E6%B5%8B%E8%AF%95");
    expect(url).toContain("page=2");
    expect(url).toContain("limit=10");
  });

  it("upload sends FormData without JSON content-type", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ url: "/uploads/a.jpg" }) });
    const data = await api.upload(new File(["x"], "a.jpg", { type: "image/jpeg" }));
    expect(data.url).toBe("/uploads/a.jpg");
    const headers = (fetchMock.mock.calls[0][1].headers) as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("sharePost posts to /posts/:id/share", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ shared: true, count: 1 }) });
    const data = await api.sharePost(5);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/posts/5/share");
    expect(data.count).toBe(1);
  });

  it("getFollowingFeed 拼接分页参数并带 token", async () => {
    localStorage.setItem("duitang_token", "T2");
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ posts: [], total: 0, page: 2, limit: 20 }) });
    await api.getFollowingFeed({ page: 2, limit: 20 });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/api/feed/following?");
    expect(url).toContain("page=2");
    expect(url).toContain("limit=20");
    const headers = (fetchMock.mock.calls[0][1].headers) as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer T2");
  });

  // 回归：token 过期时界面仍是"已登录"但所有操作失败，必须主动登出并通知全局
  it("非登录接口返回 401 时清除凭证并派发过期事件", async () => {
    localStorage.setItem("duitang_token", "EXPIRED");
    const listener = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, listener);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: "未登录" }) });

    await expect(api.likePost(1)).rejects.toBeInstanceOf(AuthExpiredError);
    expect(localStorage.getItem("duitang_token")).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(AUTH_EXPIRED_EVENT, listener);
  });

  it("登录接口的 401 不触发登出（密码错误）", async () => {
    const listener = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, listener);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: "用户名或密码错误" }) });

    await expect(api.login({ username: "u", password: "bad" })).rejects.toThrow("用户名或密码错误");
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(AUTH_EXPIRED_EVENT, listener);
  });

  it("my/interactions 走轻量接口", async () => {
    localStorage.setItem("duitang_token", "T3");
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ liked: [1], collected: [2], following: [3] }) });
    const data = await api.myInteractions();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/my/interactions");
    expect(data.collected).toEqual([2]);
  });

  // 回归：冷启动恢复会话时 token 若已过期，不该立刻弹登录框打扰用户
  it("会话恢复接口 401 只清凭证、不派发过期事件", async () => {
    localStorage.setItem("duitang_token", "STALE");
    const listener = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, listener);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: "未登录" }) });

    await expect(api.me()).rejects.toBeInstanceOf(AuthExpiredError);
    expect(localStorage.getItem("duitang_token")).toBeNull();
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(AUTH_EXPIRED_EVENT, listener);
  });

  // 滑动续期：后端通过响应头下发新 token 时透明替换本地凭证
  it("响应头 X-Refresh-Token 出现时替换 localStorage 中的旧 token", async () => {
    localStorage.setItem("duitang_token", "OLD");
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      headers: { get: (k: string) => (k === "X-Refresh-Token" ? "NEW" : null) },
      json: async () => ({ posts: [] }),
    });

    await api.getPosts();
    expect(localStorage.getItem("duitang_token")).toBe("NEW");
  });

  it("无续期头时不动 localStorage", async () => {
    localStorage.setItem("duitang_token", "KEEP");
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({ posts: [] }),
    });

    await api.getPosts();
    expect(localStorage.getItem("duitang_token")).toBe("KEEP");
  });
});
