import { useNavigate } from "react-router-dom";
import { cn } from "../utils/cn";
import { formatRelativeTime } from "../utils/formatTime";
import { useAuth } from "../context/AuthContext";
import { useCollection } from "../context/CollectionContext";
import { Icon } from "./Icons";
import type { ImageCard } from "../data/images";

/**
 * 帖子整版卡片：作者头 + 标题 + 方图网格 + 三栏操作条（参考堆糖每日精选）。
 *
 * 圆角分层（全站统一约定，勿随手改）：
 * - 容器类（卡片/弹层）：rounded-2xl
 * - 纯图片内容：rounded-xl / rounded-lg
 * - 评论气泡：rounded-2xl + 不对称圆角（rounded-tl-none 等）
 * 边框 vs 阴影：feed 卡片去边框、只留阴影（hover 抬升），避免两者叠加显重。
 */
export function PostCard({ card, onOpen }: { card: ImageCard; onOpen: (c: ImageCard) => void }) {
  const navigate = useNavigate();
  const { user, setShowLogin } = useAuth();
  const { isLiked, isCollected, toggleLike, toggleCollect, getLikeCount, getCollectCount } = useCollection();

  const liked = isLiked(card.id);
  const collected = isCollected(card.id);
  const likeCount = getLikeCount(card.id, card.likes);
  const collectCount = getCollectCount(card.id, card.collects);
  const images = card.images && card.images.length > 0 ? card.images : [card.src];
  const thumbs = card.thumbs && card.thumbs.length === images.length ? card.thumbs : images;
  const single = images.length === 1;

  const guard = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) { setShowLogin(true); return; }
    fn();
  };

  return (
    <article
      data-testid="post-card"
      className="group bg-surface rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
    >
      {/* 作者头 */}
      <header className="flex items-center gap-3 px-5 pt-5 pb-4">
        <button
          onClick={e => { e.stopPropagation(); if (card.authorId) navigate(`/profile?user=${card.authorId}`); }}
          className="flex items-center gap-3 min-w-0"
          aria-label={`查看 ${card.author} 的主页`}
        >
          <img src={card.avatar} alt="" loading="lazy" className="w-11 h-11 rounded-full bg-soft2 shrink-0" />
          <div className="text-left min-w-0">
            <p className="text-base font-semibold text-ink truncate">{card.author}</p>
            <p className="text-xs text-mute mt-0.5">
              {formatRelativeTime(card.date || "") || "热门内容"}
            </p>
          </div>
        </button>
      </header>

      {/* 标题 */}
      {card.title && (
        <button
          onClick={() => onOpen(card)}
          className="block w-full text-left px-5 pb-4 text-[15px] font-medium text-ink2 hover:text-[#e05d6f] transition-colors line-clamp-2"
        >
          {card.title}
        </button>
      )}

      {/* 方图网格：多图 3 列，单图限宽避免变形 */}
      <div className={cn("px-5 pb-5", single ? "" : "grid grid-cols-3 gap-2")}>
        {images.slice(0, 9).map((src, i) => (
          <button
            key={i}
            onClick={() => onOpen(card)}
            aria-label={`查看《${card.title}》第 ${i + 1} 张`}
            className={cn(
              "overflow-hidden bg-soft2 transition-transform duration-300 hover:scale-[1.02]",
              single
                ? "block rounded-xl max-w-[300px]"
                : "aspect-square rounded-lg",
            )}
          >
            <img
              src={thumbs[i] || src}
              alt={i === 0 ? card.title : ""}
              loading="lazy"
              decoding="async"
              className={cn("w-full", single ? "h-auto block" : "h-full object-cover")}
            />
          </button>
        ))}
      </div>

      {/* 三栏操作条 */}
      <footer className="grid grid-cols-3 border-t border-line text-center">
        <button
          onClick={guard(() => toggleLike(card.id))}
          aria-label={liked ? "取消点赞" : "点赞"}
          aria-pressed={liked}
          className={cn(
            "flex items-center justify-center gap-2 py-3.5 text-sm transition-colors hover:bg-soft",
            liked ? "text-[#e05d6f]" : "text-body2",
          )}
        >
          <svg className={cn("w-[18px] h-[18px]", liked && "animate-like-pop")} viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <span className="tabular-nums">{likeCount}</span>
        </button>
        <button
          onClick={guard(() => toggleCollect(card.id))}
          aria-label={collected ? "取消收集" : "收集"}
          aria-pressed={collected}
          className={cn(
            "flex items-center justify-center gap-2 py-3.5 text-sm transition-colors border-x border-line hover:bg-soft",
            collected ? "text-amber" : "text-body2",
          )}
        >
          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill={collected ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          <span className="tabular-nums">{collectCount}</span>
        </button>
        <button
          onClick={() => onOpen(card)}
          aria-label="查看更多"
          className="flex items-center justify-center gap-2 py-3.5 text-sm text-body2 transition-colors hover:bg-soft"
        >
          <Icon name="list" className="w-[18px] h-[18px]" />
          <span>更多</span>
        </button>
      </footer>
    </article>
  );
}

/** 整版帖子流（每日精选 / 关注动态用） */
export default function PostCardFeed({
  cards, onOpen,
}: {
  cards: ImageCard[];
  onOpen: (c: ImageCard) => void;
}) {
  return (
    <div className="max-w-2xl mx-auto space-y-5" data-testid="post-card-feed">
      {cards.map(card => (
        <PostCard key={card.id} card={card} onOpen={onOpen} />
      ))}
    </div>
  );
}

/** 整版流的加载骨架 */
export function PostCardSkeleton() {
  return (
    <div className="max-w-2xl mx-auto space-y-5" data-testid="post-card-skeleton" aria-hidden="true">
      {[0, 1].map(i => (
        <div key={i} className="bg-surface rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-full skeleton" />
            <div className="space-y-2">
              <div className="h-3.5 w-24 skeleton rounded" />
              <div className="h-2.5 w-16 skeleton rounded" />
            </div>
          </div>
          <div className="h-4 w-2/5 skeleton rounded mb-4" />
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, j) => (
              <div key={j} className="aspect-square rounded-lg skeleton" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
