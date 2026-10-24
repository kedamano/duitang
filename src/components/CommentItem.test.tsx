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

describe("CommentItem 楼中楼", () => {
  it("渲染顶层评论与内嵌回复", () => {
    renderItem();
    expect(screen.getByText("顶层评论内容")).toBeInTheDocument();
    expect(screen.getByText("第一条回复")).toBeInTheDocument();
    expect(screen.getByText("第二条回复")).toBeInTheDocument();
    // 回复展示"回复 @某人"
    expect(screen.getAllByText("@糖小兔").length).toBe(2);
  });

  it("回复数多于已加载时显示展开按钮", async () => {
    const handlers = renderItem({ reply_count: 5 });
    const more = screen.getByRole("button", { name: /展开更多回复（3）/ });
    await userEvent.click(more);
    expect(handlers.onLoadReplies).toHaveBeenCalledWith(10);
  });

  it("回复数等于已加载时不显示展开按钮", () => {
    renderItem({ reply_count: 2 });
    expect(screen.queryByRole("button", { name: /展开更多回复/ })).not.toBeInTheDocument();
  });

  it("点击回复打开输入框并提交到该顶层评论", async () => {
    const handlers = renderItem();
    await userEvent.click(screen.getAllByRole("button", { name: "回复" })[0]);
    const input = screen.getByLabelText("回复内容");
    await userEvent.type(input, "我的新回复");
    await userEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(handlers.onSubmitReply).toHaveBeenCalledWith(10, "我的新回复");
  });

  it("回复某条回复时仍提交到顶层评论 id", async () => {
    const handlers = renderItem();
    // 第二个"回复"按钮属于第一条回复（作者麻薯）
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
    await userEvent.click(screen.getAllByRole("button", { name: "回复" })[0]);
    await userEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(handlers.onSubmitReply).not.toHaveBeenCalled();
  });
});
