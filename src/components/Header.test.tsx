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

describe("Header 单行分类导航", () => {
  const CATEGORIES = [
    "推荐", "关注", "壁纸头像", "动漫插画", "时尚穿搭", "美食菜谱", "手工DIY",
    "家居生活", "美妆造型", "旅行摄影", "古风汉服", "萌宠植物", "文字句子", "婚纱婚礼",
  ];

  it("把全部 14 个分类放在同一个可横向滚动的容器里", () => {
    renderHeader();
    const navs = document.querySelectorAll("[data-nav]");
    expect(navs.length).toBe(CATEGORIES.length);
    // 全部按钮必须是同一个滚动容器的子元素（单行，不是多行）
    const parents = new Set(Array.from(navs).map(n => n.parentElement));
    expect(parents.size).toBe(1);
    // 滚动容器具备横向滚动能力
    const container = parents.values().next().value as HTMLElement;
    expect(container.classList.contains("overflow-x-auto")).toBe(true);
  });

  it("每个分类都不换行、不截断（修复「古风汉…」被裁掉）", () => {
    renderHeader();
    for (const cat of CATEGORIES) {
      const btn = document.querySelector(`[data-nav="${cat}"]`) as HTMLElement;
      expect(btn).toBeTruthy();
      // 关键：允许横向滚动而非被截断/折行
      expect(btn.className).toContain("whitespace-nowrap");
      expect(btn.className).toContain("shrink-0");
      expect(btn.className).not.toContain("truncate");
    }
  });

  it("点击分类后激活态跟随切换", async () => {
    renderHeader();
    const btn = document.querySelector('[data-nav="壁纸头像"]') as HTMLElement;
    await userEvent.click(btn);
    expect(btn.className).toContain("border-[#e05d6f]");
    // 之前的激活项已还原
    const rec = document.querySelector('[data-nav="推荐"]') as HTMLElement;
    expect(rec.className).not.toContain("border-[#e05d6f]");
  });
});
