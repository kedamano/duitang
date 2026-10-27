import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "../utils/cn";
import { prefetchPost } from "../utils/prefetch";
import { useAuth } from "../context/AuthContext";
import { useCollection } from "../context/CollectionContext";
import type { ImageCard } from "../data/images";

/** 单张图片卡片（首页 / 标签页 / 关注流共用） */
export function ImageTile({ card, onClick }: { card: ImageCard; onClick: () => void }) {
  const navigate = useNavigate();
  const { user, setShowLogin } = useAuth();
  const { isCollected, isLiked, toggleCollect, toggleLike, getLikeCount, getCollectCount } = useCollection();
  const collected = isCollected(card.id);
  const liked = isLiked(card.id);
  const likeCount = getLikeCount(card.id, card.likes);
  const collectCount = getCollectCount(card.id, card.collects);
  const [imgLoaded, setImgLoaded] = useState(false);
  const aspectRatio = (card.height / card.width) * 100;
  const hoverTimer = useRef<number | undefined>(undefined);

  // hover 120ms 才预取详情：鼠标快速掠过的卡片不发请求
  const handleEnter = () => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => prefetchPost(card.id), 120);
  };
  const handleLeave = () => window.clearTimeout(hoverTimer.current);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

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

  const handleTag = (e: React.MouseEvent, tag: string) => {
    e.stopPropagation();
    navigate(`/tag/${encodeURIComponent(tag)}`);
  };

  return (
    <div
      className="group relative bg-surface rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer hover:-translate-y-1 break-inside-avoid"
      onClick={onClick}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <div className="relative overflow-hidden bg-soft2" style={{ paddingBottom: `${aspectRatio}%` }}>
        {!imgLoaded && (
          <div className="absolute inset-0 bg-gradient-to-br from-soft2 to-soft animate-pulse" />
        )}
        <img
          src={card.thumb || card.src}
          srcSet={card.srcset || undefined}
          sizes="(max-width: 640px) 100vw, 330px"
          alt={card.title}
          loading="lazy"
          decoding="async"
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
          aria-label={collected ? "取消收集" : "收集这张图片"}
          aria-pressed={collected}
          className={cn(
            "absolute top-3 right-3 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold shadow-md",
            "opacity-0 group-hover:opacity-100 transition-all duration-200 -translate-y-1 group-hover:translate-y-0",
            collected
              ? "bg-[#e05d6f] text-white"
              : "bg-surface text-ink2 hover:bg-[#e05d6f] hover:text-white",
          )}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={collected ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          {collectCount}
        </button>
        <div className="absolute bottom-3 left-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
          {card.tags.slice(0, 2).map(tag => (
            <button
              key={tag}
              onClick={e => handleTag(e, tag)}
              className="bg-black/50 text-white text-xs px-2 py-0.5 rounded-full backdrop-blur-sm hover:bg-black/70"
            >
              #{tag}
            </button>
          ))}
        </div>
        {card.images && card.images.length > 1 && (
          <span className="absolute top-3 left-3 bg-black/40 text-white text-xs px-2 py-0.5 rounded-full backdrop-blur-sm">
            共{card.images.length}张
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-medium text-ink line-clamp-2 leading-snug mb-2">{card.title}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <img src={card.avatar} alt={card.author} loading="lazy" decoding="async" className="w-5 h-5 rounded-full bg-soft2" />
            <span className="text-xs text-mute truncate max-w-[80px]">{card.author}</span>
          </div>
          <button
            onClick={handleLike}
            aria-label={liked ? "取消点赞" : "点赞"}
            aria-pressed={liked}
            className={cn(
              "flex items-center gap-1 text-xs transition-colors",
              liked ? "text-[#e05d6f]" : "text-mute hover:text-[#e05d6f]",
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

/** 虚拟滚动：视口上下各多渲染的缓冲像素 */
const OVERSCAN = 600;
/** 卡片文字区（标题 + 作者行 + 内边距）的估算高度，真实高度测量后回填 */
const TEXT_BLOCK_H = 96;

/** 按累计列高分配卡片（配合真实宽高），实现错落瀑布流。
 * 卡片数量大时启用虚拟滚动：绝对定位 + 视口裁剪，只渲染可见区间（含 overscan）。
 * 容器宽度未知（jsdom / 首帧）时回退普通 flex 流，保证行为与旧版一致。 */
export function MasonryGrid({ cards, onCardClick }: { cards: ImageCard[]; onCardClick: (c: ImageCard) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(4);
  const [gap, setGap] = useState(16);
  const [width, setWidth] = useState(0);
  const [range, setRange] = useState({ top: 0, bottom: 900 });
  const [layoutTick, setLayoutTick] = useState(0);
  const heightsRef = useRef(new Map<number, number>());

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setCols(w < 640 ? 2 : w < 900 ? 3 : w < 1200 ? 4 : 5);
      setGap(w >= 768 ? 16 : 12);
      setRange({ top: window.scrollY, bottom: window.scrollY + window.innerHeight });
      if (ref.current) setWidth(ref.current.offsetWidth);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // 容器实际宽度（右侧栏出现/消失时随之变化）
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWidth(el.offsetWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onScroll = () => setRange({ top: window.scrollY, bottom: window.scrollY + window.innerHeight });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const layout = useMemo(() => {
    const colW = width > 0 ? (width - gap * (cols - 1)) / cols : 0;
    const items: { card: ImageCard; col: number; top: number; height: number }[] = [];
    const colHeights = new Array(cols).fill(0);
    if (colW > 0) {
      for (const card of cards) {
        const ratio = card.width > 0 && card.height > 0 ? card.height / card.width : 0.75;
        // 真实高度优先（测量缓存），未测量用「图片高 + 文字区」估算
        const h = heightsRef.current.get(card.id) ?? Math.round(colW * ratio + TEXT_BLOCK_H);
        const c = colHeights.indexOf(Math.min(...colHeights));
        items.push({ card, col: c, top: colHeights[c], height: h });
        colHeights[c] += h + gap;
      }
    }
    return { colW, items, total: Math.max(0, ...colHeights) };
  }, [cards, cols, gap, width, layoutTick]);

  const virtual = layout.colW > 0;
  const visible = virtual
    ? layout.items.filter(
        it => it.top + it.height >= range.top - OVERSCAN && it.top <= range.bottom + OVERSCAN,
      )
    : [];

  // 渲染后测量真实高度回填缓存；与估算差 >4px 时重算布局（收敛后不再触发）
  useEffect(() => {
    const el = ref.current;
    if (!el || !virtual) return;
    let changed = false;
    for (const node of Array.from(el.querySelectorAll<HTMLElement>("[data-vitem]"))) {
      const id = Number(node.dataset.vitem);
      const h = node.offsetHeight;
      if (h > 0 && Math.abs((heightsRef.current.get(id) ?? 0) - h) > 4) {
        heightsRef.current.set(id, h);
        changed = true;
      }
    }
    if (changed) setLayoutTick(t => t + 1);
  });

  // 回退模式：普通 flex 列（与旧实现一致）
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
    <div
      ref={ref}
      data-testid="masonry-grid"
      data-virtual={virtual ? "1" : "0"}
      className={virtual ? "relative" : "flex gap-3 md:gap-4 items-start"}
      style={virtual ? { height: layout.total } : undefined}
    >
      {virtual
        ? visible.map(it => (
            <div
              key={it.card.id}
              data-vitem={it.card.id}
              className="absolute top-0 left-0 will-change-transform"
              style={{
                width: layout.colW,
                transform: `translate3d(${Math.round(it.col * (layout.colW + gap))}px, ${Math.round(it.top)}px, 0)`,
              }}
            >
              <ImageTile card={it.card} onClick={() => onCardClick(it.card)} />
            </div>
          ))
        : columns.map((col, ci) => (
            <div key={ci} className="flex-1 flex flex-col gap-3 md:gap-4">
              {col.map(card => (
                <ImageTile key={card.id} card={card} onClick={() => onCardClick(card)} />
              ))}
            </div>
          ))}
    </div>
  );
}

/** 首屏加载占位，避免"没有内容"提示在数据回来前闪一下 */
export function MasonrySkeleton() {
  const heights = [220, 300, 180, 260, 200, 320, 240, 190, 280, 210, 170, 250];
  return (
    <div className="flex gap-3 md:gap-4 items-start" data-testid="masonry-skeleton" aria-hidden="true">
      {[0, 1, 2, 3].map(col => (
        <div key={col} className="flex-1 flex flex-col gap-3 md:gap-4">
          {heights.filter((_, i) => i % 4 === col).map((h, i) => (
            <div key={i} className="rounded-2xl bg-soft2/70 animate-pulse" style={{ height: h }} />
          ))}
        </div>
      ))}
    </div>
  );
}
