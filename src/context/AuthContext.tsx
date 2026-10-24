import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { api, AUTH_EXPIRED_EVENT } from "../api";
import { useToast } from "./ToastContext";

export interface User {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  bio: string;
  posts: number;
  followers: number;
  following: number;
  collections: number;
  /** 管理员标记（可进入审核队列） */
  is_admin?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, nickname: string, password: string) => Promise<boolean>;
  logout: () => void;
  updateUser: (patch: Partial<Pick<User, "nickname" | "bio" | "avatar">>) => void;
  loading: boolean;
  showLogin: boolean;
  setShowLogin: (v: boolean) => void;
  showRegister: boolean;
  setShowRegister: (v: boolean) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("duitang_token"));
  const [loading, setLoading] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  // 页面加载时如果有 token，尝试恢复用户信息
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api.me()
      .then((data) => {
        setUser({
          id: data.user.id,
          username: data.user.username,
          nickname: data.user.nickname,
          avatar: data.user.avatar,
          bio: data.user.bio,
          posts: data.stats.posts,
          followers: data.stats.followers,
          following: data.stats.following,
          collections: data.stats.collects,
          is_admin: !!data.user.is_admin,
        });
      })
      .catch(() => {
        setToken(null);
        setUser(null);
        localStorage.removeItem("duitang_token");
      })
      .finally(() => setLoading(false));
  }, [token]);

  // 任意接口返回 401 时（token 过期/被吊销），统一登出并引导重新登录
  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setToken(null);
      setShowLogin(true);
      showToast("登录已过期，请重新登录", "error");
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, [showToast]);

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    try {
      setLoading(true);
      const data = await api.login({ username, password });
      localStorage.setItem("duitang_token", data.token);
      setToken(data.token);
      setUser({
        id: data.user.id,
        username: data.user.username,
        nickname: data.user.nickname,
        avatar: data.user.avatar,
        bio: data.user.bio,
        posts: 0,
        followers: 0,
        following: 0,
        collections: 0,
        is_admin: !!data.user.is_admin,
      });
      setTimeout(() => setShowLogin(false), 50);
      return true;
    } catch (err: any) {
      alert(err.message || "登录失败");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (username: string, nickname: string, password: string): Promise<boolean> => {
    try {
      setLoading(true);
      const data = await api.register({ username, nickname, password });
      localStorage.setItem("duitang_token", data.token);
      setToken(data.token);
      setUser({
        id: data.user.id,
        username: data.user.username,
        nickname: data.user.nickname,
        avatar: data.user.avatar,
        bio: data.user.bio,
        posts: 0,
        followers: 0,
        following: 0,
        collections: 0,
        is_admin: !!data.user.is_admin,
      });
      setTimeout(() => setShowRegister(false), 50);
      return true;
    } catch (err: any) {
      alert(err.message || "注册失败");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateUser = useCallback((patch: Partial<Pick<User, "nickname" | "bio" | "avatar">>) => {
    setUser(prev => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("duitang_token");
  };

  return (

    <AuthContext.Provider value={{ user, token, login, register, logout, updateUser, loading, showLogin, setShowLogin, showRegister, setShowRegister }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
