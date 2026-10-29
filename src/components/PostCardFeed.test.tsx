import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PostCardFeed, { PostCard } from "./PostCardFeed";
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
    myCollects: vi.fn().mockResolvedValue({ posts: [] }),
    myLikes: vi.fn().mockResolvedValue({ posts: [] }),
    likePost: vi.fn().mockResolvedValue({ liked: true, count: 3 }),
    collectPost: vi.fn().mockResolvedValue({ collected: true, count: 9 }),
    getComments: vi.fn().mockResolvedValue({ comments: [], total: 0 }),
    getCommentReplies: vi.fn().mockResolvedValue({ comments: [], total: 0 }),
  },
}));

const meUser = {
  id: 1, username: "tangyan", nickname: "糖小颜", avatar: "/a.svg",
  bio: "", posts: 1, followers: 0, following: 0, collections: 0,
};

function card(over = {}) {
  return {
    id: 1, title: "黑色系壁纸", src: "/u/1.jpg",
    images: ["/u/1.jpg", "/u/2.jpg", "/u/3.jpg"], thumbs: ["/u/1.jpg", "/u/2.jpg", "/u/3.jpg"],
    thumb: "/u/1.jpg", width: 400, height: 400,
    author: "Zhcir", authorId: 2, avatar: "/b.svg",
    likes: 2037, collects: 6561, category: "wallpaper", tags: [],
    date: "2026-01-01 00:00:00", ...over,
  } as never;
}

function renderCard(c = card(), onOpen = vi.fn()) {
  render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <CollectionProvider>
            <PostCard card={c} onOpen={onOpen} />
          </CollectionProvider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
  return onOpen;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("duitang_token", "T");
  vi.clearAllMocks();
  (apiModule.api.me as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: meUser, stats: { posts: 1, followers: 0, following: 0, collects: 0 },
  });
});

describe("PostCard 整版帖子卡", () => {
  it("渲染作者头、标题与三栏操作条", async () => {
    renderCard();
    await waitFor(() => expect(screen.getByTestId("post-card")).toBeInTheDocument());
    expect(screen.getByText("Zhcir")).toBeInTheDocument();
    expect(screen.getByText("黑色系壁纸")).toBeInTheDocument();
    // 点赞 / 收集 / 更多
    expect(screen.getByLabelText("点赞")).toBeInTheDocument();
    expect(screen.getByLabelText("收集")).toBeInTheDocument();
    expect(screen.getByLabelText("查看更多")).toBeInTheDocument();
    // 初始计数来自卡片数据
    expect(screen.getByLabelText("点赞").textContent).toContain("2037");
    expect(screen.getByLabelText("收集").textContent).toContain("6561");
  });

  it("多图渲染 3 列方图网格，点击任意图打开详情", async () => {
    const onOpen = renderCard();
    await waitFor(() => expect(screen.getByTestId("post-card")).toBeInTheDocument());
    const grid = document.querySelector(".grid.grid-cols-3.gap-2");
    expect(grid).toBeTruthy();
    expect(grid!.querySelectorAll("img").length).toBe(3);
    fireEvent.click(grid!.querySelector("button")!);
    expect(onOpen).toHaveBeenCalled();
  });

  it("单图限宽展示（不强塞 3 列方图网格导致变形）", async () => {
    renderCard(card({ images: ["/u/only.jpg"], thumbs: ["/u/only.jpg"] }));
    await waitFor(() => expect(screen.getByTestId("post-card")).toBeInTheDocument());
    // 方图网格的特征类是 aspect-square；单图模式不应出现
    expect(document.querySelector(".aspect-square")).toBeFalsy();
    expect(screen.getAllByRole("img").length).toBeGreaterThanOrEqual(1);
  });

  it("点点赞调用 likePost 并切换激活态", async () => {
    renderCard();
    await waitFor(() => expect(screen.getByTestId("post-card")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("点赞"));
    await waitFor(() => expect(apiModule.api.likePost).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.getByLabelText("取消点赞")).toBeInTheDocument());
  });

  it("未登录点赞弹登录引导而非请求接口", async () => {
    localStorage.removeItem("duitang_token");
    (apiModule.api.me as ReturnType<typeof vi.fn>).mockResolvedValue({ user: null });
    renderCard();
    await waitFor(() => expect(screen.getByTestId("post-card")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("点赞"));
    expect(apiModule.api.likePost).not.toHaveBeenCalled();
    // AuthContext 打开登录弹窗（showLogin 为 true）—— 以不请求接口为准断言
  });

  it("点标题打开详情", async () => {
    const onOpen = renderCard();
    await waitFor(() => expect(screen.getByTestId("post-card")).toBeInTheDocument());
    fireEvent.click(screen.getByText("黑色系壁纸"));
    expect(onOpen).toHaveBeenCalled();
  });

  it("无标题时不渲染标题块", async () => {
    renderCard(card({ title: "" }));
    await waitFor(() => expect(screen.getByTestId("post-card")).toBeInTheDocument());
    expect(screen.queryByText("黑色系壁纸")).not.toBeInTheDocument();
  });
});

describe("PostCardFeed", () => {
  it("渲染多张帖子卡", () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <AuthProvider>
            <CollectionProvider>
              <PostCardFeed
                cards={[card({ id: 1 }), card({ id: 2, title: "第二帖" })]}
                onOpen={() => {}}
              />
            </CollectionProvider>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );
    expect(screen.getAllByTestId("post-card").length).toBe(2);
    expect(screen.getByText("第二帖")).toBeInTheDocument();
  });
});
