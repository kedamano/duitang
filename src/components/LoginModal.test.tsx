import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LoginModal from "./LoginModal";
import RegisterModal from "./RegisterModal";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { ToastProvider } from "../context/ToastContext";
import * as apiModule from "../api";

vi.mock("../api", () => ({
  AUTH_EXPIRED_EVENT: "duitang:auth-expired",
  AuthExpiredError: class extends Error {},
  api: {
    me: vi.fn().mockResolvedValue({ user: null, stats: {} }),
    login: vi.fn(),
    register: vi.fn(),
  },
}));

const loggedUser = {
  id: 1, username: "tangyan", nickname: "糖小颜", avatar: "/a.svg",
  bio: "", posts: 0, followers: 0, following: 0, collections: 0,
};

function OpenLogin() {
  const { setShowLogin } = useAuth();
  return <button onClick={() => setShowLogin(true)}>open-login</button>;
}
function OpenRegister() {
  const { setShowRegister } = useAuth();
  return <button onClick={() => setShowRegister(true)}>open-register</button>;
}

function Harness() {
  return (
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <OpenLogin />
          <OpenRegister />
          <LoginModal />
          <RegisterModal />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

function type(input: HTMLElement, text: string) {
  fireEvent.change(input, { target: { value: text } });
}

function openLogin() {
  render(<Harness />);
  fireEvent.click(screen.getByText("open-login"));
}

function openRegister() {
  render(<Harness />);
  fireEvent.click(screen.getByText("open-register"));
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  // 登录成功后 AuthContext 会用新 token 调 me() 恢复会话，需返回合法用户
  (apiModule.api.me as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: loggedUser,
    stats: { posts: 0, followers: 0, following: 0, collects: 0 },
  });
  vi.spyOn(window, "alert").mockImplementation(() => {});
});

describe("LoginModal", () => {
  it("未触发时不渲染，触发后出现", () => {
    render(<Harness />);
    expect(screen.queryByText("欢迎回来")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("open-login"));
    expect(screen.getByText("欢迎回来")).toBeInTheDocument();
  });

  it("信息不全时提示且不发请求", () => {
    openLogin();
    fireEvent.click(screen.getByText("登 录"));
    expect(screen.getByText("请填写完整信息")).toBeInTheDocument();
    expect(apiModule.api.login).not.toHaveBeenCalled();
  });

  it("登录成功：调用接口、写入 token、关闭弹窗", async () => {
    (apiModule.api.login as ReturnType<typeof vi.fn>).mockResolvedValue({ token: "TK", user: loggedUser });
    openLogin();
    type(screen.getByPlaceholderText("请输入用户名"), "tangyan");
    type(screen.getByPlaceholderText("请输入密码"), "123456");
    fireEvent.click(screen.getByText("登 录"));

    await waitFor(() => expect(screen.queryByText("欢迎回来")).not.toBeInTheDocument(), { timeout: 3000 });
    expect(apiModule.api.login).toHaveBeenCalledWith({ username: "tangyan", password: "123456" });
    expect(localStorage.getItem("duitang_token")).toBe("TK");
  });

  it("登录失败：弹窗保持并显示错误", async () => {
    (apiModule.api.login as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("用户名或密码错误"));
    openLogin();
    type(screen.getByPlaceholderText("请输入用户名"), "tangyan");
    type(screen.getByPlaceholderText("请输入密码"), "bad");
    fireEvent.click(screen.getByText("登 录"));

    await waitFor(() => expect(screen.getByText("用户名或密码错误")).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText("欢迎回来")).toBeInTheDocument();
    expect(localStorage.getItem("duitang_token")).toBeNull();
  });

  it("点「立即注册」切换到注册弹窗", () => {
    openLogin();
    fireEvent.click(screen.getByText("立即注册"));
    expect(screen.queryByText("欢迎回来")).not.toBeInTheDocument();
    expect(screen.getByText("加入堆糖")).toBeInTheDocument();
  });
});

describe("RegisterModal", () => {
  const fill = (u: string, p: string, c: string) => {
    type(screen.getByPlaceholderText("3位以上的用户名"), u);
    type(screen.getByPlaceholderText("至少6位密码"), p);
    type(screen.getByPlaceholderText("再次输入密码"), c);
    fireEvent.click(screen.getByText("注 册"));
  };

  it("用户名过短被拦截", () => {
    openRegister();
    fill("ab", "123456", "123456");
    expect(screen.getByText("用户名至少3个字符")).toBeInTheDocument();
    expect(apiModule.api.register).not.toHaveBeenCalled();
  });

  it("密码过短被拦截", () => {
    openRegister();
    fill("abc", "123", "123");
    expect(screen.getByText("密码至少6个字符")).toBeInTheDocument();
  });

  it("两次密码不一致被拦截", () => {
    openRegister();
    fill("abc", "123456", "654321");
    expect(screen.getByText("两次密码不一致")).toBeInTheDocument();
  });

  it("注册成功：写入 token 并关闭", async () => {
    (apiModule.api.register as ReturnType<typeof vi.fn>).mockResolvedValue({ token: "RZ", user: loggedUser });
    openRegister();
    fill("newbie", "123456", "123456");
    await waitFor(() => expect(screen.queryByText("加入堆糖")).not.toBeInTheDocument(), { timeout: 3000 });
    expect(localStorage.getItem("duitang_token")).toBe("RZ");
  });

  it("用户名被占用时提示", async () => {
    (apiModule.api.register as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("用户名已被注册"));
    openRegister();
    fill("tangyan", "123456", "123456");
    await waitFor(() => expect(screen.getByText("用户名已被注册")).toBeInTheDocument(), { timeout: 3000 });
  });

  it("点「立即登录」切换到登录弹窗", () => {
    openRegister();
    fireEvent.click(screen.getByText("立即登录"));
    expect(screen.queryByText("加入堆糖")).not.toBeInTheDocument();
    expect(screen.getByText("欢迎回来")).toBeInTheDocument();
  });
});
