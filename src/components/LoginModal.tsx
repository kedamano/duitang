import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function LoginModal() {
  const { showLogin, setShowLogin, login, setShowRegister } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username || !password) {
      setError("请填写完整信息");
      return;
    }
    setLoading(true);
    // Simulate network delay
    await new Promise(r => setTimeout(r, 600));
    const ok = await login(username, password);
    setLoading(false);
    if (!ok) {
      setError("用户名或密码错误");
    }
  };

  const switchToRegister = () => {
    setShowLogin(false);
    setShowRegister(true);
  };

  return (
    !showLogin ? null : (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setShowLogin(false)}>
      <div
        className="bg-surface rounded-3xl overflow-hidden w-full max-w-md shadow-2xl animate-modal-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative bg-gradient-to-r from-[#e05d6f] to-[#f0a0a8] px-8 pt-8 pb-12 text-center">
          <button
            onClick={() => setShowLogin(false)}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-surface/20 text-white hover:bg-surface/30 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="w-16 h-16 bg-surface/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h2 className="text-white font-bold text-xl">欢迎回来</h2>
          <p className="text-white/80 text-sm mt-1">登录堆糖，发现更多美好</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-6 -mt-4 bg-surface rounded-t-3xl relative">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-body mb-1.5 block">用户名</label>
              <div className="relative">
                <svg className="w-4 h-4 text-mute absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="请输入用户名"
                  className="w-full pl-10 pr-4 py-3 bg-soft rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#e05d6f]/30 focus:bg-surface border border-line transition-all text-ink2"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-body mb-1.5 block">密码</label>
              <div className="relative">
                <svg className="w-4 h-4 text-mute absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  className="w-full pl-10 pr-4 py-3 bg-soft rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#e05d6f]/30 focus:bg-surface border border-line transition-all text-ink2"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-3 text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-5 bg-gradient-to-r from-[#e05d6f] to-[#d94f60] text-white font-bold text-sm py-3 rounded-xl shadow-lg shadow-[#e05d6f]/20 hover:shadow-xl hover:shadow-[#e05d6f]/30 transition-all disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" />
                </svg>
                登录中...
              </span>
            ) : "登 录"}
          </button>

          <p className="text-center text-sm text-mute mt-4">
            还没有账号？{" "}
            <button type="button" onClick={switchToRegister} className="text-[#e05d6f] font-medium hover:underline">
              立即注册
            </button>
          </p>
        </form>
      </div>
    </div>
    )
  );
}
