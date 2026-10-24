import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { CommentItem } from "./PostDetail";
import type { Comment } from "../context/CollectionContext";

const baseComment: Comment = {
  id: 10,
  post_id: 1,
  content: "顶层评论内容",
  author_id: 2,
  author: "糖小兔",
  avatar: "b.svg",
  likes: 0,
  liked: false,
  created_at: "2026-10-24T00:00:00Z",
  parent_id: 0,
  reply_count: 2,
  replies: [
    {
      id: 11, post_id: 1, content: "第一条回复", author_id: 3, author: "麻薯",
      avatar: "c.svg", likes: 0, liked: false, created_at: "2026-10-24T00:01:00Z",
      parent_id: 10, reply_to_nickname: "糖小兔",
    },
    {
      id: 12, post_id: 1, content: "第二条回复", author_id: 4, author: "阿白",
      avatar: "d.svg", likes: 0, liked: false, created_at: "2026-10-24T00:02:00Z",
      parent_id: 10, reply_to_nickname: "糖小兔",
    },
  ],
};

function renderItem(overrides: Partial<Comment> = {}, props: any = {}) {
  const handlers = {
    onDelete: vi.fn(),
    onLike: vi.fn(),
    onLoadReplies: vi.fn(),
    onSubmitReply: vi.fn(),
    ...props,
  };
  render(
    <MemoryRouter>
      <CommentItem
        comment={{ ...baseComment, ...overrides }}
        currentUserId={1}
        canDelete={false}
        {...handlers}
      />
    </MemoryRouter>
  );
  return handlers;
}

/** 展开楼中楼（默认折叠） */
async function expandReplies() {
  const toggle = screen.getByRole("button", { name: /展开/ });
  await userEvent.click(toggle);
}

describe("CommentItem 楼中楼", () => {
  it("顶层评论渲染，回复默认折叠仅显示数量", () => {
    renderItem();
    expect(screen.getByText("顶层评论内容")).toBeInTheDocument();
    // 默认不渲染回复内容
    expect(screen.queryByText("第一条回复")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /展开 2 条回复/ })).toBeInTheDocument();
  });

  it("点击展开后显示回复内容", async () => {
    renderItem();
    await expandReplies();
    expect(screen.getByText("第一条回复")).toBeInTheDocument();
    expect(screen.getByText("第二条回复")).toBeInTheDocument();
    // 展开后按钮变为收起
    expect(screen.getByRole("button", { name: /收起回复/ })).toBeInTheDocument();
  });

  it("回复展示\"回复 @某人\"", async () => {
    renderItem();
    await expandReplies();
    expect(screen.getAllByText("@糖小兔").length).toBe(2);
  });

  it("回复数多于已加载时显示加载更多", async () => {
    const handlers = renderItem({ reply_count: 5 });
    await expandReplies();
    const more = screen.getByRole("button", { name: /加载更多回复/ });
    await userEvent.click(more);
    expect(handlers.onLoadReplies).toHaveBeenCalledWith(10);
  });

  it("回复数等于已加载时不显示加载更多", async () => {
    renderItem({ reply_count: 2 });
    await expandReplies();
    expect(screen.queryByRole("button", { name: /加载更多回复/ })).not.toBeInTheDocument();
  });

  it("点击顶层\"回复\"打开输入框并提交到该评论", async () => {
    const handlers = renderItem();
    await userEvent.click(screen.getByRole("button", { name: "回复" }));
    const input = screen.getByLabelText("回复内容");
    await userEvent.type(input, "我的新回复");
    await userEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(handlers.onSubmitReply).toHaveBeenCalledWith(10, "我的新回复");
  });

  it("展开后回复某条回复仍提交到顶层 id", async () => {
    const handlers = renderItem();
    await expandReplies();
    // 第一条回复的"回复"按钮
    const replyButtons = screen.getAllByRole("button", { name: "回复" });
    await userEvent.click(replyButtons[1]);
    const input = screen.getByLabelText("回复内容");
    expect(input).toHaveAttribute("placeholder", "回复 @麻薯");
    await userEvent.type(input, "回复回复");
    await userEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(handlers.onSubmitReply).toHaveBeenCalledWith(10, "回复回复");
  });

  it("空内容不触发提交", async () => {
    const handlers = renderItem();
    await userEvent.click(screen.getByRole("button", { name: "回复" }));
    await userEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(handlers.onSubmitReply).not.toHaveBeenCalled();
  });

  it("正文中的 @提及 渲染为可点击按钮", () => {
    renderItem({ content: "请大家看看 @麻薯 的作品" });
    const mention = screen.getByRole("button", { name: "@麻薯" });
    expect(mention).toBeInTheDocument();
    // 普通文本仍保留
    expect(screen.getByText(/请大家看看/)).toBeInTheDocument();
    expect(screen.getByText(/的作品/)).toBeInTheDocument();
  });

  it("没有回复时不显示展开按钮", () => {
    renderItem({ replies: [], reply_count: 0 });
    expect(screen.queryByRole("button", { name: /展开/ })).not.toBeInTheDocument();
  });
});
