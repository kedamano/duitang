import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { CollectionProvider } from "../context/CollectionContext";
import { ToastProvider } from "../context/ToastContext";
import EditPostModal from "./EditPostModal";
import * as apiModule from "../api";
import type { ImageCard } from "../data/images";

vi.mock("../api", () => ({
  AUTH_EXPIRED_EVENT: "duitang:auth-expired",
  AuthExpiredError: class extends Error {},
  api: {
    me: vi.fn(),
    myInteractions: vi.fn().mockResolvedValue({ liked: [], collected: [], following: [] }),
    myPosts: vi.fn().mockResolvedValue({ posts: [] }),
    updatePost: vi.fn(),
  },
}));

const card: ImageCard = {
  id: 9,
  title: "原标题",
  src: "/uploads/a.jpg",
  width: 400,
  height: 500,
  author: "我",
  authorId: 1,
  avatar: "a.svg",
  likes: 0,
  collects: 0,
  category: "anime",
  tags: ["旧标签"],
  description: "原描述",
};

function renderModal(onSaved = vi.fn()) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <CollectionProvider>
            <EditPostModal card={card} onClose={() => {}} onSaved={onSaved} />
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
    user: { id: 1, username: "u", nickname: "我", avatar: "a.svg", bio: "" },
    stats: { posts: 0, followers: 0, following: 0, collects: 0 },
  });
});

describe("EditPostModal", () => {
  it("预填当前帖子的内容", async () => {
    renderModal();
    expect((screen.getByLabelText("标题") as HTMLInputElement).value).toBe("原标题");
    // 描述改用富文本编辑器，内容渲染在编辑器区域内
    const editor = await screen.findByTestId("rich-text-editor");
    await waitFor(() => expect(editor.textContent).toContain("原描述"));
    expect((screen.getByLabelText(/标签/) as HTMLInputElement).value).toBe("旧标签");
  });

  it("保存时提交标题/描述/标签/画板 key", async () => {
    (apiModule.api.updatePost as any).mockResolvedValue({ post: { ...card, title: "新标题" } });
    const onSaved = vi.fn();
    renderModal(onSaved);
    await screen.findByTestId("rich-text-editor");

    const title = screen.getByLabelText("标题");
    await userEvent.clear(title);
    await userEvent.type(title, "新标题");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(apiModule.api.updatePost).toHaveBeenCalled());
    const [id, payload] = (apiModule.api.updatePost as any).mock.calls[0];
    expect(id).toBe(9);
    expect(payload.title).toBe("新标题");
    expect(payload.tags).toEqual(["旧标签"]);
    expect(payload.board).toBe("anime");
    // 描述以 HTML 形式提交，且保留原文
    expect(payload.description).toContain("原描述");
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("标签支持逗号分隔与 # 前缀清理", async () => {
    (apiModule.api.updatePost as any).mockResolvedValue({ post: card });
    renderModal();

    const tags = screen.getByLabelText(/标签/);
    await userEvent.clear(tags);
    await userEvent.type(tags, "#少女, #壁纸");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(apiModule.api.updatePost).toHaveBeenCalled());
    expect((apiModule.api.updatePost as any).mock.calls[0][1].tags).toEqual(["少女", "壁纸"]);
  });

  it("标题为空时阻止提交", async () => {
    renderModal();
    await userEvent.clear(screen.getByLabelText("标题"));
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(apiModule.api.updatePost).not.toHaveBeenCalled();
  });

  it("切换画板会提交对应英文 key", async () => {
    (apiModule.api.updatePost as any).mockResolvedValue({ post: card });
    renderModal();
    await userEvent.click(screen.getByRole("button", { name: "美食菜谱" }));
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(apiModule.api.updatePost).toHaveBeenCalled());
    expect((apiModule.api.updatePost as any).mock.calls[0][1].board).toBe("food");
  });
});
