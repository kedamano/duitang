import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { ToastProvider } from "../context/ToastContext";
import NotificationBell from "./NotificationBell";
import * as apiModule from "../api";

vi.mock("../api", () => ({
  AUTH_EXPIRED_EVENT: "duitang:auth-expired",
  AuthExpiredError: class extends Error {},
  api: {
    me: vi.fn(),
    getUnreadCount: vi.fn(),
    getNotifications: vi.fn(),
    markNotificationsRead: vi.fn(),
  },
}));

function renderBell() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <NotificationBell />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("NotificationBell", () => {
  it("未登录时不渲染铃铛", () => {
    renderBell();
    expect(screen.queryByRole("button", { name: /通知/ })).not.toBeInTheDocument();
  });

  it("有未读时显示角标数字", async () => {
    localStorage.setItem("duitang_token", "T");
    (apiModule.api.me as any).mockResolvedValue({
      user: { id: 1, username: "u", nickname: "我", avatar: "a.svg", bio: "" },
      stats: { posts: 0, followers: 0, following: 0, collects: 0 },
    });
    (apiModule.api.getUnreadCount as any).mockResolvedValue({ count: 3 });

    renderBell();
    const badge = await screen.findByTestId("unread-badge");
    expect(badge).toHaveTextContent("3");
  });

  it("未读数超过 99 显示 99+", async () => {
    localStorage.setItem("duitang_token", "T");
    (apiModule.api.me as any).mockResolvedValue({
      user: { id: 1, username: "u", nickname: "我", avatar: "a.svg", bio: "" },
      stats: { posts: 0, followers: 0, following: 0, collects: 0 },
    });
    (apiModule.api.getUnreadCount as any).mockResolvedValue({ count: 120 });

    renderBell();
    expect(await screen.findByTestId("unread-badge")).toHaveTextContent("99+");
  });

  it("打开面板会加载列表、显示文案并标记已读", async () => {
    localStorage.setItem("duitang_token", "T");
    (apiModule.api.me as any).mockResolvedValue({
      user: { id: 1, username: "u", nickname: "我", avatar: "a.svg", bio: "" },
      stats: { posts: 0, followers: 0, following: 0, collects: 0 },
    });
    (apiModule.api.getUnreadCount as any).mockResolvedValue({ count: 1 });
    (apiModule.api.getNotifications as any).mockResolvedValue({
      notifications: [{
        id: 7, type: "like", is_read: false, created_at: "", post_id: 42, comment_id: null,
        actor: { id: 2, nickname: "小兔", avatar: "b.svg" },
        post_title: "我的帖子", post_cover: "", comment_excerpt: "",
      }],
      total: 1, unread: 1, page: 1, limit: 20,
    });
    (apiModule.api.markNotificationsRead as any).mockResolvedValue({ ok: true, unread: 0 });

    renderBell();
    await screen.findByTestId("unread-badge");
    await userEvent.click(screen.getByRole("button", { name: /通知/ }));

    expect(await screen.findByText("小兔")).toBeInTheDocument();
    expect(screen.getByText(/赞了你的帖子/)).toBeInTheDocument();
    await waitFor(() => expect(apiModule.api.markNotificationsRead).toHaveBeenCalled());
  });

  it("无通知时显示空态", async () => {
    localStorage.setItem("duitang_token", "T");
    (apiModule.api.me as any).mockResolvedValue({
      user: { id: 1, username: "u", nickname: "我", avatar: "a.svg", bio: "" },
      stats: { posts: 0, followers: 0, following: 0, collects: 0 },
    });
    (apiModule.api.getUnreadCount as any).mockResolvedValue({ count: 0 });
    (apiModule.api.getNotifications as any).mockResolvedValue({ notifications: [], total: 0, unread: 0, page: 1, limit: 20 });

    renderBell();
    await waitFor(() => expect(apiModule.api.getUnreadCount).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: /通知/ }));
    expect(await screen.findByText("还没有新消息")).toBeInTheDocument();
  });
});
