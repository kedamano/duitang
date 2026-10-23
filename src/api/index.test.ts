import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "./index";

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
});
