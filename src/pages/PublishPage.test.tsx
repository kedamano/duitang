import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import PublishPage from "./PublishPage";
import { AuthProvider } from "../context/AuthContext";
import { CollectionProvider } from "../context/CollectionContext";
import { ToastProvider } from "../context/ToastContext";
import * as apiModule from "../api";

vi.mock("../api", () => ({
  AUTH_EXPIRED_EVENT: "duitang:auth-expired",
  AuthExpiredError: class extends Error {},
  api: {
    me: vi.fn(),
    myInteractions: vi.fn().mockResolvedValue({ liked: [], collected: [], following: [] }),
    myPosts: vi.fn().mockResolvedValue({ posts: [] }),
    myCollects: vi.fn().mockResolvedValue({ posts: [] }),
    myLikes: vi.fn().mockResolvedValue({ posts: [] }),
    myAlbums: vi.fn().mockResolvedValue({ albums: [] }),
    getMyDraft: vi.fn().mockResolvedValue({ draft: null }),
    saveMyDraft: vi.fn().mockResolvedValue({ ok: true }),
    deleteMyDraft: vi.fn().mockResolvedValue({ ok: true }),
    upload: vi.fn(),
    createPost: vi.fn(),
    addPostToAlbum: vi.fn().mockResolvedValue({ ok: true }),
    likePost: vi.fn(),
    collectPost: vi.fn(),
  },
}));

const meUser = {
  id: 1, username: "tangyan", nickname: "糖小颜", avatar: "/a.svg",
  bio: "", posts: 1, followers: 0, following: 0, collections: 0, is_admin: false,
};

// jsdom 不加载图片：stub Image 让 onload 立即触发（measureImage 依赖）
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 400;
  naturalHeight = 300;
  set src(_v: string) { setTimeout(() => this.onload?.(), 0); }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/publish"]}>
      <ToastProvider>
        <AuthProvider>
          <CollectionProvider>
            <Routes>
              <Route path="/publish" element={<PublishPage />} />
              <Route path="*" element={<div>已跳转首页</div>} />
            </Routes>
          </CollectionProvider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

function makeImageFile(name: string, kb: number): File {
  const file = new File([new Uint8Array(kb * 1024)], name, { type: "image/jpeg" });
  // jsdom 里 Blob 大小即字节数；需要超大文件时直接覆写 size，避免真分配内存
  if (kb > 10_000) {
    Object.defineProperty(file, "size", { value: kb * 1024 * 1024 });
  }
  return file;
}

