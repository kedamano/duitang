import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { ToastProvider } from "../context/ToastContext";
import Header from "../components/Header";
import * as apiModule from "../api";

vi.mock("../api", () => ({
  api: {
    searchUsers: vi.fn(),
    me: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    myCollects: vi.fn(),
    myLikes: vi.fn(),
    myPosts: vi.fn(),
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
