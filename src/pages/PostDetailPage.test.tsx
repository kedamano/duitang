import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import PostDetailPage from "./PostDetailPage";
import { AuthProvider } from "../context/AuthContext";
import { CollectionProvider } from "../context/CollectionContext";
import { ToastProvider } from "../context/ToastContext";
import { api } from "../api";
import * as prefetchModule from "../utils/prefetch";

vi.mock("../api", () => ({
  AUTH_EXPIRED_EVENT: "duitang:auth-expired",
  AuthExpiredError: class extends Error {},
  api: {
    me: vi.fn().mockResolvedValue({ user: null }),
    getPost: vi.fn(),
    getComments: vi.fn().mockResolvedValue({ comments: [], total: 0, hasMore: false }),
    getCommentReplies: vi.fn().mockResolvedValue({ comments: [], total: 0 }),
    myInteractions: vi.fn().mockResolvedValue({ liked: [], collected: [], following: [] }),
    myPosts: vi.fn().mockResolvedValue({ posts: [] }),
    myCollects: vi.fn().mockResolvedValue({ posts: [] }),
    myLikes: vi.fn().mockResolvedValue({ posts: [] }),
    likePost: vi.fn(),
    collectPost: vi.fn(),
    followUser: vi.fn(),
    unfollowUser: vi.fn(),
    sharePost: vi.fn(),
    deletePost: vi.fn(),
    getRelatedPosts: vi.fn().mockResolvedValue({ posts: [] }),
  },
}));

const mockPost = {
  id: 42,
  title: "预取详情帖",
  description: "正文",
  board: "food",
  images: ["/uploads/a.jpg"],
  thumbs: ["/uploads/a.jpg"],
  sizes: [{ w: 400, h: 300 }],
  tags: ["测试"],
  author_id: 2,
  author_nickname: "糖小兔",
  author_avatar: "/a.svg",
  like_count: 1,
  collect_count: 0,
  comment_count: 0,
  created_at: "2026-01-01 10:00:00",
};

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/pin/${id}`]}>
      <ToastProvider>
        <AuthProvider>
          <CollectionProvider>
            <Routes>
              <Route path="/pin/:id" element={<PostDetailPage />} />
            </Routes>
          </CollectionProvider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe("PostDetailPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.spyOn(prefetchModule, "takePrefetchedPost").mockReturnValue(null);
    (api.getPost as ReturnType<typeof vi.fn>).mockResolvedValue({ post: mockPost });
  });

  it("加载后渲染帖子标题", async () => {
    renderAt("42");
    await waitFor(() => expect(screen.getByText("预取详情帖")).toBeInTheDocument());
    expect(api.getPost).toHaveBeenCalledWith(42);
  });

  it("hover 预取命中时不再请求接口", async () => {
    vi.mocked(prefetchModule.takePrefetchedPost).mockReturnValue(mockPost as never);
    renderAt("42");
    await waitFor(() => expect(screen.getByText("预取详情帖")).toBeInTheDocument());
    expect(api.getPost).not.toHaveBeenCalled();
  });

  it("接口失败显示错误态", async () => {
    (api.getPost as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    renderAt("42");
    await waitFor(() => expect(screen.getByText(/加载失败/)).toBeInTheDocument());
  });

  it("帖子不存在显示删除提示", async () => {
    (api.getPost as ReturnType<typeof vi.fn>).mockResolvedValue({ post: null });
    renderAt("999");
    await waitFor(() => expect(screen.getByText(/不存在或已被删除/)).toBeInTheDocument());
  });

  it("非法 id 直接判为不存在", async () => {
    renderAt("abc");
    await waitFor(() => expect(screen.getByText(/不存在或已被删除/)).toBeInTheDocument());
    expect(api.getPost).not.toHaveBeenCalled();
  });
});
