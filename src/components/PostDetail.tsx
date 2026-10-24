import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "../utils/cn";
import { useAuth } from "../context/AuthContext";
import { useCollection, type Comment } from "../context/CollectionContext";
import type { ImageCard } from "../data/images";
import { normalizePost } from "../utils/normalizePost";
import { renderContentWithMentions } from "../utils/mention";
import EditPostModal from "./EditPostModal";
import ImageLightbox from "./ImageLightbox";
import AlbumPickerModal from "./AlbumPickerModal";
import RichTextContent from "./RichTextContent";
import { Icon } from "./Icons";

// ─── Comment row ──────────────────────────────────────────────────────────────
/** 回复行（楼中楼内层） */
function ReplyRow({
  reply, canDelete, onDelete, onLike, onReply,
}: {
  reply: Comment;
  canDelete: boolean;
  onDelete: (commentId: number) => void;
  onLike: (commentId: number) => void;
  onReply: (reply: Comment) => void;
}) {
  return (
    <div className="flex gap-2 group/reply">
      <img src={reply.avatar} alt={reply.author} loading="lazy" decoding="async" className="w-6 h-6 rounded-full bg-gray-100 shrink-0 ring-1 ring-gray-200" />
      <div className="flex-1 min-w-0">
        <div className="bg-gray-50 rounded-2xl rounded-tl-none px-3 py-1.5">
          <p className="text-xs font-semibold text-gray-700 mb-0.5">
            {reply.author}
            {reply.reply_to_nickname && (
              <span className="font-normal text-gray-400"> 回复 <span className="text-[#e05d6f]">@{reply.reply_to_nickname}</span></span>
            )}
          </p>
          <p className="text-sm text-gray-600 leading-relaxed break-words whitespace-pre-wrap">
            {renderContentWithMentions(reply.content)}
          </p>
        </div>
        <div className="flex items-center gap-3 mt-0.5 ml-2">
          <button
            onClick={() => onLike(reply.id)}
            className={cn(
              "flex items-center gap-1 text-[11px] transition-colors",
              reply.liked ? "text-[#e05d6f]" : "text-gray-400 hover:text-[#e05d6f]",
            )}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill={reply.liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            {reply.likes > 0 && reply.likes}
          </button>
          <button onClick={() => onReply(reply)} className="text-[11px] text-gray-400 hover:text-[#e05d6f] transition-colors">
            回复
          </button>
          {canDelete && (
            <button
              onClick={() => onDelete(reply.id)}
              className="text-[11px] text-gray-400 hover:text-red-400 transition-colors opacity-0 group-hover/reply:opacity-100"
            >
              删除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function CommentItem({
  comment, currentUserId, canDelete, onDelete, onLike, onLoadReplies, onSubmitReply,
}: {
  comment: Comment;
  currentUserId: number | null;
  canDelete: boolean;
  onDelete: (commentId: number) => void;
  onLike: (commentId: number) => void;
  onLoadReplies: (commentId: number) => void;
  onSubmitReply: (parentId: number, content: string) => void;
}) {
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  // 回复的回复也挂到同一顶层，因此提交时始终用顶层 id
  const [targetId, setTargetId] = useState<number | null>(null);
  const replies = comment.replies || [];
  const replyCount = comment.reply_count || replies.length;
  // 楼中楼默认折叠，仅显示数量；点开后展开
  const [repliesOpen, setRepliesOpen] = useState(false);

  const submit = () => {
    const text = replyText.trim();
    if (!text) return;
    onSubmitReply(targetId ?? comment.id, text);
    setReplyText("");
    setReplying(false);
    setReplyTo(null);
    setTargetId(null);
    // 回复后展开，否则用户看不到自己刚发出的内容
    setRepliesOpen(true);
  };

  const startReply = (nickname: string | null, id?: number) => {
    setReplying(true);
    setReplyTo(nickname);
    setTargetId(id ?? null);
  };

  return (
    <div>
      <div className="flex gap-2.5 group/comment">
        <img src={comment.avatar} alt={comment.author} loading="lazy" decoding="async" className="w-8 h-8 rounded-full bg-gray-100 shrink-0 ring-1 ring-gray-200" />
        <div className="flex-1 min-w-0">
          <div className="bg-gray-50 rounded-2xl rounded-tl-none px-3 py-2">
            <p className="text-xs font-semibold text-gray-700 mb-0.5">{comment.author}</p>
            <p className="text-sm text-gray-600 leading-relaxed break-words whitespace-pre-wrap">
              {renderContentWithMentions(comment.content)}
            </p>
          </div>
          <div className="flex items-center gap-3 mt-1 ml-2">
            <span className="text-xs text-gray-400">{new Date(comment.created_at).toLocaleDateString()}</span>
            <button
              onClick={() => onLike(comment.id)}
              aria-label={comment.liked ? "取消点赞评论" : "点赞评论"}
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
            <button
              onClick={() => startReply(null)}
              className="text-xs text-gray-400 hover:text-[#e05d6f] transition-colors"
            >
              回复
            </button>
            {canDelete && (
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

      {/* 楼中楼回复：默认折叠，仅显示数量 */}
      {replies.length > 0 && (
        <div data-testid={`replies-${comment.id}`}>
          <button
            onClick={() => setRepliesOpen(o => !o)}
            className="ml-10 mt-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-[#e05d6f] transition-colors"
          >
            <span>{repliesOpen ? "收起回复" : `展开 ${replyCount} 条回复`}</span>
            <span className={cn("transition-transform", repliesOpen && "rotate-180")}>▾</span>
          </button>

          {repliesOpen && (
            <div className="ml-10 mt-2 space-y-2.5 border-l-2 border-gray-100 pl-3">
              {replies.map(r => (
                <ReplyRow
                  key={r.id}
                  reply={r}
                  canDelete={currentUserId != null && r.author_id === currentUserId}
                  onDelete={onDelete}
                  onLike={onLike}
                  onReply={reply => startReply(reply.author, comment.id)}
                />
              ))}
              {replyCount > replies.length && (
                <button
                  onClick={() => onLoadReplies(comment.id)}
                  className="text-xs text-[#e05d6f] hover:underline"
                >
                  加载更多回复（共 {replyCount} 条）
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 回复输入框 */}
      {replying && (
        <div className="ml-10 mt-2">
          <div className="flex items-center gap-2 bg-gray-50 rounded-2xl px-3 py-1.5 ring-1 ring-gray-200">
            <input
              autoFocus
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") setReplying(false); }}
              placeholder={replyTo ? `回复 @${replyTo}` : "写下你的回复..."}
              className="flex-1 bg-transparent text-sm focus:outline-none py-1"
              aria-label="回复内容"
            />
            <button onClick={submit} disabled={!replyText.trim()} className="text-xs text-[#e05d6f] disabled:text-gray-300">
              发送
            </button>
            <button onClick={() => setReplying(false)} className="text-xs text-gray-400 hover:text-gray-600">
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Comment list (with inline delete confirmation) ───────────────────────────
function CommentList({
  comments, currentUserId, onDelete, onLike, onLoadReplies, onSubmitReply,
}: {
  comments: Comment[];
  currentUserId: number | null;
  onDelete: (commentId: number) => void;
  onLike: (commentId: number) => void;
  onLoadReplies: (commentId: number) => void;
  onSubmitReply: (parentId: number, content: string) => void;
}) {
  const [confirmId, setConfirmId] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      {comments.map(c => (
        <div key={c.id}>
          {confirmId === c.id ? (
            <div className="flex gap-2.5">
              <img src={c.avatar} alt={c.author} loading="lazy" decoding="async" className="w-8 h-8 rounded-full bg-gray-100 shrink-0" />
              <div className="bg-red-50 rounded-2xl px-4 py-3 flex-1">
                <p className="text-sm text-red-600 mb-2">确定删除这条评论吗？</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { onDelete(c.id); setConfirmId(null); }}
                    className="text-xs bg-red-500 text-white px-3 py-1 rounded-full hover:bg-red-600 transition-colors"
                  >
                    删除
                  </button>
                  <button
                    onClick={() => setConfirmId(null)}
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
              currentUserId={currentUserId}
              canDelete={currentUserId != null && c.author_id === currentUserId}
              onDelete={setConfirmId}
              onLike={onLike}
              onLoadReplies={onLoadReplies}
              onSubmitReply={onSubmitReply}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Image pane with thumbnail switching ──────────────────────────────────────
export function DetailImage({ card, overlay }: { card: ImageCard; overlay?: React.ReactNode }) {
  const allImages = card.images && card.images.length > 0 ? card.images : [card.src];
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const src = allImages[Math.min(index, allImages.length - 1)];
  // 详情页展示尽量高清：每张图取最高档变体（原图）作为 src
  const largestUrl = (i: number) => {
    const variants = card.variants?.[i] || [];
    const biggest = variants.reduce((best, v) => (!best || v.width > best.width ? v : best), null as { url: string; width: number } | null);
    return biggest?.url || allImages[i];
  };
  const detailSrc = largestUrl(Math.min(index, allImages.length - 1));

  return (
    <div className="relative md:w-1/2 bg-gray-100 flex-shrink-0 max-h-[40vh] md:max-h-full overflow-hidden">
      <img
        src={detailSrc || src}
        alt={card.title}
        onClick={() => setLightbox(true)}
        className="w-full h-full object-cover cursor-zoom-in"
      />
      {overlay && <div className="absolute top-3 right-3 flex gap-2">{overlay}</div>}
      {allImages.length > 1 && (
        <>
          <span className="absolute top-3 left-3 bg-black/40 text-white text-xs px-2 py-1 rounded-full backdrop-blur-sm">
            {index + 1}/{allImages.length}
          </span>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {allImages.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                aria-label={`查看第 ${i + 1} 张`}
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  i === index ? "bg-white w-4" : "bg-white/50 hover:bg-white/80",
                )}
              />
            ))}
          </div>
        </>
      )}
      {lightbox && (
        <ImageLightbox
          images={allImages}
          index={index}
          onChange={setIndex}
          onClose={() => setLightbox(false)}
        />
      )}
    </div>
  );
}

// ─── Full detail body (shared by modal and page) ──────────────────────────────
export function usePostActions(card: ImageCard) {
  const { user, setShowLogin } = useAuth();
  const {
    isCollected, isLiked, toggleCollect, toggleLike,
    getLikeCount, getCollectCount,
    sharePost, deletePost,
  } = useCollection();

  const liked = isLiked(card.id);
  const collected = isCollected(card.id);
  const likeCount = getLikeCount(card.id, card.likes);
  const collectCount = getCollectCount(card.id, card.collects);

  const requireAuth = () => {
    if (!user) { setShowLogin(true); return true; }
    return false;
  };

  const handleLike = () => { if (!requireAuth()) toggleLike(card.id); };
  const handleCollect = () => { if (!requireAuth()) toggleCollect(card.id); };

  return {
    user, setShowLogin, liked, collected, likeCount, collectCount, requireAuth,
    handleLike, handleCollect, sharePost, deletePost,
  };
}

export function SharePanel({
  card, shareCount, onCopied, onClose,
}: {
  card: ImageCard;
  shareCount: number;
  onCopied: (msg: string) => void;
  onClose: () => void;
}) {
  const { sharePost } = useCollection();
  const detailUrl = `${window.location.origin}${window.location.pathname}#/pin/${card.id}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(detailUrl);
    } catch {
      const input = document.createElement("input");
      input.value = detailUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    sharePost(card.id);
    onCopied("链接已复制到剪贴板！");
    onClose();
  };

  const handleShareWechat = () => {
    sharePost(card.id);
    onCopied("请截图分享到微信");
    onClose();
  };

  const handleShareWeibo = () => {
    sharePost(card.id);
    const url = encodeURIComponent(detailUrl);
    const title = encodeURIComponent(`${card.title} - 来自堆糖`);
    window.open(`https://service.weibo.com/share/share.php?url=${url}&title=${title}`, "_blank");
    onClose();
  };

  return (
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
  );
}

export function ShareButton({ card }: { card: ImageCard }) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState("");
  const { getShareCount } = useCollection();
  const shareCount = getShareCount(card.id, card.shares ?? 0);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "w-8 h-8 bg-black/30 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/50 transition-colors",
          open && "bg-black/60",
        )}
        title="分享"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
      </button>
      {open && (
        <SharePanel
          card={card}
          shareCount={shareCount}
          onClose={() => setOpen(false)}
          onCopied={msg => { setToast(msg); setTimeout(() => setToast(""), 2500); }}
        />
      )}
      {toast && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-5 py-2.5 rounded-full shadow-lg animate-fade-in z-20">
          {toast}
        </div>
      )}
    </>
  );
}

// ─── Author header row ────────────────────────────────────────────────────────
export function DetailAuthorHeader({
  card, onClose, extra,
}: {
  card: ImageCard;
  onClose?: () => void;
  extra?: React.ReactNode;
}) {
  const { user } = useAuth();
  const { isFollowing, toggleFollow } = useCollection();
  const navigate = useNavigate();

  return (
    <div className="relative flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => card.authorId && navigate(`/profile?user=${card.authorId}`)}
          className="shrink-0"
          title="查看个人主页"
        >
          <img src={card.avatar} alt={card.author} className="w-10 h-10 rounded-full bg-gray-200 ring-2 ring-[#f0a0a8]" />
        </button>
        <div className="min-w-0">
          <p className="font-semibold text-gray-800 text-sm truncate">{card.author}</p>
          <p className="text-xs text-gray-400">分享了这张图片</p>
        </div>
        {user && card.authorId && user.id !== card.authorId && (
          <button
            onClick={() => toggleFollow(card.authorId!)}
            className={cn(
              "ml-2 px-3 py-1 rounded-full text-xs font-bold transition-colors shrink-0",
              isFollowing(card.authorId!)
                ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
                : "bg-[#e05d6f] text-white hover:bg-[#c94d5e]"
            )}
          >
            {isFollowing(card.authorId!) ? "已关注" : "+ 关注"}
          </button>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {extra}
        {onClose && (
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Delete-post confirm (author only, by id) ─────────────────────────────────
export function DeletePostControl({ card, onClose }: { card: ImageCard; onClose: () => void }) {
  const { user } = useAuth();
  const { deletePost } = useCollection();
  const [confirming, setConfirming] = useState(false);

  if (!user || user.id !== card.authorId) return null;

  return (
    <>
      {!confirming && (
        <button
          onClick={() => setConfirming(true)}
          className="px-3 py-1.5 rounded-full text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"
        >
          删除
        </button>
      )}
      {confirming && (
        <div className="absolute top-full right-2 mt-1 bg-white rounded-2xl px-4 py-3 shadow-2xl border border-red-100 z-20 w-64 animate-fade-in">
          <p className="text-sm text-red-600 mb-2">确定删除这条帖子吗？删除后不可恢复。</p>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                const ok = await deletePost(card.id);
                setConfirming(false);
                if (ok) onClose();
              }}
              className="text-xs bg-red-500 text-white px-3 py-1 rounded-full hover:bg-red-600 transition-colors"
            >
              删除
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-xs bg-gray-200 text-gray-600 px-3 py-1 rounded-full hover:bg-gray-300 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Edit control ─────────────────────────────────────────────────────────────
/** 编辑入口（仅作者可见） */
export function EditPostControl({ card, onSaved }: { card: ImageCard; onSaved?: (post: any) => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user || user.id !== card.authorId) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 rounded-full text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors"
      >
        编辑
      </button>
      {open && <EditPostModal card={card} onClose={() => setOpen(false)} onSaved={onSaved} />}
    </>
  );
}

// ─── Comment composer ─────────────────────────────────────────────────────────
export function CommentComposer({ card }: { card: ImageCard }) {
  const { user } = useAuth();
  const { requireAuth } = usePostActions(card);
  const { addComment } = useCollection();
  const [text, setText] = useState("");

  const send = () => {
    if (!text.trim()) return;
    if (requireAuth()) return;
    addComment(card.id, text.trim());
    setText("");
  };

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") send(); }}
          placeholder="说点什么吧..."
          maxLength={200}
          className="w-full bg-gray-100 rounded-full px-4 py-2.5 pr-16 text-sm outline-none focus:ring-2 focus:ring-[#e05d6f]/30 focus:bg-white text-gray-700 transition-all"
        />
        {user && (
          <img src={user.avatar} alt="" className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gray-200" />
        )}
      </div>
      <button
        onClick={send}
        disabled={!text.trim()}
        className={cn(
          "px-5 py-2.5 rounded-full text-sm font-medium transition-all",
          text.trim()
            ? "bg-[#e05d6f] text-white hover:bg-[#c94d5e] shadow-sm"
            : "bg-gray-200 text-gray-400 cursor-not-allowed",
        )}
      >
        发送
      </button>
    </div>
  );
}

export { CommentList };

// ─── Bottom action bar (like / collect / share + composer) ────────────────────
export function DetailActionBar({ card }: { card: ImageCard }) {
  const { liked, collected, likeCount, collectCount, handleLike, handleCollect, requireAuth } = usePostActions(card);
  const { getShareCount } = useCollection();
  const [showShare, setShowShare] = useState(false);
  const [showAlbumPicker, setShowAlbumPicker] = useState(false);
  const [toast, setToast] = useState("");
  const shareCount = getShareCount(card.id, card.shares ?? 0);

  return (
    <div className="border-t border-gray-100 p-3 shrink-0 bg-white relative">
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
          {likeCount}
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
          onClick={() => { if (!requireAuth()) setShowAlbumPicker(true); }}
          aria-label="收进专辑"
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium bg-gray-100 text-gray-600 hover:bg-[#fde8eb] hover:text-[#e05d6f] transition-all"
        >
          <Icon name="folder" className="w-4 h-4" />
          专辑
        </button>
        <button
          onClick={() => setShowShare(!showShare)}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all",
            showShare
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

      {showShare && (
        <div className="absolute bottom-20 right-3 z-20">
          <SharePanel
            card={card}
            shareCount={shareCount}
            onClose={() => setShowShare(false)}
            onCopied={msg => { setToast(msg); setTimeout(() => setToast(""), 2500); }}
          />
        </div>
      )}
      {toast && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-5 py-2.5 rounded-full shadow-lg animate-fade-in z-30 whitespace-nowrap">
          {toast}
        </div>
      )}

      <CommentComposer card={card} />

      {showAlbumPicker && (
        <AlbumPickerModal postId={card.id} onClose={() => setShowAlbumPicker(false)} />
      )}
    </div>
  );
}

// ─── Right-hand content column ────────────────────────────────────────────────
export function DetailContent({
  card, onClose, extraHeader, onCardUpdate,
}: {
  card: ImageCard;
  onClose: () => void;
  extraHeader?: React.ReactNode;
  onCardUpdate?: (post: any) => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { comments, deleteComment, likeComment, addComment, loadComments, loadMoreComments, loadMoreReplies, hasMoreComments, commentsAllTotal } = useCollection();
  const { requireAuth } = usePostActions(card);
  const cardComments = comments[card.id] ?? [];
  // 展示用总数包含楼中楼回复；分页判断用顶层数量
  const commentCount = commentsAllTotal[card.id] ?? card.comments ?? 0;

  // 打开详情时从后端拉取评论（原先只靠本次会话内存，刷新即丢）
  useEffect(() => {
    loadComments(card.id);
  }, [card.id, loadComments]);

  return (
    <div className="md:w-1/2 flex flex-col overflow-hidden">
      <DetailAuthorHeader
        card={card}
        onClose={onClose}
        extra={
          <>
            <EditPostControl card={card} onSaved={onCardUpdate} />
            <DeletePostControl card={card} onClose={onClose} />
          </>
        }
      />

      <div className="px-4 pt-4 pb-2 shrink-0">
        <h2 className="font-bold text-gray-800 text-base mb-2">{card.title}</h2>
        {card.description && (
          <RichTextContent content={card.description} className="mb-2" />
        )}
        <div className="flex flex-wrap gap-1.5 mb-1">
          {card.tags.map(tag => (
            <button
              key={tag}
              onClick={() => { onClose(); navigate(`/tag/${encodeURIComponent(tag)}`); }}
              className="text-xs bg-[#fde8eb] text-[#e05d6f] px-3 py-1 rounded-full font-medium hover:bg-[#f8d3d9] transition-colors"
            >
              #{tag}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2">
        <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
          <Icon name="comment" className="w-4 h-4 text-gray-500" /> 评论区
          <span className="text-xs text-gray-400 font-normal">({commentCount})</span>
        </p>
        {cardComments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Icon name="bubble" className="w-8 h-8 text-gray-300" />
            <p className="text-sm text-gray-400">还没有评论，来说点什么吧~</p>
          </div>
        ) : (
          <>
            <CommentList
              comments={cardComments}
              currentUserId={user?.id ?? null}
              onDelete={id => deleteComment(card.id, id)}
              onLike={id => { if (!requireAuth()) likeComment(card.id, id); }}
              onLoadReplies={commentId => loadMoreReplies(card.id, commentId)}
              onSubmitReply={(parentId, content) => {
                if (!requireAuth()) addComment(card.id, content, parentId);
              }}
            />
            {hasMoreComments(card.id) && (
              <div className="flex justify-center py-3">
                <button
                  onClick={() => loadMoreComments(card.id)}
                  className="text-xs text-[#e05d6f] hover:underline"
                >
                  加载更多评论（共 {commentCount} 条）
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <DetailActionBar card={card} />
      {extraHeader}
    </div>
  );
}

// ─── Shared modal (首页 / 个人主页 使用) ───────────────────────────────────────
export function PostDetailModal({ card, onClose }: { card: ImageCard; onClose: () => void }) {
  // 编辑保存后就地更新，避免弹窗里还显示旧标题
  const [displayCard, setDisplayCard] = useState(card);
  useEffect(() => { setDisplayCard(card); }, [card]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEsc);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl md:rounded-3xl overflow-hidden w-full max-w-3xl max-h-[95vh] md:max-h-[90vh] shadow-2xl flex flex-col md:flex-row animate-modal-in"
        onClick={e => e.stopPropagation()}
      >
        <DetailImage card={displayCard} overlay={<ShareButton card={displayCard} />} />
        <DetailContent
          card={displayCard}
          onClose={onClose}
          onCardUpdate={post => setDisplayCard(prev => ({ ...prev, ...normalizePost(post) }))}
        />
      </div>
    </div>
  );
}
