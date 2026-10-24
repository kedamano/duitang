import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { CollectionProvider } from "../context/CollectionContext";
import { ToastProvider } from "../context/ToastContext";
import FollowListModal from "./FollowListModal";
import * as apiModule from "../api";

vi.mock("../api", () => ({
  AUTH_EXPIRED_EVENT: "duitang:auth-expired",
  AuthExpiredError: class extends Error {},
  api: {
    me: vi.fn(),
    myInteractions: vi.fn().mockResolvedValue({ liked: [], collected: [], following: [] }),
    myPosts: vi.fn().mockResolvedValue({ posts: [] }),
    getFollowers: vi.fn(),
    getFollowing: vi.fn(),
    followUser: vi.fn(),
  },
}));

const userA = { id: 2, username: "tangtu", nickname: "糖小兔", avatar: "b.svg", bio: "壁纸收集癖", is_following: false };

function renderModal(mode: "followers" | "following") {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <CollectionProvider>
            <FollowListModal userId={1} mode={mode} onClose={() => {}} />
          </CollectionProvider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  localStorage.setItem("duitang_token", "T");
  (apiModule.api.me as any).mockResolvedValue({
    user: { id: 1, username: "me", nickname: "我", avatar: "a.svg", bio: "" },
    stats: { posts: 0, followers: 0, following: 0, collects: 0 },
  });
});

describe("FollowListModal", () => {
  it("粉丝模式显示标题与列表", async () => {
    (apiModule.api.getFollowers as any).mockResolvedValue({ users: [userA], total: 1, page: 1, limit: 20 });
    renderModal("followers");
    expect(await screen.findByText("糖小兔")).toBeInTheDocument();
    expect(screen.getByText("粉丝（1）")).toBeInTheDocument();
    expect((apiModule.api.getFollowers as any).mock.calls[0][0]).toBe(1);
  });

  it("关注模式调用 following 接口", async () => {
    (apiModule.api.getFollowing as any).mockResolvedValue({ users: [userA], total: 1, page: 1, limit: 20 });
    renderModal("following");
    await screen.findByText("糖小兔");
    expect(screen.getByText("关注（1）")).toBeInTheDocument();
    expect(apiModule.api.getFollowing).toHaveBeenCalled();
    expect(apiModule.api.getFollowers).not.toHaveBeenCalled();
  });

  it("空列表显示空态", async () => {
    (apiModule.api.getFollowers as any).mockResolvedValue({ users: [], total: 0, page: 1, limit: 20 });
    renderModal("followers");
    expect(await screen.findByText("还没有粉丝")).toBeInTheDocument();
  });

  it("点击关注按钮调用 followUser", async () => {
    (apiModule.api.getFollowers as any).mockResolvedValue({ users: [userA], total: 1, page: 1, limit: 20 });
    (apiModule.api.followUser as any).mockResolvedValue({ following: true });
    renderModal("followers");
    await screen.findByText("糖小兔");
    await userEvent.click(screen.getByRole("button", { name: "关注" }));
    await waitFor(() => expect(apiModule.api.followUser).toHaveBeenCalledWith(2));
  });

  it("已关注的用户按钮显示已关注", async () => {
    (apiModule.api.getFollowers as any).mockResolvedValue({
      users: [{ ...userA, is_following: true }], total: 1, page: 1, limit: 20,
    });
    renderModal("followers");
    await screen.findByText("糖小兔");
    expect(screen.getByRole("button", { name: "已关注" })).toBeInTheDocument();
  });
});
