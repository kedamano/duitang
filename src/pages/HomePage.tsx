import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "../utils/cn";
import { useAuth } from "../context/AuthContext";
import { useCollection } from "../context/CollectionContext";
import { useToast } from "../context/ToastContext";
import { api } from "../api";
import { normalizePost } from "../utils/normalizePost";
import { PostDetailModal } from "../components/PostDetail";
import { labelToBoard, FOLLOW_NAV, type ImageCard } from "../data/images";

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
            <button className="bg-white text-[#e05d6f] font-bold text-sm px-5 py-2 rounded-full hover:shadow-lg transition-shadow">
              立即探索 →
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

// ─── Image Card ───────────────────────────────────────────────────────────────
function Card({ card, onClick }: { card: ImageCard; onClick: () => void }) {
  const { user, setShowLogin } = useAuth();
  const { isCollected, isLiked, toggleCollect, toggleLike, getLikeCount, getCollectCount } = useCollection();
  const collected = isCollected(card.id);
  const liked = isLiked(card.id);
  const likeCount = getLikeCount(card.id, card.likes);
  const collectCount = getCollectCount(card.id, card.collects);
  const [imgLoaded, setImgLoaded] = useState(false);
  const aspectRatio = (card.height / card.width) * 100;

  const handleCollect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) { setShowLogin(true); return; }
    toggleCollect(card.id);
  };

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) { setShowLogin(true); return; }
    toggleLike(card.id);
  };

  return (
    <div
      className="group relative bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer hover:-translate-y-1 break-inside-avoid"
      onClick={onClick}
    >
      <div className="relative overflow-hidden bg-gray-100" style={{ paddingBottom: `${aspectRatio}%` }}>
        {!imgLoaded && (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-100 animate-pulse" />
        )}
        <img
          src={card.src}
          alt={card.title}
          onLoad={() => setImgLoaded(true)}
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-all duration-500",
            imgLoaded ? "opacity-100 scale-100" : "opacity-0 scale-105",
            "group-hover:scale-105",
          )}
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300" />
        <button
          onClick={handleCollect}
          className={cn(
            "absolute top-3 right-3 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold shadow-md",
            "opacity-0 group-hover:opacity-100 transition-all duration-200 -translate-y-1 group-hover:translate-y-0",
            collected
              ? "bg-[#e05d6f] text-white"
              : "bg-white text-gray-700 hover:bg-[#e05d6f] hover:text-white",
          )}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={collected ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          {collectCount}
        </button>
        <div className="absolute bottom-3 left-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
          {card.tags.slice(0, 2).map(tag => (
            <span key={tag} className="bg-black/50 text-white text-xs px-2 py-0.5 rounded-full backdrop-blur-sm">
              #{tag}
            </span>
          ))}
        </div>
        {card.images && card.images.length > 1 && (
          <span className="absolute top-3 left-3 bg-black/40 text-white text-xs px-2 py-0.5 rounded-full backdrop-blur-sm">
            共{card.images.length}张
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-medium text-gray-800 line-clamp-2 leading-snug mb-2">{card.title}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <img src={card.avatar} alt={card.author} className="w-5 h-5 rounded-full bg-gray-200" />
            <span className="text-xs text-gray-400 truncate max-w-[80px]">{card.author}</span>
          </div>
          <button
            onClick={handleLike}
            className={cn(
              "flex items-center gap-1 text-xs transition-colors",
              liked ? "text-[#e05d6f]" : "text-gray-400 hover:text-[#e05d6f]",
            )}
          >
            <svg
              className={cn("w-3.5 h-3.5 transition-transform", liked && "scale-125")}
              viewBox="0 0 24 24"
              fill={liked ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            <span>{likeCount}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Masonry Grid ─────────────────────────────────────────────────────────────
/** 按累计列高分配卡片（配合真实宽高），实现错落瀑布流 */
function MasonryGrid({ cards, onCardClick }: { cards: ImageCard[]; onCardClick: (c: ImageCard) => void }) {
  const [cols, setCols] = useState(4);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 640) setCols(2);
      else if (w < 900) setCols(3);
      else if (w < 1200) setCols(4);
      else setCols(5);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const columns: ImageCard[][] = useMemo(() => {
    const buckets: ImageCard[][] = Array.from({ length: cols }, () => []);
    const heights = new Array(cols).fill(0);
    cards.forEach(card => {
      const ratio = card.width > 0 && card.height > 0 ? card.height / card.width : 0.75;
      const shortest = heights.indexOf(Math.min(...heights));
      buckets[shortest].push(card);
      heights[shortest] += ratio;
    });
    return buckets;
  }, [cards, cols]);

  return (
    <div className="flex gap-3 md:gap-4 items-start">
      {columns.map((col, ci) => (
        <div key={ci} className="flex-1 flex flex-col gap-3 md:gap-4">
          {col.map(card => (
            <Card key={card.id} card={card} onClick={() => onCardClick(card)} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
/** 侧栏话题 → 顶部导航分类 */
const topicNavMap: Record<string, string> = {
  "春日少女系": "壁纸头像",
  "ins风家居": "家居生活",
  "美食探店": "美食菜谱",
  "旅行日记": "旅行摄影",
  "手绘插画": "动漫插画",
};

function SideTopics({ onTopicClick }: { onTopicClick: (label: string) => void }) {
  const topics = [
    { icon: "🌸", label: "春日少女系", count: "12.3万图片" },
    { icon: "🏠", label: "ins风家居", count: "8.9万图片" },
    { icon: "🍜", label: "美食探店", count: "6.7万图片" },
    { icon: "✈️", label: "旅行日记", count: "15.2万图片" },
    { icon: "🎨", label: "手绘插画", count: "9.4万图片" },
  ];
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <h3 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-1">
        <span>🔥</span> 热门话题
      </h3>
      <div className="space-y-2">
        {topics.map(t => (
          <button
            key={t.label}
            onClick={() => onTopicClick(topicNavMap[t.label] ?? "推荐")}
            className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-[#fde8eb] group transition-colors text-left"
          >
            <span className="text-xl">{t.icon}</span>
            <div>
              <p className="text-sm font-medium text-gray-700 group-hover:text-[#e05d6f]">{t.label}</p>
              <p className="text-xs text-gray-400">{t.count}</p>
            </div>
          </button>
        ))}
      </div>
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
  const [feedEmptyReason, setFeedEmptyReason] = useState<"none" | "not_logged_in" | "no_following">("none");

  // 导航为中文标签，后端 board 统一使用英文 key
  const isFollowFeed = activeNav === FOLLOW_NAV;
  const boardKey = labelToBoard[activeNav] ?? "all";
  // 关注流暂不支持关键词检索，搜索条件仅作用于画板/推荐
  const effectiveSearch = isFollowFeed ? "" : search;

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
      q: effectiveSearch || undefined,
    });
    setTotal(data.total || 0);
    setHasMore((data.posts || []).length >= 20);
    return (data.posts || []).map(normalizePost);
  }, [isFollowFeed, user, boardKey, effectiveSearch]);

  // 分类/搜索/登录态变化时重新加载第一页
  useEffect(() => {
    setPage(1);
    setApiPosts([]);
    setHasMore(true);
    if (!isFollowFeed) setFeedEmptyReason("none");
    let cancelled = false;
    fetchPage(1)
      .then(posts => { if (!cancelled && posts) setApiPosts(posts); })
      .catch(() => showToast("加载帖子失败，请刷新重试", "error"));
    return () => { cancelled = true; };
  }, [isFollowFeed, user, activeNav, effectiveSearch, boardKey, fetchPage, showToast]);

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

          {isFollowFeed && allCards.length === 0 && feedEmptyReason === "not_logged_in" ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="text-6xl">🔒</div>
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
              <div className="text-6xl">🫶</div>
              <p className="text-gray-400 text-base">还没有关注任何人，关注 TA 们的更新会出现在这里</p>
              <div className="flex gap-3">
                <button
                  onClick={() => onNavChange("推荐")}
                  className="bg-[#e05d6f] text-white text-sm font-bold px-6 py-2.5 rounded-full hover:bg-[#c94d5e] transition-colors"
                >
                  去首页逛逛 →
                </button>
              </div>
            </div>
          ) : allCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="text-6xl">🌸</div>
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
                <p className="text-center text-gray-300 text-sm pb-10 pt-4">— 已经到底啦 🌸 —</p>
              )}
            </>
          )}
        </div>

        <aside className="hidden xl:block w-60 shrink-0 pt-2">
          <div className="sticky top-28 space-y-4">
            <SideTopics onTopicClick={onNavChange} />
            <div className="bg-gradient-to-br from-[#e05d6f] to-[#f0a0a8] rounded-2xl p-4 text-white shadow-md">
              <h3 className="font-bold text-sm mb-1">📱 下载堆糖App</h3>
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
