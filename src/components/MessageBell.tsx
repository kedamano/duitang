import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { cn } from "../utils/cn";
import { Icon } from "./Icons";

/**
 * 顶栏私信入口：未读角标 + 实时推送。
 * 复用全局 SSE 通道（/api/notifications/stream），监听 message 事件刷新未读数；
 * 不支持 SSE 或断开时回落到 60s 轮询。
 */
export default function MessageBell() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!token) { setUnread(0); return; }
    let cancelled = false;
    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const refresh = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      api.getUnreadMessages()
        .then(d => { if (!cancelled) setUnread(d.count || 0); })
        .catch(() => { /* 失败静默，保留当前值 */ });
    };

    const startPolling = () => {
      if (pollTimer) return;
      pollTimer = setInterval(refresh, 60000);
    };

    refresh();

    if (typeof EventSource !== "undefined") {
      try {
        source = new EventSource(api.notificationStreamUrl(token));
        // 私信新消息：刷新未读（会话内容在 /messages 页内按需拉取）
        source.addEventListener("message", () => { if (!cancelled) refresh(); });
        source.addEventListener("error", () => {
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
    return () => {
      cancelled = true;
      source?.close();
      if (pollTimer) clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token]);

  if (!token) return null;

  return (
    <button
      onClick={() => navigate("/messages")}
      aria-label={`私信${unread > 0 ? `（${unread} 条未读）` : ""}`}
      data-testid="message-bell"
      className="relative p-2 rounded-full hover:bg-soft transition-colors"
    >
      <Icon name="mail" className="w-5 h-5 text-ink2" />
      {unread > 0 && (
        <span
          data-testid="message-unread-badge"
          className={cn(
            "absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#e05d6f] text-white",
            "text-[10px] font-bold flex items-center justify-center ring-2 ring-surface",
          )}
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}
