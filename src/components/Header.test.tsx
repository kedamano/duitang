import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { ToastProvider } from "../context/ToastContext";
import Header from "../components/Header";
import * as apiModule from "../api";

vi.mock("../api", () => ({
  AUTH_EXPIRED_EVENT: "duitang:auth-expired",
  AuthExpiredError: class extends Error {},
  api: {
    searchUsers: vi.fn(),
    me: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    myCollects: vi.fn(),
    myLikes: vi.fn(),
    myPosts: vi.fn(),
    myInteractions: vi.fn().mockResolvedValue({ liked: [], collected: [], following: [] }),
    myFollowing: vi.fn(),
  },
}));

import { useState } from "react";

function Harness() {
  const [search, setSearch] = useState("");
  const [activeNav, setActiveNav] = useState("推荐");
  return (
    <Header
      search={search}
      onSearchChange={setSearch}
      activeNav={activeNav}
      onNavChange={setActiveNav}
    />
  );
}

function renderHeader() {
  render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <Harness />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe("Header", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    (apiModule.api.me as ReturnType<typeof vi.fn>).mockResolvedValue({ user: null });
  });

  it("shows hot searches when search focused with empty input", async () => {
    renderHeader();
    const input = screen.getByPlaceholderText("搜索你感兴趣的内容...");
    await userEvent.click(input);
    await screen.findByText(/热门搜索/i);
    expect(screen.getByText("可爱壁纸")).toBeInTheDocument();
  });

  it("searches users and shows dropdown, clicking clears input", async () => {
    renderHeader();
    (apiModule.api.searchUsers as ReturnType<typeof vi.fn>).mockResolvedValue({
      users: [{ id: 3, username: "tangyan", nickname: "糖小颜", avatar: "a.svg" }],
    });
    const input = screen.getByPlaceholderText("搜索你感兴趣的内容...");
    await userEvent.click(input);
    await userEvent.type(input, "糖");
    const userRow = await screen.findByText("@tangyan");
    expect(userRow).toBeInTheDocument();
    await userEvent.click(userRow);
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("shows login button when logged out", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "注册" })).toBeInTheDocument();
  });
});

describe("Header 首页导航（入口 + 分类下拉）", () => {
  const BOARDS = [
    "壁纸头像", "动漫插画", "时尚穿搭", "美食菜谱", "手工DIY",
    "家居生活", "美妆造型", "旅行摄影", "古风汉服", "萌宠植物", "文字句子", "婚纱婚礼",
  ];

  it("导航行只放推荐/关注入口，分类收进下拉触发器", () => {
    renderHeader();
    const nav = document.querySelector('[data-testid="home-nav"]')!;
    expect(nav.querySelectorAll("[data-nav]").length).toBe(2);
    expect(nav.querySelector('[data-nav="推荐"]')?.textContent).toBe("推荐");
    expect(nav.querySelector('[data-nav="关注"]')?.textContent).toBe("关注");
    expect(screen.getByTestId("category-trigger").textContent).toContain("分类");
    // 面板默认收起
    expect(screen.queryByTestId("category-panel")).not.toBeInTheDocument();
  });

  it("点「分类」展开面板，12 个画板全部可选", async () => {
    renderHeader();
    await userEvent.click(screen.getByTestId("category-trigger"));
    const panel = screen.getByTestId("category-panel");
    const items = panel.querySelectorAll("[data-nav-item]");
    expect(items.length).toBe(BOARDS.length);
    for (const b of BOARDS) {
      expect(panel.querySelector(`[data-nav-item="${b}"]`)).toBeTruthy();
    }
  });

  it("从面板选择分类：面板关闭、触发器显示当前分类并高亮", async () => {
    renderHeader();
    await userEvent.click(screen.getByTestId("category-trigger"));
    await userEvent.click(screen.getByText("美食菜谱"));
    // 面板关闭
    expect(screen.queryByTestId("category-panel")).not.toBeInTheDocument();
    // 触发器变为当前分类且高亮
    const trigger = screen.getByTestId("category-trigger");
    expect(trigger.textContent).toContain("美食菜谱");
    expect(trigger.className).toContain("border-[#e05d6f]");
    // 推荐入口取消高亮
    expect(document.querySelector('[data-nav="推荐"]')!.className).not.toContain("border-[#e05d6f]");
  });

  it("点推荐回到默认态，触发器恢复「分类」文案", async () => {
    renderHeader();
    await userEvent.click(screen.getByTestId("category-trigger"));
    await userEvent.click(screen.getByText("古风汉服"));
    await userEvent.click(document.querySelector('[data-nav="推荐"]')!);
    expect(screen.getByTestId("category-trigger").textContent).toContain("分类");
  });
});
