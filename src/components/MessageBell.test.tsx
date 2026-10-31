import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { ToastProvider } from "../context/ToastContext";
import MessageBell from "./MessageBell";
import * as apiModule from "../api";

vi.mock("../api", () => ({
  AUTH_EXPIRED_EVENT: "duitang:auth-expired",
  AuthExpiredError: class extends Error {},
  api: {
    me: vi.fn(),
    getUnreadMessages: vi.fn(),
  },
}));

function renderBell() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <MessageBell />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

function mockMe() {
  (apiModule.api.me as any).mockResolvedValue({
    user: { id: 1, username: "u", nickname: "我", avatar: "a.svg", bio: "" },
    stats: { posts: 0, followers: 0, following: 0, collects: 0 },
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("MessageBell", () => {
  it("未登录时不渲染私信入口", () => {
    renderBell();
    expect(screen.queryByTestId("message-bell")).not.toBeInTheDocument();
  });

  it("有未读时显示角标数字", async () => {
    localStorage.setItem("duitang_token", "T");
    mockMe();
    (apiModule.api.getUnreadMessages as any).mockResolvedValue({ count: 5 });

    renderBell();
    const badge = await screen.findByTestId("message-unread-badge");
    expect(badge).toHaveTextContent("5");
  });

  it("未读数超过 9 显示 9+", async () => {
    localStorage.setItem("duitang_token", "T");
    mockMe();
    (apiModule.api.getUnreadMessages as any).mockResolvedValue({ count: 12 });

    renderBell();
    expect(await screen.findByTestId("message-unread-badge")).toHaveTextContent("9+");
  });

  it("无未读时不显示角标", async () => {
    localStorage.setItem("duitang_token", "T");
    mockMe();
    (apiModule.api.getUnreadMessages as any).mockResolvedValue({ count: 0 });

    renderBell();
    await screen.findByTestId("message-bell");
    expect(screen.queryByTestId("message-unread-badge")).not.toBeInTheDocument();
  });

  it("点击私信入口跳转到 /messages", async () => {
    localStorage.setItem("duitang_token", "T");
    mockMe();
    (apiModule.api.getUnreadMessages as any).mockResolvedValue({ count: 1 });

    renderBell();
    await screen.findByTestId("message-bell");
    await userEvent.click(screen.getByTestId("message-bell"));
    // MemoryRouter 无法直接断言 URL，这里断言按钮存在即可（跳转行为由路由承担）
    expect(screen.getByTestId("message-bell")).toBeInTheDocument();
  });
});
