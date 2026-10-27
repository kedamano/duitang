import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { cn } from "../utils/cn";
import { formatRelativeTime } from "../utils/formatTime";
import { Icon, IconBadge } from "./Icons";

interface Notice {
  id: number;
  type: string;
  is_read: boolean;
  created_at: string;
  post_id: number | null;
  comment_id: number | null;
  actor: { id: number; nickname: string; avatar: string };
  post_title: string;
  post_cover: string;
  comment_excerpt: string;
}

const TYPE_TEXT: Record<string, string> = {
  like: "赞了你的帖子",
  collect: "收藏了你的帖子",
  comment: "评论了你的帖子",
  comment_like: "赞了你的评论",
  reply: "回复了你的评论",
  mention: "提到了你",
  follow: "关注了你",
};

const TYPE_ICON: Record<string, { icon: string; className: string }> = {
  like: { icon: "heart", className: "bg-rose-50 text-rose-500" },
  collect: { icon: "bookmark", className: "bg-amber-50 text-amber-600" },
  comment: { icon: "comment", className: "bg-sky-50 text-sky-600" },
  comment_like: { icon: "thumbsUp", className: "bg-indigo-50 text-indigo-600" },
  reply: { icon: "reply", className: "bg-teal-50 text-teal-600" },
  mention: { icon: "bell", className: "bg-pink-50 text-pink-600" },
  follow: { icon: "hand", className: "bg-pink-50 text-pink-600" },
};

/** 顶部通知铃铛：未读角标 + 下拉面板 */
export default function NotificationBell() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // 未读数：优先 SSE 实时推送；不支持或断开时回落到轮询
  useEffect(() => {
    if (!token) { setUnread(0); setItems([]); return; }
    let cancelled = false;
    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const refresh = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      api.getUnreadCount()
        .then(d => { if (!cancelled) setUnread(d.count || 0); })
        .catch(() => {});
    };

    const startPolling = () => {
      if (pollTimer) return;
      pollTimer = setInterval(refresh, 60000);
    };

    refresh();

    if (typeof EventSource !== "undefined") {
      try {
        source = new EventSource(api.notificationStreamUrl(token));
        source.addEventListener("notification", ev => {
          if (cancelled) return;
          try {
            const data = JSON.parse((ev as MessageEvent).data);
            if (typeof data.unread === "number") setUnread(data.unread);
            else refresh();
          } catch { refresh(); }
        });
        source.addEventListener("error", () => {
          // 浏览器会自动重连；若被彻底关闭则回落轮询
          if (source && source.readyState === EventSource.CLOSED) startPolling();
        });
      } catch {
        startPolling();
      }
    } else {
      startPolling();
    }

    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      source?.close();
      if (pollTimer) clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [token]);

  // 点击外部或按 Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openPanel = async () => {
    const next = !open;
    setOpen(next);
    if (!next || !token) return;

    setLoading(true);
    try {
      const data = await api.getNotifications({ limit: 20, page: 1 });
      setItems(data.notifications || []);
      setTotal(data.total || 0);
      setPage(1);
      setUnread(data.unread || 0);
      // 打开即视为已读
      if ((data.unread || 0) > 0) {
        await api.markNotificationsRead();
        setUnread(0);
        setItems(prev => prev.map(n => ({ ...n, is_read: true })));
      }
    } catch {
      /* 通知加载失败不打断浏览 */
    } finally {
      setLoading(false);
    }
  };

  /** 加载更多通知（追加） */
  const loadMore = async () => {
    if (loadingMore || items.length >= total) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const data = await api.getNotifications({ limit: 20, page: next });
      setItems(prev => {
        const map = new Map(prev.map(n => [n.id, n]));
        (data.notifications || []).forEach(n => map.set(n.id, n));
        return Array.from(map.values());
      });
      setPage(next);
      setTotal(data.total || 0);
    } catch {
      /* 静默失败，保留已加载内容 */
    } finally {
      setLoadingMore(false);
    }
  };

  /** 清空全部通知 */
  const clearAll = async () => {
    try {
      await api.clearNotifications();
      setItems([]);
      setTotal(0);
      setUnread(0);
    } catch {
      /* 失败时保留列表 */
    }
  };

  const handleItemClick = (n: Notice) => {
    setOpen(false);
    if (n.type === "follow") navigate(`/profile?user=${n.actor.id}`);
    else if (n.post_id) navigate(`/pin/${n.post_id}`);
  };

  if (!token) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={openPanel}
        aria-label={unread > 0 ? `通知（${unread} 条未读）` : "通知"}
        className="relative flex items-center justify-center w-9 h-9 rounded-full text-body2 hover:text-[#e05d6f] hover:bg-soft transition-colors"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span
            data-testid="unread-badge"
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-[#e05d6f] text-white text-[10px] font-bold rounded-full flex items-center justify-center"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-80 max-h-[420px] overflow-y-auto bg-surface rounded-2xl shadow-xl border border-line z-50">
          <div className="sticky top-0 bg-surface px-4 py-3 border-b border-line flex items-center justify-between">
            <span className="text-sm font-bold text-ink">消息通知</span>
            <div className="flex items-center gap-3">
              {items.length > 0 && <span className="text-xs text-mute">{items.length}/{total} 条</span>}
              {items.length > 0 && (
                <button onClick={clearAll} className="text-xs text-mute hover:text-[#e05d6f] transition-colors">
                  清空
                </button>
              )}
            </div>
          </div>

          {loading && items.length === 0 ? (
            <div className="py-10 text-center text-sm text-mute">加载中...</div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center">
              <Icon name="bell" className="w-10 h-10 mx-auto mb-2 text-mute2" />
              <p className="text-sm text-mute">还没有新消息</p>
            </div>
          ) : (
            items.map(n => {
              const icon = TYPE_ICON[n.type] || { icon: "bell", className: "bg-soft text-body2" };
              return (
                <button
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={cn(
                    "w-full flex gap-3 px-4 py-3 text-left hover:bg-soft transition-colors border-b border-soft last:border-0",
                    !n.is_read && "bg-rose-50/40",
                  )}
                >
                  <img src={n.actor.avatar} alt="" loading="lazy" className="w-9 h-9 rounded-full bg-soft2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink2 leading-snug">
                      <span className="font-semibold">{n.actor.nickname}</span>{" "}
                      {TYPE_TEXT[n.type] || "有新动态"}
                    </p>
                    {n.type === "comment" && n.comment_excerpt && (
                      <p className="text-xs text-mute truncate mt-0.5">“{n.comment_excerpt}”</p>
                    )}
                    {n.post_title && n.type !== "follow" && (
                      <p className="text-xs text-mute truncate mt-0.5">《{n.post_title}》</p>
                    )}
                    <p className="text-[11px] text-mute2 mt-1">{formatRelativeTime(n.created_at)}</p>
                  </div>
                  {n.post_cover && n.type !== "follow" && (
                    <img src={n.post_cover} alt="" loading="lazy" className="w-11 h-11 rounded-lg object-cover bg-soft2 shrink-0" />
                  )}
                  <IconBadge name={icon.icon} className={icon.className} />
                </button>
              );
            })
          )}

          {items.length > 0 && items.length < total && (
            <div className="p-3 border-t border-soft">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-2 rounded-full text-xs text-body2 hover:text-[#e05d6f] hover:bg-soft disabled:opacity-60 transition-colors"
              >
                {loadingMore ? "加载中..." : "加载更多"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
