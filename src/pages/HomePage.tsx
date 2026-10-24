import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "../utils/cn";
import { useAuth } from "../context/AuthContext";
import { useCollection } from "../context/CollectionContext";
import { useToast } from "../context/ToastContext";
import { api } from "../api";
import { normalizePost } from "../utils/normalizePost";
import { PostDetailModal } from "../components/PostDetail";
import { labelToBoard, FOLLOW_NAV, type ImageCard } from "../data/images";
import { useDebouncedValue } from "../utils/useDebouncedValue";
import { MasonryGrid, MasonrySkeleton } from "../components/MasonryGrid";
import { Icon } from "../components/Icons";
import { useTrending } from "../hooks/useTrending";

// ─── Banner ───────────────────────────────────────────────────────────────────
function Banner() {
  const [active, setActive] = useState(0);
  const slides = [
    { bg: "from-rose-400 to-pink-300", title: "发现美好生活", sub: "数十亿高清图片等你探索", img: "/images/banner1.jpg" },
    { bg: "from-violet-400 to-purple-300", title: "分享你的灵感", sub: "记录生活中每一个珍贵瞬间", img: "/images/banner5.jpg" },
    { bg: "from-amber-400 to-orange-300", title: "遇见有趣的灵魂", sub: "找到与你兴趣相同的糖友", img: "/images/banner2.jpg" },
  ];

  useEffect(() => {
    const t = setInterval(() => setActive(a => (a + 1) % slides.length), 4000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl mx-4 md:mx-6 mt-4 mb-6 h-36 md:h-48">
      {slides.map((s, i) => (
        <div
          key={i}
          className={cn(
            "absolute inset-0 flex items-center transition-all duration-700",
            `bg-gradient-to-r ${s.bg}`,
            i === active ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4 pointer-events-none",
          )}
        >
          <div className="flex-1 px-8 md:px-12">
            <h2 className="text-white font-extrabold text-xl md:text-3xl mb-1 drop-shadow-sm">{s.title}</h2>
            <p className="text-white/80 text-sm md:text-base mb-4">{s.sub}</p>
            <button className="bg-white text-[#e05d6f] font-bold text-sm px-5 py-2 rounded-full hover:shadow-lg transition-shadow flex items-center gap-1.5">
              立即探索
              <Icon name="arrowRight" className="w-4 h-4" />
            </button>
          </div>
          <div className="w-1/3 h-full overflow-hidden hidden sm:block opacity-70">
            <img src={s.img} alt="" className="w-full h-full object-cover" />
          </div>
        </div>
      ))}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={cn(
              "rounded-full transition-all duration-300",
              i === active ? "w-5 h-2 bg-white" : "w-2 h-2 bg-white/50",
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
/** 侧栏热门话题：优先展示真实标签，无数据时回落静态示例 */
function SideTopics() {
  const navigate = useNavigate();
  const { data } = useTrending();
  const realTags = data?.tags || [];
  const fallback = [
    { tag: "少女心", count: 0 },
    { tag: "家居", count: 0 },
    { tag: "美食", count: 0 },
    { tag: "旅行", count: 0 },
    { tag: "插画", count: 0 },
  ];
  const topics = (realTags.length ? realTags : fallback).slice(0, 5);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <h3 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-1">
        <Icon name="fire" className="w-4 h-4 text-[#e05d6f]" /> 热门话题
      </h3>
      <div className="space-y-1" data-testid="hot-topics">
        {topics.map(t => (
          <button
            key={t.tag}
            onClick={() => navigate(`/tag/${encodeURIComponent(t.tag)}`)}
            className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-[#fde8eb] group transition-colors text-left"
          >
            <Icon name="tag" className="w-4 h-4 text-gray-400 group-hover:text-[#e05d6f] shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-700 group-hover:text-[#e05d6f] truncate">{t.tag}</p>
              <p className="text-xs text-gray-400">{t.count > 0 ? `${t.count} 张图片` : "去看看"}</p>
            </div>
          </button>
        ))}
      </div>
      <button
        onClick={() => navigate("/discover")}
        className="mt-2 w-full text-xs text-gray-400 hover:text-[#e05d6f] py-1.5 transition-colors flex items-center justify-center gap-1"
      >
        发现更多 <Icon name="arrowRight" className="w-3 h-3" />
      </button>
    </div>
  );
}

// ─── Load More ────────────────────────────────────────────────────────────────
function LoadMoreButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <div className="flex justify-center py-10">
      <button
        onClick={onClick}
        disabled={loading}
        className={cn(
          "flex items-center gap-2 px-8 py-3 rounded-full text-sm font-semibold transition-all",
          "border-2 border-[#e05d6f] text-[#e05d6f] hover:bg-[#e05d6f] hover:text-white",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" />
            </svg>
            加载中...
          </>
        ) : "加载更多"}
      </button>
    </div>
  );
}

// ─── Back to top ─────────────────────────────────────────────────────────────
function BackToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const handler = () => setVisible(window.scrollY > 400);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);
  if (!visible) return null;
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-8 right-6 w-10 h-10 bg-[#e05d6f] text-white rounded-full shadow-lg flex items-center justify-center hover:bg-[#c94d5e] transition-all hover:scale-110 z-30"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
      </svg>
    </button>
  );
}

// ─── HomePage ─────────────────────────────────────────────────────────────────
export default function HomePage({
  search, onSearchChange, activeNav, onNavChange,
}: {
  search: string; onSearchChange: (v: string) => void;
  activeNav: string; onNavChange: (v: string) => void;
}) {
  const { user, setShowLogin } = useAuth();
  const { userPosts } = useCollection();
  const { showToast } = useToast();
  const [apiPosts, setApiPosts] = useState<ImageCard[]>([]);
  const [selectedCard, setSelectedCard] = useState<ImageCard | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [feedEmptyReason, setFeedEmptyReason] = useState<"none" | "not_logged_in" | "no_following">("none");

  // 导航为中文标签，后端 board 统一使用英文 key
  const isFollowFeed = activeNav === FOLLOW_NAV;
  const boardKey = labelToBoard[activeNav] ?? "all";
  // 关注流暂不支持关键词检索，搜索条件仅作用于画板/推荐
  const effectiveSearch = isFollowFeed ? "" : search;
  // 输入框即时响应，只有请求跟着防抖（避免每个按键都打一次后端）
  const debouncedSearch = useDebouncedValue(effectiveSearch, 300);

  // 拉取一页数据（关注流与普通流共用）
  const fetchPage = useCallback(async (pageNum: number) => {
    if (isFollowFeed) {
      if (!user) {
        setFeedEmptyReason("not_logged_in");
        setApiPosts([]); setTotal(0); setHasMore(false);
        return;
      }
      const data = await api.getFollowingFeed({ limit: 20, page: pageNum });
      setFeedEmptyReason((data.posts || []).length === 0 && pageNum === 1 ? "no_following" : "none");
      setTotal(data.total || 0);
      setHasMore((data.posts || []).length >= 20);
      return (data.posts || []).map(normalizePost);
    }
    const data = await api.getPosts({
      limit: 20, page: pageNum,
      board: boardKey !== 'all' ? boardKey : undefined,
      q: debouncedSearch || undefined,
    });
    setTotal(data.total || 0);
    setHasMore((data.posts || []).length >= 20);
    return (data.posts || []).map(normalizePost);
  }, [isFollowFeed, user, boardKey, debouncedSearch]);

  // 分类/搜索/登录态变化时重新加载第一页
  useEffect(() => {
    setPage(1);
    setApiPosts([]);
    setHasMore(true);
    setInitialLoading(true);
    if (!isFollowFeed) setFeedEmptyReason("none");
    let cancelled = false;
    fetchPage(1)
      .then(posts => { if (!cancelled && posts) setApiPosts(posts); })
      .catch(() => showToast("加载帖子失败，请刷新重试", "error"))
      .finally(() => { if (!cancelled) setInitialLoading(false); });
    return () => { cancelled = true; };
  }, [isFollowFeed, user, activeNav, debouncedSearch, boardKey, fetchPage, showToast]);

  // 合并用户发布(优先)与后端帖子；关注流后端已含自己的帖子，不再叠加
  const allCards = useMemo(() => {
    const map = new Map<number, ImageCard>();
    apiPosts.forEach(c => map.set(c.id, c));
    if (!isFollowFeed) {
      userPosts.forEach(c => {
        if (boardKey === 'all' || c.category === boardKey) {
          if (!effectiveSearch || c.title.includes(effectiveSearch) || c.tags.some((t: string) => t.includes(effectiveSearch)) || c.author.includes(effectiveSearch)) {
            map.set(c.id, c);
          }
        }
      });
    }
    return Array.from(map.values());
  }, [userPosts, apiPosts, boardKey, effectiveSearch, isFollowFeed]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const next = await fetchPage(nextPage);
      if (next) {
        setApiPosts(prev => {
          const map = new Map<number, ImageCard>();
          prev.forEach((c: ImageCard) => map.set(c.id, c));
          next.forEach((c: ImageCard) => map.set(c.id, c));
          return Array.from(map.values());
        });
      }
      setPage(nextPage);
    } catch {
      showToast("加载更多失败，请稍后重试", "error");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page, fetchPage, showToast]);

  return (
    <main className="max-w-screen-xl mx-auto">
      {activeNav === "推荐" && !search && <Banner />}

      <div className="flex gap-4 px-4 md:px-6">
        <div className="flex-1 min-w-0">
          {search && !isFollowFeed && (
            <div className="mb-4 flex items-center gap-2">
              <p className="text-sm text-gray-500">
                搜索 <span className="text-[#e05d6f] font-semibold">"{search}"</span>，找到 {total} 张图片
              </p>
            </div>
          )}

          {initialLoading && allCards.length === 0 ? (
            <MasonrySkeleton />
          ) : isFollowFeed && allCards.length === 0 && feedEmptyReason === "not_logged_in" ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Icon name="lock" className="w-14 h-14 text-gray-300" />
              <p className="text-gray-400 text-base">登录后即可查看关注内容</p>
              <button
                onClick={() => setShowLogin(true)}
                className="bg-[#e05d6f] text-white text-sm font-bold px-8 py-2.5 rounded-full hover:bg-[#c94d5e] transition-colors"
              >
                去登录
              </button>
            </div>
          ) : isFollowFeed && allCards.length === 0 && feedEmptyReason === "no_following" ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Icon name="hand" className="w-14 h-14 text-gray-300" />
              <p className="text-gray-400 text-base">还没有关注任何人，关注 TA 们的更新会出现在这里</p>
              <div className="flex gap-3">
                <button
                  onClick={() => onNavChange("推荐")}
                  className="bg-[#e05d6f] text-white text-sm font-bold px-6 py-2.5 rounded-full hover:bg-[#c94d5e] transition-colors flex items-center gap-1.5"
                >
                  去首页逛逛
                  <Icon name="arrowRight" className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : allCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Icon name="flower" className="w-14 h-14 text-gray-300" />
              <p className="text-gray-400 text-base">暂时没有找到相关内容～</p>
              <button
                onClick={() => { onSearchChange(""); onNavChange("推荐"); }}
                className="text-sm text-[#e05d6f] hover:underline"
              >
                回到推荐
              </button>
            </div>
          ) : (
            <>
              <MasonryGrid cards={allCards} onCardClick={setSelectedCard} />
              {hasMore && (
                <LoadMoreButton onClick={handleLoadMore} loading={loadingMore} />
              )}
              {!hasMore && allCards.length > 0 && (
                <p className="text-center text-gray-300 text-sm pb-10 pt-4 flex items-center justify-center gap-1.5">
                  — 已经到底啦 <Icon name="flower" className="w-4 h-4 inline" /> —
                </p>
              )}
            </>
          )}
        </div>

        <aside className="hidden xl:block w-60 shrink-0 pt-2">
          <div className="sticky top-28 space-y-4">
            <SideTopics />
            <div className="bg-gradient-to-br from-[#e05d6f] to-[#f0a0a8] rounded-2xl p-4 text-white shadow-md">
              <h3 className="font-bold text-sm mb-1 flex items-center gap-1.5">
                <Icon name="phone" className="w-4 h-4" /> 下载堆糖App
              </h3>
              <p className="text-xs text-white/80 mb-3">随时随地收集你喜欢的图片</p>
              <button className="w-full bg-white text-[#e05d6f] font-bold text-xs py-2 rounded-full hover:shadow-md transition-shadow">
                立即下载
              </button>
            </div>
            <div className="text-xs text-gray-400 space-y-1 px-1">
              <div className="flex flex-wrap gap-2">
                {["关于堆糖", "帮助中心", "意见反馈", "举报中心"].map(l => (
                  <a key={l} href="#" className="hover:text-[#e05d6f] transition-colors">{l}</a>
                ))}
              </div>
              <p>© 2026 duitang.com 版权所有</p>
            </div>
          </div>
        </aside>
      </div>

      <BackToTop />

      {selectedCard && (
        <PostDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />
      )}
    </main>
  );
}
