import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MasonryGrid } from "./MasonryGrid";
import { AuthProvider } from "../context/AuthContext";
import { CollectionProvider } from "../context/CollectionContext";
import { ToastProvider } from "../context/ToastContext";
import type { ImageCard } from "../data/images";

vi.mock("../api", () => ({
  AUTH_EXPIRED_EVENT: "duitang:auth-expired",
  AuthExpiredError: class extends Error {},
  api: {
    me: vi.fn().mockResolvedValue({ user: null }),
    myInteractions: vi.fn().mockResolvedValue({ liked: [], collected: [], following: [] }),
    myPosts: vi.fn().mockResolvedValue({ posts: [] }),
    myCollects: vi.fn().mockResolvedValue({ posts: [] }),
    myLikes: vi.fn().mockResolvedValue({ posts: [] }),
    likePost: vi.fn(),
    collectPost: vi.fn(),
    followUser: vi.fn(),
    unfollowUser: vi.fn(),
    getComments: vi.fn().mockResolvedValue({ comments: [], total: 0 }),
    getCommentReplies: vi.fn().mockResolvedValue({ comments: [], total: 0 }),
  },
}));

function makeCard(id: number): ImageCard {
  return {
    id,
    src: `/uploads/${id}.jpg`,
    thumb: `/uploads/${id}.jpg`,
    title: `卡片 ${id}`,
    author: "作者",
    avatar: "/a.svg",
    likes: id,
    collects: 0,
    tags: [],
    width: 400,
    height: 300 + (id % 5) * 60,
    board: "food",
    category: "美食菜谱",
    images: [],
    description: "",
    date: "",
  } as ImageCard;
}

const cards = Array.from({ length: 30 }, (_, i) => makeCard(i + 1));

function renderGrid(list: ImageCard[]) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <CollectionProvider>
            <MasonryGrid cards={list} onCardClick={() => {}} />
          </CollectionProvider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe("MasonryGrid", () => {
  beforeEach(() => vi.clearAllMocks());

  it("jsdom（宽度 0）下回退普通流，渲染全部卡片", () => {
    renderGrid(cards);
    const grid = screen.getByTestId("masonry-grid");
    expect(grid.dataset.virtual).toBe("0");
    // 普通流模式下 30 张卡片全部在 DOM 中
    expect(document.querySelectorAll(".break-inside-avoid").length).toBe(30);
  });

  it("容器有宽度时启用虚拟模式（绝对定位 + data-vitem）", async () => {
    renderGrid(cards);
    const grid = screen.getByTestId("masonry-grid");
    // jsdom offsetWidth 恒为 0，注入宽度后触发 resize 让组件重新测量
    Object.defineProperty(grid, "offsetWidth", { value: 1200, configurable: true });
    window.dispatchEvent(new Event("resize"));
    await vi.waitFor(() => expect(grid.dataset.virtual).toBe("1"), { timeout: 2000 });
    // 虚拟模式下 DOM 卡片数少于总数（视口 + overscan 裁剪）
    expect(document.querySelectorAll(".break-inside-avoid").length).toBeLessThan(30);
  });

  it("空列表不崩溃", () => {
    renderGrid([]);
    expect(screen.getByTestId("masonry-grid")).toBeInTheDocument();
  });
});
