import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { ToastProvider } from "../context/ToastContext";
import MessagesPage from "./MessagesPage";
import * as apiModule from "../api";

vi.mock("../api", () => ({
  AUTH_EXPIRED_EVENT: "duitang:auth-expired",
  AuthExpiredError: class extends Error {},
  api: {
    me: vi.fn(),
    getConversations: vi.fn(),
    getMessages: vi.fn(),
    sendConvMessage: vi.fn(),
    sendUserMessage: vi.fn(),
    startConversationWith: vi.fn(),
    getUnreadMessages: vi.fn(),
  },
}));

function renderPage(initialEntry = "/messages") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ToastProvider>
        <AuthProvider>
          <MessagesPage />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

const CONV = {
  id: 1, last_message: "你好呀", last_sender_id: 2, last_at: "2024-01-01 00:00:00",
  other_id: 2, other_nickname: "小兔", other_avatar: "b.svg", other_username: "tangtu", unread: 2,
};

const MSG = {
  id: 10, sender_id: 2, content: "你好呀", created_at: "2024-01-01 00:00:00", is_read: 0,
  sender_nickname: "小兔", sender_avatar: "b.svg",
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("MessagesPage", () => {
  it("未登录时提示登录", async () => {
    renderPage();
    expect(await screen.findByText("登录后查看私信")).toBeInTheDocument();
  });

  it("登录后渲染会话列表", async () => {
    localStorage.setItem("duitang_token", "T");
    (apiModule.api.me as any).mockResolvedValue({
      user: { id: 1, username: "u", nickname: "我", avatar: "a.svg", bio: "" },
      stats: { posts: 0, followers: 0, following: 0, collects: 0 },
    });
    (apiModule.api.getConversations as any).mockResolvedValue({ conversations: [CONV] });

    renderPage();
    expect(await screen.findByText("小兔")).toBeInTheDocument();
    expect(screen.getByText("你好呀")).toBeInTheDocument();
  });

  it("选中会话后显示消息气泡", async () => {
    localStorage.setItem("duitang_token", "T");
    (apiModule.api.me as any).mockResolvedValue({
      user: { id: 1, username: "u", nickname: "我", avatar: "a.svg", bio: "" },
      stats: { posts: 0, followers: 0, following: 0, collects: 0 },
    });
    (apiModule.api.getConversations as any).mockResolvedValue({ conversations: [CONV] });
    (apiModule.api.getMessages as any).mockResolvedValue({ messages: [MSG], page: 1, limit: 20 });

    renderPage();
    await screen.findByText("小兔");
    await userEvent.click(screen.getByTestId("conversation-item"));

    const list = await screen.findByTestId("message-list");
    expect(list).toBeInTheDocument();
    expect(list.textContent).toContain("你好呀");
  });

  it("输入并发送消息会调用发送接口", async () => {
    localStorage.setItem("duitang_token", "T");
    (apiModule.api.me as any).mockResolvedValue({
      user: { id: 1, username: "u", nickname: "我", avatar: "a.svg", bio: "" },
      stats: { posts: 0, followers: 0, following: 0, collects: 0 },
    });
    (apiModule.api.getConversations as any).mockResolvedValue({ conversations: [CONV] });
    (apiModule.api.getMessages as any).mockResolvedValue({ messages: [MSG], page: 1, limit: 20 });
    (apiModule.api.sendConvMessage as any).mockResolvedValue({ id: 11, content: "hi", created: "" });

    renderPage();
    await screen.findByText("小兔");
    await userEvent.click(screen.getByTestId("conversation-item"));
    await waitFor(() => expect(screen.getByLabelText("私信内容")).toBeInTheDocument());

    const input = screen.getByLabelText("私信内容");
    await userEvent.type(input, "hi");
    await userEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(apiModule.api.sendConvMessage).toHaveBeenCalledWith(1, "hi"));
  });

  it("自己消息显示已读/已送达回执", async () => {
    localStorage.setItem("duitang_token", "T");
    (apiModule.api.me as any).mockResolvedValue({
      user: { id: 1, username: "u", nickname: "我", avatar: "a.svg", bio: "" },
      stats: { posts: 0, followers: 0, following: 0, collects: 0 },
    });
    (apiModule.api.getConversations as any).mockResolvedValue({ conversations: [CONV] });
    (apiModule.api.getMessages as any).mockResolvedValue({
      messages: [
        { id: 1, sender_id: 1, content: "我发的", created_at: "", is_read: 0, sender_nickname: "我", sender_avatar: "a.svg" },
        { id: 2, sender_id: 1, content: "已读的", created_at: "", is_read: 1, sender_nickname: "我", sender_avatar: "a.svg" },
        MSG,
      ], page: 1, limit: 20, hasMore: false, total: 3,
    });

    renderPage();
    await screen.findByText("小兔");
    await userEvent.click(screen.getByTestId("conversation-item"));
    const list = await screen.findByTestId("message-list");
    expect(list.textContent).toContain("已送达");
    expect(list.textContent).toContain("已读");
  });

  it("hasMore 时显示「加载更早的消息」按钮并点击加载", async () => {
    localStorage.setItem("duitang_token", "T");
    (apiModule.api.me as any).mockResolvedValue({
      user: { id: 1, username: "u", nickname: "我", avatar: "a.svg", bio: "" },
      stats: { posts: 0, followers: 0, following: 0, collects: 0 },
    });
    (apiModule.api.getConversations as any).mockResolvedValue({ conversations: [CONV] });
    (apiModule.api.getMessages as any).mockResolvedValue({ messages: [MSG], page: 1, limit: 20, hasMore: true, total: 25 });

    renderPage();
    await screen.findByText("小兔");
    await userEvent.click(screen.getByTestId("conversation-item"));
    const btn = await screen.findByText("加载更早的消息");
    expect(btn).toBeInTheDocument();
    await userEvent.click(btn);
    await waitFor(() => expect(apiModule.api.getMessages).toHaveBeenCalledWith(1, 2));
  });
});