/** 计数文案有两处（标签 "(1/9)" 与加号按钮 "1/9"），断言用带括号的那个 */
const countLabel = (n: number) => screen.getByText(new RegExp(`\\(${n}/9\\)`));

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const titleInput = () => screen.getByPlaceholderText(/起一个好标题/) as HTMLInputElement;
const gridPreviews = () =>
  Array.from(document.querySelectorAll('img.pointer-events-none')) as HTMLImageElement[];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("duitang_token", "T");
  vi.clearAllMocks();
  (apiModule.api.me as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: meUser, stats: { posts: 1, followers: 0, following: 0, collects: 0 },
  });
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    blob: async () => new Blob(["img"], { type: "image/jpeg" }),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PublishPage", () => {
  it("未登录显示登录引导", async () => {
    (apiModule.api.me as ReturnType<typeof vi.fn>).mockResolvedValue({ user: null });
    localStorage.removeItem("duitang_token");
    renderPage();
    await waitFor(() => expect(screen.getByText("请先登录")).toBeInTheDocument());
    expect(screen.getByText("去登录")).toBeInTheDocument();
  });

  it("无标题无图时发布按钮禁用", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("发布新内容")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "发布" })).toBeDisabled();
  });

  it("选择图片后显示计数，填标题后发布按钮可用", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("发布新内容")).toBeInTheDocument());
    fireEvent.change(fileInput(), { target: { files: [makeImageFile("a.jpg", 10)] } });
    await waitFor(() => expect(countLabel(1)).toBeInTheDocument());
    fireEvent.change(titleInput(), { target: { value: "测试标题" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "发布" })).not.toBeDisabled());
  });

  it("超过 10MB 的图片被跳过并提示", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("发布新内容")).toBeInTheDocument());
    fireEvent.change(fileInput(), { target: { files: [makeImageFile("big.jpg", 11_000)] } });
    await waitFor(() => expect(screen.getByText(/超过 10MB/)).toBeInTheDocument());
    expect(screen.queryByText(/\(1\/9\)/)).not.toBeInTheDocument();
  });

  it("标签：最多 5 个且自动去重", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("发布新内容")).toBeInTheDocument());
    const tagInput = screen.getByPlaceholderText(/输入标签后回车添加/) as HTMLInputElement;
    const addBtn = screen.getByRole("button", { name: "添加" });
    for (const t of ["A", "B", "C", "D", "E", "F", "A"]) {
      fireEvent.change(tagInput, { target: { value: t } });
      fireEvent.click(addBtn);
    }
    const chips = Array.from(document.querySelectorAll("span.rounded-full"))
      .map(s => s.textContent)
      .filter(t => /^#[A-F]$/.test(t || ""));
    expect(chips).toEqual(["#A", "#B", "#C", "#D", "#E"]);
  });

  it("移除标签", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("发布新内容")).toBeInTheDocument());
    const tagInput = screen.getByPlaceholderText(/输入标签后回车添加/) as HTMLInputElement;
    fireEvent.change(tagInput, { target: { value: "删除我" } });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));
    const chip = Array.from(document.querySelectorAll("span.rounded-full"))
      .find(s => s.textContent === "#删除我")!;
    fireEvent.click(chip.querySelector("button")!);
    expect(screen.queryByText("#删除我")).not.toBeInTheDocument();
  });

  it("发布成功：上传→建帖（变体进 thumbs）→清草稿→跳转首页", async () => {
    (apiModule.api.upload as ReturnType<typeof vi.fn>).mockResolvedValue({
      url: "/uploads/u1.jpg", thumb: "/uploads/u1_w400.jpg",
      variants: [{ url: "/uploads/u1_w400.jpg", width: 400 }, { url: "/uploads/u1_w800.jpg", width: 800 }],
      width: 1000, height: 800,
    });
    (apiModule.api.createPost as ReturnType<typeof vi.fn>).mockResolvedValue({
      post: {
        id: 99, title: "发布帖", description: "", board: "food",
        images: ["/uploads/u1.jpg"], thumbs: ["/uploads/u1_w400.jpg"], sizes: [{ w: 1000, h: 800 }],
        tags: [], author_id: 1, author_nickname: "糖小颜", author_avatar: "/a.svg",
        like_count: 0, collect_count: 0, comment_count: 0, created_at: "2026-01-01",
      },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText("发布新内容")).toBeInTheDocument());
    fireEvent.change(fileInput(), { target: { files: [makeImageFile("a.jpg", 10)] } });
    await waitFor(() => expect(countLabel(1)).toBeInTheDocument());
    fireEvent.change(titleInput(), { target: { value: "发布帖" } });
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => expect(apiModule.api.createPost).toHaveBeenCalled(), { timeout: 8000 });
    const body = (apiModule.api.createPost as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.title).toBe("发布帖");
    expect(body.images).toEqual(["/uploads/u1.jpg"]);
    expect(body.thumbs).toEqual(["/uploads/u1_w400.jpg"]);
    await waitFor(() => expect(screen.getByText("已跳转首页")).toBeInTheDocument());
    expect(apiModule.api.deleteMyDraft).toHaveBeenCalled();
  });

  it("服务端草稿优先回填", async () => {
    (apiModule.api.getMyDraft as ReturnType<typeof vi.fn>).mockResolvedValue({
      draft: { title: "草稿标题", board: "美食菜谱", tags: ["夜宵"] },
    });
    renderPage();
    await waitFor(() => expect(titleInput().value).toBe("草稿标题"));
    expect(screen.getByText("#夜宵")).toBeInTheDocument();
  });

  it("设为封面：第二张图移到首位", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("发布新内容")).toBeInTheDocument());
    fireEvent.change(fileInput(), {
      target: { files: [makeImageFile("a.jpg", 10), makeImageFile("b.jpg", 20)] },
    });
    await waitFor(() => expect(countLabel(2)).toBeInTheDocument());
    const before = gridPreviews().map(i => i.src);
    expect(before.length).toBe(2);
    // 第二张上的「设为封面」按钮
    fireEvent.click(screen.getByText("设为封面"));
    await waitFor(() => {
      expect(gridPreviews().map(i => i.src)).toEqual([before[1], before[0]]);
    });
  });

  it("删除图片后回到空上传区", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("发布新内容")).toBeInTheDocument());
    fireEvent.change(fileInput(), { target: { files: [makeImageFile("a.jpg", 10)] } });
    await waitFor(() => expect(countLabel(1)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("删除第 1 张图片"));
    await waitFor(() => expect(screen.getByText("点击或拖拽上传图片")).toBeInTheDocument());
  });
});
