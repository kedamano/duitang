import { useNavigate } from "react-router-dom";
import { useTrending } from "../hooks/useTrending";
import { useAuth } from "../context/AuthContext";
import { useCollection } from "../context/CollectionContext";
import { Icon } from "../components/Icons";
import { cn } from "../utils/cn";

/** 发现页：热门作者 / 热门话题 / 新人（解决关注流冷启动） */
export default function DiscoverPage() {
  const navigate = useNavigate();
  const { data, loading } = useTrending();
  const { user, setShowLogin } = useAuth();
  const { isFollowing, toggleFollow } = useCollection();

  const handleFollow = (id: number) => {
    if (!user) { setShowLogin(true); return; }
    toggleFollow(id);
  };

  return (
    <main className="max-w-screen-xl mx-auto px-4 md:px-6 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-ink flex items-center gap-2">
          <Icon name="fire" className="w-6 h-6 text-[#e05d6f]" /> 发现
        </h1>
        <p className="text-sm text-mute mt-1">热门作者、热门话题与新鲜面孔</p>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-mute">加载中...</div>
      ) : !data ? (
        <div className="py-20 text-center text-sm text-mute">暂时没有可推荐的内容</div>
      ) : (
        <div className="space-y-8">
          {/* 热门作者 */}
          <section>
            <h2 className="text-sm font-bold text-ink2 mb-3 flex items-center gap-1.5">
              <Icon name="users" className="w-4 h-4 text-[#e05d6f]" /> 热门作者
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="trending-authors">
              {data.authors.map(a => {
                const followed = isFollowing(a.id);
                return (
                  <div key={a.id} className="flex items-center gap-3 bg-surface rounded-2xl border border-line p-3">
                    <button
                      onClick={() => navigate(`/profile?user=${a.id}`)}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left"
                    >
                      <img src={a.avatar} alt={a.nickname} loading="lazy" className="w-11 h-11 rounded-full bg-soft2 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink truncate">{a.nickname}</p>
                        <p className="text-xs text-mute truncate">
                          {a.post_count} 篇 · {a.score} 互动
                        </p>
                      </div>
                    </button>
                    {user?.id !== a.id && (
                      <button
                        onClick={() => handleFollow(a.id)}
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
              })}
            </div>
          </section>

          {/* 热门话题 */}
          <section>
            <h2 className="text-sm font-bold text-ink2 mb-3 flex items-center gap-1.5">
              <Icon name="tag" className="w-4 h-4 text-[#e05d6f]" /> 热门话题
            </h2>
            <div className="flex flex-wrap gap-2" data-testid="trending-tags">
              {data.tags.map(t => (
                <button
                  key={t.tag}
                  onClick={() => navigate(`/tag/${encodeURIComponent(t.tag)}`)}
                  className="text-sm px-3 py-1.5 rounded-full bg-surface border border-line2 text-body hover:border-[#e05d6f] hover:text-[#e05d6f] transition-colors"
                >
                  #{t.tag} <span className="text-mute2 text-xs ml-1">{t.count}</span>
                </button>
              ))}
            </div>
          </section>

          {/* 新人 */}
          <section>
            <h2 className="text-sm font-bold text-ink2 mb-3 flex items-center gap-1.5">
              <Icon name="user" className="w-4 h-4 text-[#e05d6f]" /> 新鲜面孔
            </h2>
            <div className="flex flex-wrap gap-3" data-testid="trending-new-users">
              {data.new_users.map(u => (
                <button
                  key={u.id}
                  onClick={() => navigate(`/profile?user=${u.id}`)}
                  className="flex items-center gap-2 bg-surface rounded-full border border-line pl-1.5 pr-4 py-1.5 hover:border-[#e05d6f] transition-colors"
                >
                  <img src={u.avatar} alt={u.nickname} loading="lazy" className="w-7 h-7 rounded-full bg-soft2" />
                  <span className="text-sm text-ink2">{u.nickname}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
