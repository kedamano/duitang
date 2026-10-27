import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useCollection } from "../context/CollectionContext";
import { cn } from "../utils/cn";
import { Icon } from "./Icons";
import type { UserBrief } from "../types/api";

type FollowUser = UserBrief & { bio?: string; is_following: boolean };

const PAGE_SIZE = 20;

/** 粉丝 / 关注列表弹窗 */
export default function FollowListModal({
  userId,
  mode,
  onClose,
}: {
  userId: number;
  mode: "followers" | "following";
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toggleFollow, isFollowing } = useCollection();
  const [users, setUsers] = useState<FollowUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const title = mode === "followers" ? "粉丝" : "关注";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const fetcher = mode === "followers" ? api.getFollowers : api.getFollowing;
    fetcher(userId, { page: 1, limit: PAGE_SIZE })
      .then(data => {
        if (cancelled) return;
        setUsers(data.users || []);
        setTotal(data.total || 0);
        setPage(1);
      })
      .catch(() => { if (!cancelled) setUsers([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loadMore = async () => {
    if (loadingMore || users.length >= total) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const fetcher = mode === "followers" ? api.getFollowers : api.getFollowing;
      const data = await fetcher(userId, { page: next, limit: PAGE_SIZE });
      setUsers(prev => {
        const map = new Map(prev.map(u => [u.id, u]));
        (data.users || []).forEach(u => map.set(u.id, u));
        return Array.from(map.values());
      });
      setPage(next);
      setTotal(data.total || 0);
    } catch {
      /* 保留已加载内容 */
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="font-bold text-ink">{title}（{total}）</h3>
          <button onClick={onClose} aria-label="关闭" className="text-mute hover:text-body transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-12 text-center text-sm text-mute">加载中...</div>
          ) : users.length === 0 ? (
            <div className="py-14 text-center">
              <Icon name={mode === "followers" ? "users" : "hand"} className="w-10 h-10 mx-auto mb-2 text-mute2" />
              <p className="text-sm text-mute">
                {mode === "followers" ? "还没有粉丝" : "还没有关注任何人"}
              </p>
            </div>
          ) : (
            users.map(u => {
              const followed = isFollowing(u.id) || u.is_following;
              return (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3 border-b border-soft last:border-0">
                  <button
                    onClick={() => { onClose(); navigate(`/profile?user=${u.id}`); }}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <img src={u.avatar} alt={u.nickname} loading="lazy" className="w-10 h-10 rounded-full bg-soft2 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{u.nickname}</p>
                      <p className="text-xs text-mute truncate">{u.bio || `@${u.username}`}</p>
                    </div>
                  </button>
                  {user && user.id !== u.id && (
                    <button
                      onClick={() => toggleFollow(u.id)}
                      className={cn(
                        "shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors",
                        followed
                          ? "bg-soft2 text-body2 hover:bg-soft2"
                          : "bg-[#e05d6f] text-white hover:bg-[#c94d5e]",
                      )}
                    >
                      {followed ? "已关注" : "关注"}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {users.length > 0 && users.length < total && (
          <div className="p-3 border-t border-line">
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
    </div>
  );
}
