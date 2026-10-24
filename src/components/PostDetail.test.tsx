import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { CollectionProvider } from "../context/CollectionContext";
import { ToastProvider } from "../context/ToastContext";
import { PostDetailModal } from "./PostDetail";
import * as apiModule from "../api";
import type { ImageCard } from "../data/images";

vi.mock("../api", () => ({
  AUTH_EXPIRED_EVENT: "duitang:auth-expired",
  AuthExpiredError: class extends Error {},
  api: {
    me: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    myCollects: vi.fn().mockResolvedValue({ posts: [] }),
    myLikes: vi.fn().mockResolvedValue({ posts: [] }),
    myPosts: vi.fn().mockResolvedValue({ posts: [] }),
    myInteractions: vi.fn().mockResolvedValue({ liked: [], collected: [], following: [] }),
    myFollowing: vi.fn().mockResolvedValue({ ids: [] }),
    getComments: vi.fn(),
    addComment: vi.fn(),
    deleteComment: vi.fn(),
    likeComment: vi.fn(),
    likePost: vi.fn(),
    collectPost: vi.fn(),
    sharePost: vi.fn(),
    deletePost: vi.fn(),
    followUser: vi.fn(),
    getUserProfile: vi.fn(),
    searchUsers: vi.fn().mockResolvedValue({ users: [] }),
    updateMe: vi.fn(),
    upload: vi.fn(),
    getPost: vi.fn(),
    getPosts: vi.fn(),
    createPost: vi.fn(),
  },
}));

const ME = {
  user: { id: 1, username: "me", nickname: "我自己", avatar: "a.svg", bio: "" },
  stats: { posts: 0, followers: 0, following: 0, collects: 0 },
};

function makeCard(over: Partial<ImageCard> = {}): ImageCard {
  return {
    id: 42, title: "测试帖", src: "/uploads/x.jpg", width: 400, height: 300,
    author: "我自己", authorId: 1, avatar: "a.svg", likes: 10, collects: 5,
    comments: 1, tags: [], category: "wallpaper", images: ["/uploads/x.jpg"],
    ...over,
  };
}

function renderModal(card: ImageCard) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <CollectionProvider>
            <PostDetailModal card={card} onClose={() => {}} />
          </CollectionProvider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("duitang_token", "T");
  vi.clearAllMocks();
  (apiModule.api.me as any).mockResolvedValue(ME);
  (apiModule.api.myCollects as any).mockResolvedValue({ posts: [] });
  (apiModule.api.myLikes as any).mockResolvedValue({ posts: [] });
  (apiModule.api.myPosts as any).mockResolvedValue({ posts: [] });
  (apiModule.api.myFollowing as any).mockResolvedValue({ ids: [] });
  (apiModule.api.getComments as any).mockResolvedValue({
    comments: [{
      id: 7, post_id: 42, content: "已有的历史评论", author_id: 2,
      author_nickname: "路人", author_avatar: "b.svg", likes_count: 0, is_liked: false,
      created_at: "2026-10-01 10:00:00",
    }],
  });
});

describe("PostDetailModal 回归", () => {
  it("打开时从后端加载评论并渲染（缺陷3）", async () => {
    renderModal(makeCard());
    await waitFor(() => expect(apiModule.api.getComments).toHaveBeenCalledWith(42));
    expect(await screen.findByText("已有的历史评论")).toBeInTheDocument();
    expect(screen.getByText("路人")).toBeInTheDocument();
  });

  it("点赞显示服务端绝对计数，不叠加虚高（缺陷2）", async () => {
    (apiModule.api.likePost as any).mockResolvedValue({ liked: true, count: 11 });
    renderModal(makeCard({ likes: 10, authorId: 999 }));
    // "+ 关注" 仅在用户信息加载完成后渲染，作为同步点
    await screen.findByText("+ 关注");
    const likeBtn = screen.getByRole("button", { name: /10/ });
    await userEvent.click(likeBtn);
    await waitFor(() => expect(screen.getByRole("button", { name: /11/ })).toBeInTheDocument());
    // 10 + 11 = 21 是旧实现的错误结果
    expect(screen.queryByText("21")).not.toBeInTheDocument();
  });

  it("作者按 id 判定：自己的帖子显示删除，他人帖子不显示（缺陷6）", async () => {
    const { unmount } = renderModal(makeCard({ authorId: 1 }));
    expect(await screen.findByRole("button", { name: "删除" })).toBeInTheDocument();
    unmount();

    // 昵称与当前用户相同但 id 不同：旧实现按昵称比较会误显示删除入口
    renderModal(makeCard({ authorId: 999, author: "我自己" }));
    await screen.findByText("+ 关注"); // 用户信息加载完成的同步点
    expect(screen.queryByRole("button", { name: "删除" })).not.toBeInTheDocument();
  });

  it("评论删除按 author_id 判定（缺陷7）", async () => {
    // 评论 author_id=2 ≠ 当前用户 id=1 → 无删除入口
    const { unmount } = renderModal(makeCard({ authorId: 999 }));
    await screen.findByText("已有的历史评论");
    await screen.findByText("+ 关注");
    expect(screen.queryByText("删除", { selector: ".group\\/comment *" })).not.toBeInTheDocument();
    unmount();

    // 自己的评论（author_id=1）应出现删除按钮（hover 才可见，但 DOM 中存在）
    (apiModule.api.getComments as any).mockResolvedValue({
      comments: [{
        id: 8, post_id: 42, content: "我自己的评论", author_id: 1,
        author_nickname: "我自己", author_avatar: "a.svg", likes_count: 0, is_liked: false,
        created_at: "2026-10-01 10:00:00",
      }],
    });
    renderModal(makeCard({ authorId: 999 }));
    await screen.findByText("我自己的评论");
    await screen.findByText("+ 关注");
    expect(screen.getByText("删除", { selector: ".group\\/comment *" })).toBeInTheDocument();
  });
});
