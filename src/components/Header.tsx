import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { cn } from "../utils/cn";
import { navCategories, hotSearches, FOLLOW_NAV } from "../data/images";
import { api } from "../api";
import { useTrending } from "../hooks/useTrending";
import NotificationBell from "./NotificationBell";
import NotifyPrefsModal from "./NotifyPrefsModal";
import { Icon } from "./Icons";

interface SearchUser { id: number; username: string; nickname: string; avatar: string; }

function SearchBar({
  value, onChange, onFocus, onBlur, focused,
}: {
  value: string; onChange: (v: string) => void;
  onFocus: () => void; onBlur: () => void; focused: boolean;
}) {
  const [users, setUsers] = useState<SearchUser[]>([]);
  const navigate = useNavigate();
  // 热搜优先用真实统计数据，没有数据时回落静态词表
  const { data: trending } = useTrending();
  const searchChips = trending?.searches?.length
    ? trending.searches.map(s => s.tag)
    : hotSearches;

  useEffect(() => {
    if (!value.trim()) { setUsers([]); return; }
    let cancelled = false;
    api.searchUsers(value.trim())
      .then(data => { if (!cancelled) setUsers(data.users || []); })
      .catch(() => { if (!cancelled) setUsers([]); });
    return () => { cancelled = true; };
  }, [value]);

  const goUser = (u: SearchUser) => {
    navigate(`/profile?user=${u.id}`);
    onChange("");
  };


  return (
    <div className="relative flex-1 max-w-xl">
      <div className={cn(
        "flex items-center gap-2 bg-gray-100 rounded-full px-4 py-2 transition-all duration-200",
        focused && "ring-2 ring-[#e05d6f] bg-white shadow-md",
      )}>
        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder="搜索你感兴趣的内容..."
          className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder-gray-400"
        />
        {value && (
          <button onClick={() => onChange("")} className="text-gray-400 hover:text-gray-600">
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
            </svg>
          </button>
        )}
      </div>
      {focused && value && users.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-50 animate-fade-in">
          <p className="text-xs text-gray-400 px-2 pt-1.5 pb-2 font-medium flex items-center gap-1">
            <Icon name="user" className="w-3.5 h-3.5" /> 搜索用户
          </p>
          {users.map(u => (
            <button
              key={u.id}
              onMouseDown={() => goUser(u)}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 transition-colors text-left"
            >
              <img src={u.avatar} alt="" className="w-8 h-8 rounded-full bg-gray-100" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{u.nickname}</p>
                <p className="text-xs text-gray-400 truncate">@{u.username}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {focused && !value && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 z-50 animate-fade-in">
          <p className="text-xs text-gray-400 mb-2 font-medium flex items-center gap-1">
            <Icon name="fire" className="w-3.5 h-3.5 text-[#e05d6f]" /> 热门搜索
          </p>
          <div className="flex flex-wrap gap-2">
            {searchChips.map(s => (
              <button
                key={s}
                onMouseDown={() => onChange(s)}
                className="text-xs bg-gray-50 hover:bg-[#fde8eb] text-gray-600 hover:text-[#e05d6f] px-3 py-1.5 rounded-full transition-colors border border-gray-100"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Header({
  search, onSearchChange, activeNav, onNavChange,
}: {
  search: string; onSearchChange: (v: string) => void;
  activeNav: string; onNavChange: (v: string) => void;
}) {
  const { user, logout, setShowLogin, setShowRegister } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchFocused, setSearchFocused] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdown, setProfileDropdown] = useState(false);
  const [showNotifyPrefs, setShowNotifyPrefs] = useState(false);

  // 分类/搜索只在首页有意义：非首页触发时先回到首页，避免"点了没反应"
  const goHomeIfNeeded = () => {
    if (location.pathname !== "/") navigate("/");
  };
  const handleNavChange = (cat: string) => {
    goHomeIfNeeded();
    onNavChange(cat);
  };
  const handleSearchChange = (v: string) => {
    if (v) {
      goHomeIfNeeded();
      // 关注流不支持关键词检索：搜索时自动切回推荐
      if (activeNav === FOLLOW_NAV) onNavChange("推荐");
    }
    onSearchChange(v);
  };

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!profileDropdown) return;
    const handler = () => setProfileDropdown(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [profileDropdown]);

  const handlePublish = () => {
    if (!user) {
      setShowLogin(true);
      return;
    }
    navigate("/publish");
  };

  return (
    <header className={cn(
      "sticky top-0 z-40 bg-white transition-shadow duration-200",
      scrolled && "shadow-md",
    )}>
      {/* Top row */}
      <div className="flex items-center gap-3 px-4 md:px-6 h-14 border-b border-gray-100">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-1.5 shrink-0">
          <div className="w-8 h-8 bg-gradient-to-br from-[#e05d6f] to-[#f0a0a8] rounded-lg flex items-center justify-center shadow-sm">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
            </svg>
          </div>
          <span className="font-bold text-lg text-[#e05d6f] hidden sm:block tracking-wide">堆糖</span>
        </Link>

        {/* Search */}
        <SearchBar
          value={search}
          onChange={handleSearchChange}
          focused={searchFocused}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
        />

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0 ml-1">
          {user ? (
            <>
              <NotificationBell />
              {/* Publish button */}
              <button
                onClick={handlePublish}
                className="hidden md:flex items-center gap-1.5 bg-[#e05d6f] hover:bg-[#c94d5e] text-white text-sm font-medium px-4 py-2 rounded-full transition-colors shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                发布
              </button>
              {/* Profile dropdown */}
              <div className="relative" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setProfileDropdown(!profileDropdown)}
                  data-testid="profile-menu-trigger"
                  className="flex items-center gap-2 px-2 py-1 rounded-full hover:bg-gray-50 transition-colors"
                >
                  <img src={user.avatar} alt="" className="w-8 h-8 rounded-full bg-gray-200 ring-2 ring-[#f0a0a8]" />
                  <span className="hidden md:block text-sm font-medium text-gray-700 max-w-[60px] truncate">{user.nickname}</span>
                  <svg className={cn("w-3.5 h-3.5 text-gray-400 transition-transform", profileDropdown && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {profileDropdown && (
                  <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 animate-fade-in">
                    <button
                      onClick={() => { navigate("/profile"); setProfileDropdown(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      个人主页
                    </button>
                    <button
                      onClick={() => { navigate("/profile?tab=collection"); setProfileDropdown(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                      我的收集
                    </button>
                    <button
                      onClick={() => { navigate("/discover"); setProfileDropdown(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Icon name="fire" className="w-4 h-4 text-gray-400" />
                      发现
                    </button>
                    {user.is_admin && (
                      <button
                        onClick={() => { navigate("/admin/reports"); setProfileDropdown(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <Icon name="shield" className="w-4 h-4 text-gray-400" />
                        审核队列
                      </button>
                    )}
                    <button
                      onClick={() => { setShowNotifyPrefs(true); setProfileDropdown(false); }}
                      data-testid="open-notify-prefs"
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      通知设置
                    </button>
                    <div className="border-t border-gray-100 my-1" />
                    <button
                      onClick={() => { logout(); setProfileDropdown(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      退出登录
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <button
                onClick={handlePublish}
                className="hidden md:flex items-center gap-1.5 bg-[#e05d6f] hover:bg-[#c94d5e] text-white text-sm font-medium px-4 py-2 rounded-full transition-colors shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                发布
              </button>
              <button
                onClick={() => setShowLogin(true)}
                className="hidden md:flex items-center gap-1 text-gray-500 hover:text-[#e05d6f] text-sm px-3 py-2 rounded-full hover:bg-gray-50 transition-colors"
              >
                登录
              </button>
              <button
                onClick={() => setShowRegister(true)}
                className="hidden md:flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-3 py-2 rounded-full transition-colors"
              >
                注册
              </button>
            </>
          )}

          {/* Mobile menu */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-full hover:bg-gray-100"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Nav row：分类导航只属于首页，其他页面显示会与页面自身的返回栏重复 */}
      {location.pathname === "/" && (
        <CategoryNav activeNav={activeNav} onNavChange={handleNavChange} />
      )}

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-white border-b border-gray-200 shadow-lg px-4 py-4 z-50 flex gap-3">
          {user ? (
            <>
              <button onClick={() => { navigate("/publish"); setMobileMenuOpen(false); }} className="flex-1 bg-[#e05d6f] text-white text-sm font-medium py-2 rounded-full">发布</button>
              <button onClick={() => { navigate("/profile"); setMobileMenuOpen(false); }} className="flex-1 border border-gray-200 text-gray-700 text-sm py-2 rounded-full">个人主页</button>
              <button onClick={() => { logout(); setMobileMenuOpen(false); }} className="flex-1 bg-gray-100 text-gray-700 text-sm py-2 rounded-full">退出</button>
            </>
          ) : (
            <>
              <button onClick={() => { handlePublish(); setMobileMenuOpen(false); }} className="flex-1 bg-[#e05d6f] text-white text-sm font-medium py-2 rounded-full">发布</button>
              <button onClick={() => { setShowLogin(true); setMobileMenuOpen(false); }} className="flex-1 border border-gray-200 text-gray-700 text-sm py-2 rounded-full">登录</button>
              <button onClick={() => { setShowRegister(true); setMobileMenuOpen(false); }} className="flex-1 bg-gray-100 text-gray-700 text-sm py-2 rounded-full">注册</button>
            </>
          )}
        </div>
      )}

      {showNotifyPrefs && <NotifyPrefsModal onClose={() => setShowNotifyPrefs(false)} />}
    </header>
  );
}

/**
 * 单行分类导航。
 * 分类数量超过容器宽度时，靠左右箭头 + 边缘渐隐提示可滚动；
 * 激活项自动滚动居中。所有分类始终排在同一行（nowrap），不会被截断或换行。
 */

// jsdom 未实现 Element.prototype.scrollTo/scrollBy，做一层兜底以便单测与老浏览器
function smoothTo(el: HTMLElement, left: number) {
  const target = Math.max(0, left);
  if (typeof el.scrollTo === "function") el.scrollTo({ left: target, behavior: "smooth" });
  else el.scrollLeft = target;
}
function smoothBy(el: HTMLElement, delta: number) {
  if (typeof el.scrollBy === "function") el.scrollBy({ left: delta, behavior: "smooth" });
  else el.scrollLeft = el.scrollLeft + delta;
}

function CategoryNav({ activeNav, onNavChange }: { activeNav: string; onNavChange: (c: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  const centerActive = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const item = el.querySelector<HTMLElement>(`[data-nav="${activeNav}"]`);
    if (!item) return;
    const target = item.offsetLeft - (el.clientWidth - item.offsetWidth) / 2;
    smoothTo(el, target);
  }, [activeNav]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    centerActive();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update, centerActive]);

  // 激活项变化时跟随居中（切分类/切关注时）
  useEffect(() => {
    centerActive();
  }, [activeNav, centerActive]);

  const scrollBy = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) smoothBy(el, dir * 240);
  };

  return (
    <div className="relative border-b border-gray-100">
      <div ref={ref} className="flex items-center gap-0 overflow-x-auto scrollbar-hide px-2">
        {navCategories.map(cat => (
          <button
            key={cat}
            type="button"
            data-nav={cat}
            onClick={() => onNavChange(cat)}
            className={cn(
              "shrink-0 px-4 py-3 text-sm font-medium whitespace-nowrap transition-all duration-150 border-b-2",
              activeNav === cat
                ? "border-[#e05d6f] text-[#e05d6f]"
                : "border-transparent text-gray-500 hover:text-[#e05d6f] hover:border-[#f0a0a8]",
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 边缘渐隐遮罩，提示两侧还有内容 */}
      <div className={cn(
        "pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent transition-opacity duration-200",
        canLeft ? "opacity-100" : "opacity-0",
      )} />
      <div className={cn(
        "pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent transition-opacity duration-200",
        canRight ? "opacity-100" : "opacity-0",
      )} />

      {/* 左右滚动箭头：仅在对应方向还有内容时显示 */}
      <button
        type="button"
        aria-label="向左滚动分类"
        data-nav-arrow="left"
        onClick={() => scrollBy(-1)}
        className={cn(
          "absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white shadow-md border border-gray-100 flex items-center justify-center text-gray-500 hover:text-[#e05d6f] transition-all duration-200",
          canLeft ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="向右滚动分类"
        data-nav-arrow="right"
        onClick={() => scrollBy(1)}
        className={cn(
          "absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white shadow-md border border-gray-100 flex items-center justify-center text-gray-500 hover:text-[#e05d6f] transition-all duration-200",
          canRight ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
