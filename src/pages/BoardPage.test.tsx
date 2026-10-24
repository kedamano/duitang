import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { CollectionProvider } from "../context/CollectionContext";
import { ToastProvider } from "../context/ToastContext";
import BoardPage from "./BoardPage";
import * as apiModule from "../api";

vi.mock("../api", () => ({
  AUTH_EXPIRED_EVENT: "duitang:auth-expired",
  AuthExpiredError: class extends Error {},
  api: {
    me: vi.fn(),
    myInteractions: vi.fn().mockResolvedValue({ liked: [], collected: [], following: [] }),
    myPosts: vi.fn().mockResolvedValue({ posts: [] }),
    getPosts: vi.fn(),
    getComments: vi.fn().mockResolvedValue({ comments: [] }),
  },
}));

const post = {
  id: 7,
  title: "动漫风景插画",
  images: ["/uploads/x.jpg"],
  thumbs: ["/uploads/x_thumb.jpg"],
  tags: ["插画"],
  board: "anime",
  author_id: 2,
  author_nickname: "画师",
  author_avatar: "a.svg",
  sizes: [{ w: 400, h: 500 }],
};

function renderBoard(key: string) {
  return render(
    <MemoryRouter initialEntries={[`/board/${key}`]}>
      <ToastProvider>
        <AuthProvider>
          <CollectionProvider>
            <Routes>
              <Route path="/board/:key" element={<BoardPage />} />
            </Routes>
          </CollectionProvider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  (apiModule.api.me as any).mockRejectedValue(new Error("no token"));
});

describe("BoardPage", () => {
  it("按画板拉取并显示中文标题与总数", async () => {
    (apiModule.api.getPosts as any).mockResolvedValue({ posts: [post], total: 1, page: 1, limit: 20 });

    renderBoard("anime");
    expect(await screen.findByText("动漫风景插画")).toBeInTheDocument();
    expect(screen.getByText("动漫插画")).toBeInTheDocument();
    expect(screen.getByText("共 1 张图片")).toBeInTheDocument();
    expect((apiModule.api.getPosts as any).mock.calls[0][0].board).toBe("anime");
  });

  it("空画板显示空状态", async () => {
    (apiModule.api.getPosts as any).mockResolvedValue({ posts: [], total: 0, page: 1, limit: 20 });
    renderBoard("makeup");
    expect(await screen.findByText("这个画板还没有内容")).toBeInTheDocument();
  });

  it("展示其他画板切换入口且不含当前画板", async () => {
    (apiModule.api.getPosts as any).mockResolvedValue({ posts: [post], total: 1, page: 1, limit: 20 });
    renderBoard("anime");
    const switcher = await screen.findByTestId("board-switcher");
    const labels = Array.from(switcher.querySelectorAll("button")).map(b => b.textContent?.trim());
    expect(labels).toContain("美食菜谱");
    expect(labels).not.toContain("动漫插画");
  });

  it("卡片使用缩略图", async () => {
    (apiModule.api.getPosts as any).mockResolvedValue({ posts: [post], total: 1, page: 1, limit: 20 });
    renderBoard("anime");
    await screen.findByText("动漫风景插画");
    await waitFor(() => {
      const img = document.querySelector("main .break-inside-avoid img") as HTMLImageElement | null;
      expect(img?.getAttribute("src")).toBe("/uploads/x_thumb.jpg");
    });
  });
});
