import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { CollectionProvider } from "../context/CollectionContext";
import { ToastProvider } from "../context/ToastContext";
import HomePage from "./HomePage";
import * as apiModule from "../api";
import { FOLLOW_NAV } from "../data/images";

vi.mock("../api", () => ({
  AUTH_EXPIRED_EVENT: "duitang:auth-expired",
  AuthExpiredError: class extends Error {},
  api: {
    me: vi.fn(),
    getPosts: vi.fn().mockResolvedValue({ posts: [], total: 0, page: 1, limit: 20 }),
    getFollowingFeed: vi.fn().mockResolvedValue({ posts: [], total: 0, page: 1, limit: 20 }),
    myCollects: vi.fn().mockResolvedValue({ posts: [] }),
    myLikes: vi.fn().mockResolvedValue({ posts: [] }),
    myPosts: vi.fn().mockResolvedValue({ posts: [] }),
    myInteractions: vi.fn().mockResolvedValue({ liked: [], collected: [], following: [] }),
    myFollowing: vi.fn().mockResolvedValue({ ids: [] }),
    getComments: vi.fn().mockResolvedValue({ comments: [] }),
    searchUsers: vi.fn().mockResolvedValue({ users: [] }),
  },
}));

function renderHome(activeNav: string) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <CollectionProvider>
            <HomePage search="" onSearchChange={() => {}} activeNav={activeNav} onNavChange={() => {}} />
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
  (apiModule.api.getPosts as any).mockResolvedValue({ posts: [], total: 0, page: 1, limit: 20 });
  (apiModule.api.getFollowingFeed as any).mockResolvedValue({ posts: [], total: 0, page: 1, limit: 20 });
});

describe("HomePage 关注流", () => {
  it("未登录时显示登录引导且不调用关注流接口", async () => {
    renderHome(FOLLOW_NAV);
    expect(await screen.findByText("登录后即可查看关注内容")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "去登录" })).toBeInTheDocument();
    expect(apiModule.api.getFollowingFeed).not.toHaveBeenCalled();
  });

  it("登录且无关注时显示空状态与去首页入口", async () => {
    localStorage.setItem("duitang_token", "T");
    (apiModule.api.me as any).mockResolvedValue({
      user: { id: 1, username: "me", nickname: "我", avatar: "a.svg", bio: "" },
      stats: { posts: 0, followers: 0, following: 0, collects: 0 },
    });
    renderHome(FOLLOW_NAV);
    expect(await screen.findByText(/还没有关注任何人/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /去首页逛逛/ })).toBeInTheDocument();
    await waitFor(() => expect(apiModule.api.getFollowingFeed).toHaveBeenCalled());
  });

  it("关注流有内容时渲染卡片，且不回退到画板查询", async () => {
    localStorage.setItem("duitang_token", "T");
    (apiModule.api.me as any).mockResolvedValue({
      user: { id: 1, username: "me", nickname: "我", avatar: "a.svg", bio: "" },
      stats: { posts: 0, followers: 0, following: 0, collects: 0 },
    });
    (apiModule.api.getFollowingFeed as any).mockResolvedValue({
      posts: [{ id: 9, title: "关注流帖子", images: ["/uploads/a.jpg"], tags: [], board: "food", author_id: 2, author_nickname: "作者", likes_count: 3 }],
      total: 1, page: 1, limit: 20,
    });
    renderHome(FOLLOW_NAV);
    expect(await screen.findByText("关注流帖子")).toBeInTheDocument();
    expect(apiModule.api.getPosts).not.toHaveBeenCalled();
  });

  it("普通分类仍走 getPosts 且使用英文 board key", async () => {
    renderHome("动漫插画");
    await waitFor(() => expect(apiModule.api.getPosts).toHaveBeenCalled());
    expect((apiModule.api.getPosts as any).mock.calls[0][0].board).toBe("anime");
    expect(apiModule.api.getFollowingFeed).not.toHaveBeenCalled();
  });

  // 回归：首屏数据未返回时不应闪现"暂时没有找到相关内容"
  it("加载中显示骨架屏而非空状态提示", async () => {
    let resolvePosts: (v: unknown) => void = () => {};
    (apiModule.api.getPosts as any).mockReturnValue(new Promise(r => { resolvePosts = r; }));

    renderHome("推荐");
    expect(screen.getByTestId("masonry-skeleton")).toBeInTheDocument();
    expect(screen.queryByText(/暂时没有找到相关内容/)).not.toBeInTheDocument();

    resolvePosts({ posts: [], total: 0, page: 1, limit: 20 });
    await waitFor(() => expect(screen.queryByTestId("masonry-skeleton")).not.toBeInTheDocument());
    // 数据回来确实是空的，这时才允许显示空状态
    expect(await screen.findByText(/暂时没有找到相关内容/)).toBeInTheDocument();
  });
});
