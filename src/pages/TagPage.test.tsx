import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { CollectionProvider } from "../context/CollectionContext";
import { ToastProvider } from "../context/ToastContext";
import TagPage from "./TagPage";
import * as apiModule from "../api";

vi.mock("../api", () => ({
  AUTH_EXPIRED_EVENT: "duitang:auth-expired",
  AuthExpiredError: class extends Error {},
  api: {
    me: vi.fn(),
    myInteractions: vi.fn().mockResolvedValue({ liked: [], collected: [], following: [] }),
    myPosts: vi.fn().mockResolvedValue({ posts: [] }),
    getPosts: vi.fn(),
    getTags: vi.fn(),
    getComments: vi.fn().mockResolvedValue({ comments: [] }),
  },
}));

const post = {
  id: 5,
  title: "汉服写真",
  images: ["/uploads/h.jpg"],
  tags: ["汉服"],
  board: "ancient",
  author_id: 2,
  author_nickname: "古风",
  author_avatar: "a.svg",
  sizes: [{ w: 400, h: 600 }],
};

function renderTag(tag: string) {
  return render(
    <MemoryRouter initialEntries={[`/tag/${encodeURIComponent(tag)}`]}>
      <ToastProvider>
        <AuthProvider>
          <CollectionProvider>
            <Routes>
              <Route path="/tag/:tag" element={<TagPage />} />
            </Routes>
          </CollectionProvider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  (apiModule.api.me as any).mockRejectedValue(new Error("no token"));
  (apiModule.api.getTags as any).mockResolvedValue({ tags: [{ tag: "汉服", count: 3 }, { tag: "古风", count: 1 }] });
});

describe("TagPage", () => {
  it("按标签拉取帖子并显示标题与总数", async () => {
    (apiModule.api.getPosts as any).mockResolvedValue({ posts: [post], total: 1, page: 1, limit: 20 });

    renderTag("汉服");
    expect(await screen.findByText("汉服写真")).toBeInTheDocument();
    expect(screen.getByText("共 1 张相关图片")).toBeInTheDocument();

    const params = (apiModule.api.getPosts as any).mock.calls[0][0];
    expect(params.tag).toBe("汉服");
  });

  it("空标签显示空状态与回首页入口", async () => {
    (apiModule.api.getPosts as any).mockResolvedValue({ posts: [], total: 0, page: 1, limit: 20 });

    renderTag("不存在的标签");
    expect(await screen.findByText(/还没有打了「不存在的标签」标签的图片/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /去首页逛逛/ })).toBeInTheDocument();
  });

  it("展示相关标签且排除当前标签", async () => {
    (apiModule.api.getPosts as any).mockResolvedValue({ posts: [post], total: 1, page: 1, limit: 20 });

    renderTag("汉服");
    await screen.findByText("汉服写真");
    const related = await screen.findByTestId("related-tags");
    // 只看"相关标签"区域，避免把卡片自身标签算进来
    const chips = Array.from(related.querySelectorAll("button")).map(b => b.textContent || "");
    expect(chips.some(t => t.includes("古风"))).toBe(true);
    expect(chips.some(t => t.startsWith("#汉服"))).toBe(false);
  });

  it("标签名含特殊字符时正确解码请求", async () => {
    (apiModule.api.getPosts as any).mockResolvedValue({ posts: [], total: 0, page: 1, limit: 20 });
    renderTag("少女 心");
    await waitFor(() => expect(apiModule.api.getPosts).toHaveBeenCalled());
    expect((apiModule.api.getPosts as any).mock.calls[0][0].tag).toBe("少女 心");
  });
});
