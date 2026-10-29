import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PostDetailModal } from "./PostDetail";
import { AuthProvider } from "../context/AuthContext";
import { CollectionProvider } from "../context/CollectionContext";
import { ToastProvider } from "../context/ToastContext";
import * as apiModule from "../api";

vi.mock("../api", () => ({
  AUTH_EXPIRED_EVENT: "duitang:auth-expired",
  AuthExpiredError: class extends Error {},
  api: {
    me: vi.fn().mockResolvedValue({ user: null, stats: {} }),
    myInteractions: vi.fn().mockResolvedValue({ liked: [], collected: [], following: [] }),
    myPosts: vi.fn().mockResolvedValue({ posts: [] }),
    myCollects: vi.fn().mockResolvedValue({ posts: [] }),
    myLikes: vi.fn().mockResolvedValue({ posts: [] }),
    getComments: vi.fn().mockResolvedValue({ comments: [], total: 0 }),
    getRelatedPosts: vi.fn(),
    likePost: vi.fn(),
    collectPost: vi.fn(),
    sharePost: vi.fn(),
    deletePost: vi.fn(),
    followUser: vi.fn(),
    getUserProfile: vi.fn(),
    updateMe: vi.fn(),
    upload: vi.fn(),
  },
}));

const card = {
  id: 5, title: "主帖", src: "/u/main.jpg", thumb: "/u/main.jpg",
  images: ["/u/main.jpg"], thumbs: ["/u/main.jpg"],
  width: 400, height: 400, author: "作者", authorId: 2, avatar: "/a.svg",
  likes: 10, collects: 2, category: "food", tags: [], description: "",
} as never;

function renderModal() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <CollectionProvider>
            <PostDetailModal card={card} onClose={() => {}} />
          </CollectionProvider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe("详情页相关推荐", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    (apiModule.api.me as ReturnType<typeof vi.fn>).mockResolvedValue({ user: null, stats: {} });
    (apiModule.api.getRelatedPosts as ReturnType<typeof vi.fn>).mockResolvedValue({ posts: [] });
  });

  it("无推荐时不渲染该区块", async () => {
    renderModal();
    await waitFor(() => expect(apiModule.api.getRelatedPosts).toHaveBeenCalledWith(5, 8));
    expect(screen.queryByTestId("related-posts")).not.toBeInTheDocument();
  });

  it("有推荐时渲染缩略图网格", async () => {
    (apiModule.api.getRelatedPosts as ReturnType<typeof vi.fn>).mockResolvedValue({
      posts: [
        { id: 11, title: "相关一", images: ["/u/r1.jpg"], thumbs: ["/u/r1.jpg"], sizes: [{ w: 400, h: 300 }], tags: [], author_id: 2, author_nickname: "作者", author_avatar: "/a.svg", likes_count: 0, collects_count: 0, created_at: "2026-01-01" },
        { id: 12, title: "相关二", images: ["/u/r2.jpg"], thumbs: ["/u/r2.jpg"], sizes: [{ w: 400, h: 300 }], tags: [], author_id: 3, author_nickname: "另一个", author_avatar: "/b.svg", likes_count: 0, collects_count: 0, created_at: "2026-01-01" },
      ],
    });
    renderModal();
    await waitFor(() => expect(screen.getByTestId("related-posts")).toBeInTheDocument());
    expect(screen.getByText("相关推荐")).toBeInTheDocument();
    expect(screen.getByLabelText("查看相关推荐《相关一》")).toBeInTheDocument();
    expect(screen.getByLabelText("查看相关推荐《相关二》")).toBeInTheDocument();
  });

  it("切换到其他帖子时重新请求推荐", async () => {
    const { rerender } = renderModal();
    await waitFor(() => expect(apiModule.api.getRelatedPosts).toHaveBeenCalledTimes(1));
    rerender(
      <MemoryRouter>
        <ToastProvider>
          <AuthProvider>
            <CollectionProvider>
              <PostDetailModal card={{ ...(card as object), id: 6 } as never} onClose={() => {}} />
            </CollectionProvider>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(apiModule.api.getRelatedPosts).toHaveBeenCalledWith(6, 8));
  });
});
