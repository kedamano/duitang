import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "../utils/cn";
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
        <p className="text-sm font-medium text-gray-800 line-clamp-2 leading-snug mb-2">{card.title}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <img src={card.avatar} alt={card.author} loading="lazy" decoding="async" className="w-5 h-5 rounded-full bg-gray-200" />
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

/** 按累计列高分配卡片（配合真实宽高），实现错落瀑布流 */
export function MasonryGrid({ cards, onCardClick }: { cards: ImageCard[]; onCardClick: (c: ImageCard) => void }) {
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
            <div key={i} className="rounded-2xl bg-gray-200/70 animate-pulse" style={{ height: h }} />
          ))}
        </div>
      ))}
    </div>
  );
}
