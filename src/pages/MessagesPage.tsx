import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { cn } from "../utils/cn";
import { formatRelativeTime } from "../utils/formatTime";
import { Icon } from "../components/Icons";
import { CommentToolbar } from "../components/CommentToolbar";
import { renderCommentContent } from "../utils/mention";
import type { Conversation, DirectMessage } from "../types/api";

/**
 * 站内私信页：左侧会话列表 + 右侧聊天窗。
 * 选中会话拉取最新消息并 SSE 实时接收新消息；支持 /messages?to=:userId 直接进入。
 */
export default function MessagesPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** 记录最新消息 id，用于检测"新到达消息是否需要滚动到底部" */
  const lastIdRef = useRef<number>(0);

  const loadConversations = useCallback(async () => {
    if (!token) return;
    try {
      const d = await api.getConversations();
      setConversations(d.conversations);
    } catch { /* 失败静默 */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  /** 拉取某会话消息，并清零该会话未读 */
  const loadMessages = useCallback(async (id: number, opts?: { reset?: boolean }) => {
    try {
      const d = await api.getMessages(id, 1);
      setMessages(d.messages);
      setHasMore(d.hasMore);
      lastIdRef.current = d.messages[d.messages.length - 1]?.id || 0;
      setConversations(prev => prev.map(c => c.id === id ? { ...c, unread: 0 } : c));
      // 滚动到底部（reset 时；否则按是否贴近底部决定）
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;
        if (opts?.reset) el.scrollTop = el.scrollHeight;
      });
    } catch { /* 失败静默 */ }
  }, []);

  useEffect(() => {
    if (!activeId) { setMessages([]); setHasMore(false); return; }
    loadMessages(activeId, { reset: true });
    // 移除轮询，改为 SSE 实时驱动
  }, [activeId, loadMessages]);

  /** 加载更早的历史消息（分页追加到顶部） */
  const loadMore = async () => {
    if (!activeId || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      // 找到当前最早消息的页：从最后一页往前拉
      const curPage = Math.max(1, Math.ceil(messages.length / 20) + 1);
      const d = await api.getMessages(activeId, curPage);
      if (d.messages.length === 0) { setHasMore(false); return; }
      const older = d.messages.filter(m => m.id < lastIdRef.current);
      if (older.length === 0) { setHasMore(false); return; }
      setMessages(prev => [...older, ...prev]);
      setHasMore(d.hasMore);
      // 保持滚动位置
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop -= (el.scrollHeight - (el.scrollTop + el.clientHeight));
      });
    } catch { /* 失败静默 */ }
    finally { setLoadingMore(false); }
  };

  /** SSE 实时接收私信 */
  useEffect(() => {
    if (!token || typeof EventSource === "undefined") return;
    let es: EventSource;
    try {
      es = new EventSource(api.notificationStreamUrl(token));
      es.addEventListener("message", (ev) => {
        try {
          const d = JSON.parse((ev as MessageEvent).data);
          if (d.conversation_id === activeId && activeId != null) {
            // 当前会话有新消息：追加（后端已推完整消息行）
            setMessages(prev => [...prev, {
              id: Number(d.id),
              sender_id: Number(d.sender_id),
              content: d.content,
              created_at: d.created_at,
              is_read: d.is_read ?? 1,
              sender_nickname: d.sender_nickname || "",
              sender_avatar: d.sender_avatar || "",
            }]);
            lastIdRef.current = Number(d.id);
            loadMessages(activeId);
            requestAnimationFrame(() => {
              const el = scrollRef.current;
              if (el) el.scrollTop = el.scrollHeight;
            });
          } else {
            // 非当前会话：刷新列表（未读数/最后一条）
            loadConversations();
          }
        } catch { /* 忽略坏帧 */ }
      });
    } catch { /* SSE 不可用 */ }
    return () => { try { es?.close(); } catch {} };
  }, [token, activeId, loadMessages, loadConversations]);

  /** 消息变化后滚动到底部（仅当用户在底部附近时） */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) < 80) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  /** /messages?to=:userId → 直接打开与某人会话 */
  useEffect(() => {
    const to = params.get("to");
    if (!to || !token) return;
    let cancelled = false;
    api.startConversationWith(Number(to))
      .then(d => {
        if (cancelled) return;
        setActiveId(d.id);
        loadConversations();
        setParams({}, { replace: true });
      })
      .catch(() => { /* 拉黑等情况静默 */ });
    return () => { cancelled = true; };
  }, [params, token, loadConversations, setParams]);

  const activeConv = conversations.find(c => c.id === activeId);

  const send = async () => {
    const content = text.trim();
    if (!content || !activeId || sending) return;
    setSending(true);
    try {
      const r = await api.sendConvMessage(activeId, content);
      setText("");
      // 追加本地消息（含最新时间），再刷新列表
      setMessages(prev => [...prev, {
        id: r.id,
        sender_id: user?.id || 0,
        content: r.content,
        created_at: r.created,
        is_read: 0,
        sender_nickname: user?.nickname || "",
        sender_avatar: user?.avatar || "",
      }]);
      await loadMessages(activeId);
      await loadConversations();
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    } catch { /* 失败静默 */ }
    finally { setSending(false); }
  };

  if (!token) {
    return (
      <div className="max-w-screen-xl mx-auto px-4 md:px-6 py-16 text-center" data-testid="messages-page">
        <p className="text-body mb-3">登录后查看私信</p>
        <button onClick={() => navigate("/")} className="px-4 py-2 rounded-full bg-[#e05d6f] text-white text-sm">去登录</button>
      </div>
    );
  }

  return (
    <div className="max-w-screen-xl mx-auto px-2 md:px-6 py-3 md:py-6" data-testid="messages-page">
      <h1 className="text-base md:text-lg font-bold text-ink mb-3 flex items-center gap-2">
        <Icon name="mail" className="w-5 h-5 text-[#e05d6f]" /> 私信
      </h1>
      <div className="flex gap-2 md:gap-4 h-[calc(100vh-7rem)] md:h-[calc(100vh-11rem)] min-h-[400px]">
        {/* 会话列表（小屏：选中后隐藏；大屏始终可见） */}
        <aside
          className={cn("w-full md:w-72 lg:w-80 shrink-0 bg-surface rounded-2xl border border-line overflow-y-auto", activeId && "hidden md:block")}
          data-testid="conversation-list"
        >
          {loading ? (
            <div className="p-3 space-y-3">{[...Array(4)].map((_, i) => (
              <div key={i} className="flex gap-2.5"><div className="w-10 h-10 rounded-full bg-soft2" /><div className="flex-1 space-y-2"><div className="h-3 bg-soft2 rounded" /><div className="h-3 bg-soft2 rounded w-2/3" /></div></div>
            ))}</div>
          ) : conversations.length === 0 ? (
            <p className="p-6 text-sm text-mute text-center">还没有私信，去别人主页打个招呼吧</p>
          ) : conversations.map(c => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              data-testid="conversation-item"
              className={cn("w-full flex gap-2.5 p-3 text-left transition-colors hover:bg-soft", c.id === activeId && "bg-soft")}
            >
              <img src={c.other_avatar} alt="" className="w-10 h-10 rounded-full bg-soft2 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-medium text-ink truncate">{c.other_nickname}</span>
                  <span className="text-[11px] text-mute shrink-0">{formatRelativeTime(c.last_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <p className="text-xs text-mute truncate">{c.last_message}</p>
                  {c.unread > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#e05d6f] text-white text-[10px] font-bold flex items-center justify-center shrink-0">{c.unread}</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </aside>

        {/* 聊天窗 */}
        <div className={cn("flex-1 flex flex-col bg-surface rounded-2xl border border-line min-w-0", !activeId && "hidden md:flex")}>
          {activeConv ? (
            <>
              <header className="flex items-center gap-2.5 p-3 border-b border-line shrink-0">
                <button onClick={() => navigate(`/profile?user=${activeConv.other_id}`)} className="flex items-center gap-2 min-w-0" aria-label="查看主页">
                  <img src={activeConv.other_avatar} alt="" className="w-8 h-8 rounded-full bg-soft2" />
                  <span className="text-sm font-medium text-ink truncate">{activeConv.other_nickname}</span>
                </button>
                <button onClick={() => setActiveId(null)} className="md:hidden ml-auto text-mute text-sm" aria-label="返回会话列表">返回</button>
              </header>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 md:p-4 space-y-1" data-testid="message-list">
                {loadingMore && <div className="text-center text-mute text-xs py-2">加载中…</div>}
                {!loadingMore && hasMore && (
                  <button onClick={loadMore} className="text-center text-[#e05d6f] text-xs py-2 w-full hover:bg-soft rounded-lg">
                    加载更早的消息
                  </button>
                )}
                {messages.length === 0 && <p className="text-center text-mute text-sm py-8">还没有消息，说点什么吧</p>}
                {messages.map(m => {
                  const mine = m.sender_id === user?.id;
                  return (
                    <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                      <div className={cn(
                        "max-w-[78%] md:max-w-[72%] rounded-2xl px-2.5 md:px-3 py-2 text-sm break-words",
                        mine ? "bg-[#e05d6f] text-white rounded-br-sm" : "bg-soft text-body rounded-bl-sm",
                      )}>
                        {renderCommentContent(m.content)}
                      </div>
                      {mine && (m.is_read === 1 ? (
                        <span className="text-[10px] text-mute mt-0.5 mr-1">已读</span>
                      ) : (
                        <span className="text-[10px] text-mute2 mt-0.5 mr-1">已送达</span>
                      ))}
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-line p-2 md:p-3 flex gap-1.5 md:gap-2 items-center shrink-0">
                <CommentToolbar inputRef={inputRef} value={text} onChange={setText} canUpload={!!user} emojiUp />
                <input
                  ref={inputRef}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
                  placeholder="发条私信..."
                  maxLength={1000}
                  aria-label="私信内容"
                  className="flex-1 bg-soft2 rounded-full px-3 md:px-4 py-2 md:py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#e05d6f]/30 text-ink2 min-w-0"
                />
                <button
                  onClick={send}
                  disabled={!text.trim() || sending}
                  className={cn("px-3 md:px-5 py-2 md:py-2.5 rounded-full text-sm font-medium shrink-0 transition-colors",
                    text.trim() && !sending ? "bg-[#e05d6f] text-white hover:bg-[#c94d5e]" : "bg-soft2 text-mute cursor-not-allowed")}
                >发送</button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-mute text-sm">选择一个会话开始聊天</div>
          )}
        </div>
      </div>
    </div>
  );
}
