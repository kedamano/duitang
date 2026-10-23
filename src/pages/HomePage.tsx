const normalizePost = (p: any): ImageCard => ({
  id: p.id,
  src: (Array.isArray(p.images) ? p.images : JSON.parse(p.images || '[]'))[0] || '',
  title: p.title,
  description: p.description || '',
  author: p.author_nickname || '匿名',
  authorId: p.author_id,
  avatar: p.author_avatar || '',
  tags: Array.isArray(p.tags) ? p.tags : JSON.parse(p.tags || '[]'),
  category: p.board || 'all',
  likes: p.likes_count || 0,
  collects: p.collects_count || 0,
  comments: p.comments_count || 0,
  width: 400,
  height: 300,
});


import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { cn } from "../utils/cn";
import { useAuth } from "../context/AuthContext";
import { useCollection, type Comment } from "../context/CollectionContext";
import { useToast } from "../context/ToastContext";
import { api } from "../api";
import type { ImageCard } from "../data/images";

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
      className="group relative bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer hover:-translate-y-1 mb-4 break-inside-avoid"
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
function MasonryGrid({ cards, onCardClick }: { cards: ImageCard[]; onCardClick: (c: ImageCard) => void }) {
  const [cols, setCols] = useState(4);
  const ref = useRef<HTMLDivElement>(null);

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

  const columns: ImageCard[][] = Array.from({ length: cols }, () => []);
  cards.forEach((card, i) => columns[i % cols].push(card));

  return (
    <div ref={ref} className="flex gap-3 md:gap-4 items-start">
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

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function CommentItem({
  comment, currentUsername, onDelete, onLikeComment,
}: {
  comment: Comment;
  currentUsername: string | null;
  onDelete: (commentId: number) => void;
  onLikeComment: (commentId: number) => void;
}) {
  return (
    <div className="flex gap-2.5 group/comment">
      <img src={comment.avatar} alt={comment.author} className="w-8 h-8 rounded-full bg-gray-100 shrink-0 ring-1 ring-gray-200" />
      <div className="flex-1 min-w-0">
        <div className="bg-gray-50 rounded-2xl rounded-tl-none px-3 py-2">
          <p className="text-xs font-semibold text-gray-700 mb-0.5">{comment.author}</p>
          <p className="text-sm text-gray-600 leading-relaxed">{comment.content}</p>
        </div>
        <div className="flex items-center gap-3 mt-1 ml-2">
          <span className="text-xs text-gray-400">{new Date(comment.created_at).toLocaleDateString()}</span>
          <button
            onClick={() => onLikeComment(comment.id)}
            className={cn(
              "flex items-center gap-1 text-xs transition-colors",
              comment.liked ? "text-[#e05d6f]" : "text-gray-400 hover:text-[#e05d6f]"
            )}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill={comment.liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            {comment.likes > 0 && comment.likes}
          </button>
          {currentUsername === comment.author && (
            <button
              onClick={() => onDelete(comment.id)}
              className="text-xs text-gray-400 hover:text-red-400 transition-colors opacity-0 group-hover/comment:opacity-100"
            >
              删除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function DetailModal({ card, onClose }: { card: ImageCard; onClose: () => void }) {
  const { user, setShowLogin } = useAuth();
  const {
    isCollected, isLiked, toggleCollect, toggleLike,
    getLikeCount, getCollectCount, getCommentCount, getShareCount,
    comments, addComment, deleteComment, likeComment, sharePost, deletePost,
    isFollowing, toggleFollow,
  } = useCollection();

  const liked = isLiked(card.id);
  const collected = isCollected(card.id);
  const likeCount = getLikeCount(card.id, card.likes);
  const collectCount = getCollectCount(card.id, card.collects);
  const commentCount = getCommentCount(card.id);
  const shareCount = getShareCount(card.id);

  const [commentText, setCommentText] = useState("");
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [shareToast, setShareToast] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deletePostConfirm, setDeletePostConfirm] = useState(false);
  const commentListRef = useRef<HTMLDivElement>(null);

  const requireAuth = () => {
    if (!user) { setShowLogin(true); return true; }
    return false;
  };

  const handleLike = () => {
    if (requireAuth()) return;
    toggleLike(card.id);
  };

  const handleCollect = () => {
    if (requireAuth()) return;
    toggleCollect(card.id);
  };

  const handleSendComment = () => {
    if (!commentText.trim()) return;
    if (requireAuth()) return;
    addComment(card.id, commentText.trim());
    setCommentText("");
    setTimeout(() => commentListRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 100);
  };

  const handleDeleteComment = (commentId: number) => {
    deleteComment(card.id, commentId);
    setDeleteConfirmId(null);
  };

  const handleLikeComment = (commentId: number) => {
    if (requireAuth()) return;
    likeComment(card.id, commentId);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href + "#pin-" + card.id);
    } catch {
      const input = document.createElement("input");
      input.value = window.location.href + "#pin-" + card.id;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    sharePost(card.id);
    setShareToast("链接已复制到剪贴板！");
    setShowSharePanel(false);
    setTimeout(() => setShareToast(""), 2500);
  };

  const handleShareWechat = () => {
    sharePost(card.id);
    setShareToast("请截图分享到微信");
    setShowSharePanel(false);
    setTimeout(() => setShareToast(""), 2500);
  };

  const handleShareWeibo = () => {
    sharePost(card.id);
    const url = encodeURIComponent(window.location.href);
    const title = encodeURIComponent(`${card.title} - 来自堆糖`);
    window.open(`https://service.weibo.com/share/share.php?url=${url}&title=${title}`, "_blank");
    setShowSharePanel(false);
  };

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEsc);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  const cardComments = comments[card.id] ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl md:rounded-3xl overflow-hidden w-full max-w-3xl max-h-[95vh] md:max-h-[90vh] shadow-2xl flex flex-col md:flex-row animate-modal-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Left - Image */}
        <div className="relative md:w-1/2 bg-gray-100 flex-shrink-0 max-h-[40vh] md:max-h-full overflow-hidden">
          <img src={card.src} alt={card.title} className="w-full h-full object-cover" />
          <div className="absolute top-3 right-3 flex gap-2">
            <button
              onClick={() => setShowSharePanel(!showSharePanel)}
              className="w-8 h-8 bg-black/30 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/50 transition-colors"
              title="分享"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </button>
          </div>
          {/* Share panel */}
          {showSharePanel && (
            <div className="absolute top-12 right-3 bg-white rounded-2xl shadow-2xl p-4 w-52 animate-fade-in z-10">
              <p className="text-sm font-bold text-gray-700 mb-3">分享到</p>
              <div className="grid grid-cols-4 gap-3">
                <button onClick={handleCopyLink} className="flex flex-col items-center gap-1 group">
                  <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center group-hover:bg-[#fde8eb] transition-colors">
                    <svg className="w-5 h-5 text-gray-500 group-hover:text-[#e05d6f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                  <span className="text-xs text-gray-500">复制链接</span>
                </button>
                <button onClick={handleShareWechat} className="flex flex-col items-center gap-1 group">
                  <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center group-hover:bg-green-100 transition-colors">
                    <svg className="w-5 h-5 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178A1.17 1.17 0 014.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178 1.17 1.17 0 01-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 01.598.082l1.584.926a.272.272 0 00.14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 01-.023-.156.49.49 0 01.201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-7.062-6.122zM14.97 13.17c.535 0 .969.44.969.982a.976.976 0 01-.969.983.976.976 0 01-.969-.983c0-.542.434-.982.97-.982zm4.3 0c.535 0 .969.44.969.982a.976.976 0 01-.969.983.976.976 0 01-.969-.983c0-.542.434-.982.969-.982z"/>
                    </svg>
                  </div>
                  <span className="text-xs text-gray-500">微信</span>
                </button>
                <button onClick={handleShareWeibo} className="flex flex-col items-center gap-1 group">
                  <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center group-hover:bg-red-100 transition-colors">
                    <span className="text-sm font-bold text-red-500">微</span>
                  </div>
                  <span className="text-xs text-gray-500">微博</span>
                </button>
              </div>
              {shareCount > 0 && (
                <p className="text-xs text-gray-400 mt-3 text-center">已分享 {shareCount} 次</p>
              )}
            </div>
          )}
        </div>

        {/* Right - Content */}
        <div className="md:w-1/2 flex flex-col overflow-hidden">
          {/* Author header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-3">
              <img src={card.avatar} alt={card.author} className="w-10 h-10 rounded-full bg-gray-200 ring-2 ring-[#f0a0a8]" />
              <div>
                <p className="font-semibold text-gray-800 text-sm">{card.author}</p>
                <p className="text-xs text-gray-400">分享了这张图片</p>
              </div>
              {user && card.authorId && user.id !== card.authorId && (
                <button
                  onClick={() => toggleFollow(card.authorId!)}
                  className={cn(
                    "ml-2 px-3 py-1 rounded-full text-xs font-bold transition-colors",
                    isFollowing(card.authorId!)
                      ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      : "bg-[#e05d6f] text-white hover:bg-[#c94d5e]"
                  )}
                >
                  {isFollowing(card.authorId!) ? "已关注" : "+ 关注"}
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              {user && user.nickname === card.author && (
                <button
                  onClick={() => setDeletePostConfirm(true)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"
                >
                  删除
                </button>
              )}
              <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Title & tags */}
          <div className="px-4 pt-4 pb-2 shrink-0">
            <h2 className="font-bold text-gray-800 text-base mb-2">{card.title}</h2>
            <div className="flex flex-wrap gap-1.5 mb-1">
              {card.tags.map(tag => (
                <span key={tag} className="text-xs bg-[#fde8eb] text-[#e05d6f] px-3 py-1 rounded-full font-medium">
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          {deletePostConfirm && (
            <div className="px-4 pb-2 shrink-0">
              <div className="bg-red-50 rounded-2xl px-4 py-3">
                <p className="text-sm text-red-600 mb-2">确定删除这条帖子吗？删除后不可恢复。</p>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      const ok = await deletePost(card.id);
                      if (ok) onClose();
                      setDeletePostConfirm(false);
                    }}
                    className="text-xs bg-red-500 text-white px-3 py-1 rounded-full hover:bg-red-600 transition-colors"
                  >
                    删除
                  </button>
                  <button
                    onClick={() => setDeletePostConfirm(false)}
                    className="text-xs bg-gray-200 text-gray-600 px-3 py-1 rounded-full hover:bg-gray-300 transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Comments area */}
          <div ref={commentListRef} className="flex-1 overflow-y-auto px-4 py-2">
            <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
              <span>💬 评论区</span>
              <span className="text-xs text-gray-400 font-normal">({commentCount})</span>
            </p>
            {cardComments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <div className="text-3xl">💭</div>
                <p className="text-sm text-gray-400">还没有评论，来说点什么吧~</p>
              </div>
            ) : (
              <div className="space-y-4">
                {cardComments.map(c => (
                  <div key={c.id}>
                    {deleteConfirmId === c.id ? (
                      <div className="flex gap-2.5">
                        <img src={c.avatar} alt={c.author} className="w-8 h-8 rounded-full bg-gray-100 shrink-0" />
                        <div className="bg-red-50 rounded-2xl px-4 py-3 flex-1">
                          <p className="text-sm text-red-600 mb-2">确定删除这条评论吗？</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleDeleteComment(c.id)}
                              className="text-xs bg-red-500 text-white px-3 py-1 rounded-full hover:bg-red-600 transition-colors"
                            >
                              删除
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="text-xs bg-gray-200 text-gray-600 px-3 py-1 rounded-full hover:bg-gray-300 transition-colors"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <CommentItem
                        comment={c}
                        currentUsername={user?.username ?? null}
                        onDelete={(id) => setDeleteConfirmId(id)}
                        onLikeComment={handleLikeComment}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Share toast */}
          {shareToast && (
            <div className="absolute bottom-28 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-5 py-2.5 rounded-full shadow-lg animate-fade-in z-20">
              {shareToast}
            </div>
          )}

          {/* Bottom action bar */}
          <div className="border-t border-gray-100 p-3 shrink-0 bg-white">
            {/* Like / Collect / Share buttons */}
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={handleLike}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all",
                  liked
                    ? "bg-[#fde8eb] text-[#e05d6f]"
                    : "bg-gray-100 text-gray-600 hover:bg-[#fde8eb] hover:text-[#e05d6f]",
                )}
              >
                <svg className={cn("w-4 h-4 transition-transform", liked && "scale-110")} viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                {liked ? likeCount : likeCount}
              </button>
              <button
                onClick={handleCollect}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-sm font-bold transition-all",
                  collected
                    ? "bg-[#d94f60] text-white shadow-md shadow-[#e05d6f]/30"
                    : "bg-[#e05d6f] text-white hover:bg-[#c94d5e] shadow-md shadow-[#e05d6f]/30",
                )}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill={collected ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                {collected ? `已收集 ${collectCount}` : `收集图片 ${collectCount}`}
              </button>
              <button
                onClick={() => setShowSharePanel(!showSharePanel)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all",
                  showSharePanel
                    ? "bg-gray-800 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                )}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                {shareCount > 0 ? shareCount : "分享"}
              </button>
            </div>

            {/* Comment input */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSendComment(); }}
                  placeholder="说点什么吧..."
                  maxLength={200}
                  className="w-full bg-gray-100 rounded-full px-4 py-2.5 pr-16 text-sm outline-none focus:ring-2 focus:ring-[#e05d6f]/30 focus:bg-white text-gray-700 transition-all"
                />
                {user && (
                  <img src={user.avatar} alt="" className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gray-200" />
                )}
              </div>
              <button
                onClick={handleSendComment}
                disabled={!commentText.trim()}
                className={cn(
                  "px-5 py-2.5 rounded-full text-sm font-medium transition-all",
                  commentText.trim()
                    ? "bg-[#e05d6f] text-white hover:bg-[#c94d5e] shadow-sm"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed",
                )}
              >
                发送
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function SideTopics() {
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
          <button key={t.label} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-[#fde8eb] group transition-colors text-left">
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
  const { userPosts } = useCollection();
  const { showToast } = useToast();
  const [apiPosts, setApiPosts] = useState<ImageCard[]>([]);
  const [selectedCard, setSelectedCard] = useState<ImageCard | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);

  const navToCategoryMap: Record<string, string> = {
    "推荐": "all", "壁纸头像": "wallpaper", "动漫插画": "anime", "时尚穿搭": "fashion",
    "美食菜谱": "food", "手工DIY": "diy", "家居生活": "home", "美妆造型": "makeup",
    "旅行摄影": "travel", "古风汉服": "ancient", "萌宠植物": "pet", "文字句子": "quote", "婚纱婚礼": "wedding",
  };

  const boardKey = navToCategoryMap[activeNav] ?? "all";

  // 分类/搜索变化时重新加载第一页
  useEffect(() => {
    setPage(1);
    setApiPosts([]);
    setHasMore(true);
    let cancelled = false;
    api.getPosts({ limit: 20, page: 1, board: boardKey !== 'all' ? boardKey : undefined, q: search || undefined })
      .then(data => {
        if (cancelled) return;
        setApiPosts((data.posts || []).map(normalizePost));
        setTotal(data.total || 0);
        setHasMore((data.posts || []).length >= 20);
      })
      .catch(() => showToast("加载帖子失败，请刷新重试", "error"));
    return () => { cancelled = true; };
  }, [activeNav, search, boardKey, showToast]);

  // 合并用户发布(优先)与后端帖子
  const allCards = useMemo(() => {
    const map = new Map<number, ImageCard>();
    apiPosts.forEach(c => map.set(c.id, c));
    // 用户自己的帖子只在"推荐"或对应分类时显示，并叠加到顶部
    userPosts.forEach(c => {
      if (boardKey === 'all' || c.category === boardKey) {
        if (!search || c.title.includes(search) || c.tags.some((t: string) => t.includes(search)) || c.author.includes(search)) {
          map.set(c.id, c);
        }
      }
    });
    return Array.from(map.values());
  }, [userPosts, apiPosts, boardKey, search]);

  const displayCards = allCards;

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const data = await api.getPosts({ limit: 20, page: nextPage, board: boardKey !== 'all' ? boardKey : undefined, q: search || undefined });
      const next = (data.posts || []).map(normalizePost);
      setApiPosts(prev => {
        const map = new Map<number, ImageCard>();
        prev.forEach((c: ImageCard) => map.set(c.id, c));
        next.forEach((c: ImageCard) => map.set(c.id, c));
        return Array.from(map.values());
      });
      setPage(nextPage);
      setHasMore(next.length >= 20);
    } catch {
      showToast("加载更多失败，请稍后重试", "error");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page, boardKey, search, showToast]);


  return (
    <main className="max-w-screen-xl mx-auto">
      {activeNav === "推荐" && !search && <Banner />}

      <div className="flex gap-4 px-4 md:px-6">
        <div className="flex-1 min-w-0">
          {search && (
            <div className="mb-4 flex items-center gap-2">
              <p className="text-sm text-gray-500">
                搜索 <span className="text-[#e05d6f] font-semibold">"{search}"</span>，找到 {total} 张图片
              </p>
            </div>
          )}

          {displayCards.length === 0 ? (
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
              <MasonryGrid cards={displayCards} onCardClick={setSelectedCard} />
              {hasMore && (
                <LoadMoreButton onClick={handleLoadMore} loading={loadingMore} />
              )}
              {!hasMore && displayCards.length > 0 && (
                <p className="text-center text-gray-300 text-sm pb-10 pt-4">— 已经到底啦 🌸 —</p>
              )}
            </>
          )}
        </div>

        <aside className="hidden xl:block w-60 shrink-0 pt-2">
          <div className="sticky top-28 space-y-4">
            <SideTopics />
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
        <DetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />
      )}
    </main>
  );
}
