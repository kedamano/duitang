import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ProfilePage from "./ProfilePage";
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
    myCollects: vi.fn().mockResolvedValue({ posts: [], total: 0 }),
    myLikes: vi.fn().mockResolvedValue({ posts: [], total: 0 }),
    getUserAlbums: vi.fn().mockResolvedValue({ albums: [] }),
    getUserProfile: vi.fn(),
    getPosts: vi.fn().mockResolvedValue({ posts: [], total: 0 }),
    updateMe: vi.fn(),
    followUser: vi.fn().mockResolvedValue({ following: true }),
    unfollowUser: vi.fn().mockResolvedValue({ following: false }),
    likePost: vi.fn(),
    collectPost: vi.fn(),
    getComments: vi.fn().mockResolvedValue({ comments: [], total: 0 }),
    getCommentReplies: vi.fn().mockResolvedValue({ comments: [], total: 0 }),
  },
}));

const meUser = {
  id: 1, username: "tangyan", nickname: "糖小颜", avatar: "/a.svg",
  bio: "我是糖小颜", posts: 2, followers: 5, following: 3, collections: 0, is_admin: false,
};

const otherUser = {
  id: 2, username: "tangtu", nickname: "糖小兔", avatar: "/b.svg",
  bio: "小兔子的主页", posts: 1, followers: 8, following: 2, collections: 0,
};

function post(id: number, title: string) {
  return {
    id, title, description: "", board: "food",
    images: [`/uploads/${id}.jpg`], thumbs: [`/uploads/${id}.jpg`],
    sizes: [{ w: 400, h: 300 }], tags: [],
    author_id: 1, author_nickname: "糖小颜", author_avatar: "/a.svg",
    like_count: 0, collect_count: 0, comment_count: 0, created_at: "2026-01-01",
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <AuthProvider>
          <CollectionProvider>
            <Routes>
              <Route path="/profile" element={<ProfilePage />} />
            </Routes>
          </CollectionProvider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("duitang_token", "T");
  vi.clearAllMocks();
  (apiModule.api.me as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: meUser, stats: { posts: 2, followers: 5, following: 3, collects: 0 },
  });
  (apiModule.api.myPosts as ReturnType<typeof vi.fn>).mockResolvedValue({
    posts: [post(11, "我的发布一"), post(12, "我的发布二")],
  });
  (apiModule.api.myCollects as ReturnType<typeof vi.fn>).mockResolvedValue({ posts: [post(21, "收集图")], total: 1 });
  (apiModule.api.myLikes as ReturnType<typeof vi.fn>).mockResolvedValue({ posts: [post(31, "喜欢图")], total: 1 });
  (apiModule.api.updateMe as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { ...meUser, bio: "新简介" } });
});

describe("ProfilePage（本人视角）", () => {
  it("渲染资料卡与四个分组", async () => {
    renderAt("/profile");
    await waitFor(() => expect(screen.getByText("糖小颜")).toBeInTheDocument());
    expect(screen.getByText("@tangyan")).toBeInTheDocument();
    // 简介由 user 加载后的 effect 回填，等待其出现
    await waitFor(() => expect(screen.getByText(/我是糖小颜/)).toBeInTheDocument());
    for (const label of ["我的发布", "我的收集", "我的喜欢", "我的专辑"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("发布列表显示我的帖子", async () => {
    renderAt("/profile");
    await waitFor(() => expect(screen.getByText("我的发布一")).toBeInTheDocument());
    expect(screen.getByText("我的发布二")).toBeInTheDocument();
  });

  it("切换到收集分组显示收藏内容", async () => {
    renderAt("/profile");
    await waitFor(() => expect(screen.getByText("我的发布一")).toBeInTheDocument());
    fireEvent.click(screen.getByText("我的收集"));
    await waitFor(() => expect(screen.getByText("收集图")).toBeInTheDocument());
  });

  it("切换到喜欢分组显示点赞内容", async () => {
    renderAt("/profile");
    await waitFor(() => expect(screen.getByText("我的发布一")).toBeInTheDocument());
    fireEvent.click(screen.getByText("我的喜欢"));
    await waitFor(() => expect(screen.getByText("喜欢图")).toBeInTheDocument());
  });

  it("tab 查询参数直达收集分组", async () => {
    renderAt("/profile?tab=collection");
    await waitFor(() => expect(screen.getByText("收集图")).toBeInTheDocument());
  });

  it("行内编辑简介：保存调用 updateMe 并更新显示", async () => {
    renderAt("/profile");
    await waitFor(() => expect(screen.getByText(/我是糖小颜/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/我是糖小颜/));
    const input = document.querySelector('input[maxlength="100"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "新简介" } });
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => expect(apiModule.api.updateMe).toHaveBeenCalledWith({ bio: "新简介" }));
    await waitFor(() => expect(screen.getByText(/新简介/)).toBeInTheDocument());
  });

  it("专辑为空显示引导", async () => {
    renderAt("/profile");
    await waitFor(() => expect(screen.getByText("我的发布一")).toBeInTheDocument());
    fireEvent.click(screen.getByText("我的专辑"));
    await waitFor(() => expect(screen.getByText(/还没有专辑/)).toBeInTheDocument());
  });
});

describe("ProfilePage（他人视角与登录态）", () => {
  it("未登录且非他人页时显示登录引导", async () => {
    (apiModule.api.me as ReturnType<typeof vi.fn>).mockResolvedValue({ user: null });
    localStorage.removeItem("duitang_token");
    renderAt("/profile");
    await waitFor(() => expect(screen.getByText("请先登录")).toBeInTheDocument());
  });

  it("?user=2 查看他人主页：资料、TA的发布与关注按钮", async () => {
    (apiModule.api.getUserProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: otherUser, stats: { posts: 1, followers: 8, following: 2, collects: 0 }, is_following: false,
    });
    (apiModule.api.getPosts as ReturnType<typeof vi.fn>).mockResolvedValue({
      posts: [post(51, "小兔的帖")], total: 1,
    });
    renderAt("/profile?user=2");
    await waitFor(() => expect(screen.getByText("糖小兔")).toBeInTheDocument());
    expect(screen.getByText("小兔子的主页")).toBeInTheDocument();
    expect(screen.getByText("TA的发布")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("小兔的帖")).toBeInTheDocument());
    // 关注按钮存在且为未关注态
    fireEvent.click(screen.getByText("+ 关注"));
    await waitFor(() => expect(apiModule.api.followUser).toHaveBeenCalledWith(2));
  });
});
