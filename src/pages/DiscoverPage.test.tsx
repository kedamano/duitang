import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import DiscoverPage from "./DiscoverPage";
import { AuthProvider } from "../context/AuthContext";
import { CollectionProvider } from "../context/CollectionContext";
import { ToastProvider } from "../context/ToastContext";

const mockTrending = vi.hoisted(() => ({
  state: {
    data: {
      authors: [{ id: 2, nickname: "糖小兔", avatar: "/a.svg", post_count: 5, score: 42 }],
      tags: [{ tag: "穿搭", count: 3 }, { tag: "壁纸", count: 2 }],
      new_users: [{ id: 9, nickname: "新人甲", avatar: "/n.svg" }],
    } as unknown as null | { authors: never[]; tags: never[]; new_users: never[] },
    loading: false,
  },
}));

const trending = mockTrending.state.data;

vi.mock("../hooks/useTrending", () => ({
  useTrending: () => mockTrending.state,
}));

vi.mock("../api", () => ({
  AUTH_EXPIRED_EVENT: "duitang:auth-expired",
  AuthExpiredError: class extends Error {},
  api: {
    me: vi.fn().mockResolvedValue({ user: null }),
    myInteractions: vi.fn().mockResolvedValue({ liked: [], collected: [], following: [] }),
    myPosts: vi.fn().mockResolvedValue({ posts: [] }),
    myCollects: vi.fn().mockResolvedValue({ posts: [] }),
    myLikes: vi.fn().mockResolvedValue({ posts: [] }),
    followUser: vi.fn().mockResolvedValue({ following: true }),
    unfollowUser: vi.fn().mockResolvedValue({ following: false }),
    getComments: vi.fn().mockResolvedValue({ comments: [], total: 0 }),
    getCommentReplies: vi.fn().mockResolvedValue({ comments: [], total: 0 }),
    likePost: vi.fn(),
    collectPost: vi.fn(),
  },
}));

import { api as apiMock } from "../api";

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <CollectionProvider>
            <DiscoverPage />
          </CollectionProvider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe("DiscoverPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockTrending.state = { data: trending, loading: false };
  });

  it("渲染热门作者、话题与新人三个区块", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("trending-authors")).toBeInTheDocument());
    expect(screen.getByText("糖小兔")).toBeInTheDocument();
    expect(screen.getByTestId("trending-tags").textContent).toContain("#穿搭");
    expect(screen.getByTestId("trending-new-users").textContent).toContain("新人甲");
  });

  it("加载中显示占位", () => {
    mockTrending.state = { data: null, loading: true };
    renderPage();
    expect(screen.getByText("加载中...")).toBeInTheDocument();
  });

  it("无数据显示空状态", () => {
    mockTrending.state = { data: null, loading: false };
    renderPage();
    expect(screen.getByText("暂时没有可推荐的内容")).toBeInTheDocument();
  });

  it("未登录点关注弹出登录框而非请求接口", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("trending-authors")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "关注" }));
    expect(apiMock.followUser).not.toHaveBeenCalled();
  });
});
