import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { normalizePost } from "../utils/normalizePost";
import { MasonryGrid, MasonrySkeleton } from "../components/MasonryGrid";
import { PostDetailModal } from "../components/PostDetail";
import { useToast } from "../context/ToastContext";
import { boardToLabel, categories, type ImageCard } from "../data/images";
import { cn } from "../utils/cn";
import { Icon } from "../components/Icons";

const PAGE_SIZE = 20;

/** 画板分组页：/#/board/<key>，可分享到具体分类 */
export default function BoardPage() {
  const { key = "" } = useParams<{ key: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [cards, setCards] = useState<ImageCard[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<ImageCard | null>(null);

  const label = boardToLabel[key] || key;

  const loadFirst = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    try {
      const data = await api.getPosts({ board: key, page: 1, limit: PAGE_SIZE });
      const posts = (data.posts || []).map(normalizePost);
      setCards(posts);
      setTotal(data.total || 0);
      setHasMore(posts.length >= PAGE_SIZE);
      setPage(1);
    } catch {
      showToast("画板内容加载失败，请稍后重试", "error");
    } finally {
      setLoading(false);
    }
  }, [key, showToast]);

  useEffect(() => { loadFirst(); }, [loadFirst]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const data = await api.getPosts({ board: key, page: next, limit: PAGE_SIZE });
      const posts = (data.posts || []).map(normalizePost);
      setCards(prev => {
        const map = new Map(prev.map(c => [c.id, c]));
        posts.forEach(c => map.set(c.id, c));
        return Array.from(map.values());
      });
      setPage(next);
      setHasMore(posts.length >= PAGE_SIZE);
    } catch {
      showToast("加载更多失败，请稍后重试", "error");
    } finally {
      setLoadingMore(false);
    }
  };

  const otherBoards = categories.filter(c => c.key !== "all" && c.key !== key);

  return (
    <main className="max-w-screen-xl mx-auto px-4 md:px-6 py-6">
      <div className="mb-5">
        <button onClick={() => navigate("/")} className="text-sm text-mute hover:text-[#e05d6f] transition-colors flex items-center gap-1">
          <Icon name="arrowLeft" className="w-4 h-4" /> 返回首页
        </button>
        <h1 className="text-2xl font-extrabold text-ink mt-1">{label}</h1>
        <p className="text-sm text-mute mt-1">
          {loading ? "正在加载..." : `共 ${total} 张图片`}
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2" data-testid="board-switcher">
        <span className="text-xs text-mute">其他画板：</span>
        {otherBoards.map(c => (
          <button
            key={c.key}
            onClick={() => navigate(`/board/${c.key}`)}
            className={cn(
              "text-xs px-3 py-1 rounded-full transition-colors",
              "bg-surface text-body border border-line2 hover:border-[#e05d6f] hover:text-[#e05d6f]",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <MasonrySkeleton />
      ) : cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Icon name="folder" className="w-14 h-14 text-mute2" />
          <p className="text-mute text-base">这个画板还没有内容</p>
          <button
            onClick={() => navigate("/")}
            className="bg-[#e05d6f] text-white text-sm font-bold px-6 py-2.5 rounded-full hover:bg-[#c94d5e] transition-colors flex items-center gap-1.5"
          >
            去首页逛逛 <Icon name="arrowRight" className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <MasonryGrid cards={cards} onCardClick={setSelected} />
          {hasMore ? (
            <div className="flex justify-center py-8">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-6 py-2.5 rounded-full bg-surface border border-line2 text-sm text-body hover:border-[#e05d6f] hover:text-[#e05d6f] disabled:opacity-60 transition-colors"
              >
                {loadingMore ? "加载中..." : "加载更多"}
              </button>
            </div>
          ) : (
            <p className="text-center text-mute2 text-sm pb-10 pt-4 flex items-center justify-center gap-1.5">
              — 已经到底啦 <Icon name="flower" className="w-4 h-4 inline" /> —
            </p>
          )}
        </>
      )}

      {selected && <PostDetailModal card={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}
