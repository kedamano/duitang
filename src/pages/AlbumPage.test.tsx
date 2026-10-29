import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import AlbumPage from "./AlbumPage";
import { ToastProvider } from "../context/ToastContext";
import * as apiModule from "../api";

vi.mock("../api", () => ({
  AUTH_EXPIRED_EVENT: "duitang:auth-expired",
  AuthExpiredError: class extends Error {},
  api: {
    getAlbum: vi.fn(),
    removePostFromAlbum: vi.fn(),
    deleteAlbum: vi.fn(),
  },
}));

// MasonryGrid 依赖 Auth/Collection，用轻量替身隔离
vi.mock("../components/MasonryGrid", () => ({
  MasonryGrid: ({ cards, onCardClick }: any) => (
    <div data-testid="grid-stub">
      {cards.map((c: any) => (
        <button key={c.id} onClick={() => onCardClick(c)}>卡{c.title}</button>
      ))}
    </div>
  ),
  MasonrySkeleton: () => <div>skeleton</div>,
}));
vi.mock("../components/PostDetail", () => ({
  PostDetailModal: ({ card, onClose }: any) => (
    <div data-testid="detail-modal">
      详情:{card.title}
      <button onClick={onClose}>关闭详情</button>
    </div>
  ),
}));

const albumPayload = (over = {}) => ({
  album: { id: 7, title: "我的壁纸集", description: "好看的都在这", is_public: true },
  owner: { id: 1, nickname: "糖小颜", avatar: "/a.svg" },
  owned_by_me: true,
  posts: [
    {
      id: 11, title: "图一", description: "", board: "wallpaper",
      images: ["/uploads/1.jpg"], thumbs: ["/uploads/1.jpg"], sizes: [{ w: 400, h: 300 }],
      tags: [], author_id: 1, author_nickname: "糖小颜", author_avatar: "/a.svg",
      like_count: 0, collect_count: 0, comment_count: 0, created_at: "2026-01-01",
    },
    {
      id: 12, title: "图二", description: "", board: "wallpaper",
      images: ["/uploads/2.jpg"], thumbs: ["/uploads/2.jpg"], sizes: [{ w: 400, h: 300 }],
      tags: [], author_id: 1, author_nickname: "糖小颜", author_avatar: "/a.svg",
      like_count: 0, collect_count: 0, comment_count: 0, created_at: "2026-01-02",
    },
  ],
  total: 2,
  ...over,
});

function renderAt(id = "7") {
  return render(
    <MemoryRouter initialEntries={[`/album/${id}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/album/:id" element={<AlbumPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (apiModule.api.getAlbum as ReturnType<typeof vi.fn>).mockResolvedValue(albumPayload());
  (apiModule.api.removePostFromAlbum as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
  (apiModule.api.deleteAlbum as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
});

describe("AlbumPage", () => {
  it("渲染专辑头与图片网格", async () => {
    renderAt();
    await waitFor(() => expect(screen.getByTestId("album-header")).toBeInTheDocument());
    expect(screen.getByText("我的壁纸集")).toBeInTheDocument();
    expect(screen.getByText("好看的都在这")).toBeInTheDocument();
    expect(screen.getByText("2 张图片")).toBeInTheDocument();
    expect(screen.getByText("糖小颜")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("grid-stub")).toBeInTheDocument());
    expect(screen.getByText("卡图一")).toBeInTheDocument();
  });

  it("非法 id 显示不存在", async () => {
    renderAt("abc");
    await waitFor(() => expect(screen.getByText("专辑不存在或已被删除")).toBeInTheDocument());
  });

  it("私密专辑（403）显示私密提示", async () => {
    (apiModule.api.getAlbum as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("该专辑是私密的"));
    renderAt();
    await waitFor(() => expect(screen.getByText("该专辑为私密，无法查看")).toBeInTheDocument());
  });

  it("非本人不显示删除入口", async () => {
    (apiModule.api.getAlbum as ReturnType<typeof vi.fn>).mockResolvedValue(albumPayload({ owned_by_me: false }));
    renderAt();
    await waitFor(() => expect(screen.getByTestId("grid-stub")).toBeInTheDocument());
    expect(screen.queryByText("删除专辑")).not.toBeInTheDocument();
  });

  it("本人可移出图片：调接口并即时更新列表与计数", async () => {
    renderAt();
    await waitFor(() => expect(screen.getByText("卡图一")).toBeInTheDocument());
    fireEvent.click(screen.getByText("卡图一"));
    await waitFor(() => expect(screen.getByTestId("detail-modal")).toBeInTheDocument());
    fireEvent.click(screen.getByText(/从专辑移出《图一》/));
    await waitFor(() => expect(apiModule.api.removePostFromAlbum).toHaveBeenCalledWith(7, 11));
    await waitFor(() => expect(screen.queryByText("卡图一")).not.toBeInTheDocument());
    expect(screen.getByText("1 张图片")).toBeInTheDocument();
  });

  it("空专辑显示空状态", async () => {
    (apiModule.api.getAlbum as ReturnType<typeof vi.fn>).mockResolvedValue(albumPayload({ posts: [], total: 0 }));
    renderAt();
    await waitFor(() => expect(screen.getByText("这个专辑还是空的")).toBeInTheDocument());
  });

  it("删除专辑确认后调用接口", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    renderAt();
    await waitFor(() => expect(screen.getByText("删除专辑")).toBeInTheDocument());
    fireEvent.click(screen.getByText("删除专辑"));
    await waitFor(() => expect(apiModule.api.deleteAlbum).toHaveBeenCalledWith(7));
    vi.unstubAllGlobals();
  });
});
