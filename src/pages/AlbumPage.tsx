import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { normalizePost } from "../utils/normalizePost";
import { MasonryGrid, MasonrySkeleton } from "../components/MasonryGrid";
import { PostDetailModal } from "../components/PostDetail";
import { Icon } from "../components/Icons";
import { useToast } from "../context/ToastContext";
import { cn } from "../utils/cn";
import type { ImageCard } from "../data/images";

const PAGE_SIZE = 24;

/** 专辑详情页：/#/album/<id> */
export default function AlbumPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [album, setAlbum] = useState<any>(null);
  const [owner, setOwner] = useState<any>(null);
  const [ownedByMe, setOwnedByMe] = useState(false);
  const [cards, setCards] = useState<ImageCard[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<"none" | "missing" | "private">("none");
  const [selected, setSelected] = useState<ImageCard | null>(null);

  const loadFirst = useCallback(async () => {
    const albumId = parseInt(id, 10);
    if (!albumId) { setError("missing"); setLoading(false); return; }
    setLoading(true);
    setError("none");
    try {
      const data = await api.getAlbum(albumId, { page: 1, limit: PAGE_SIZE });
      setAlbum(data.album);
      setOwner(data.owner);
      setOwnedByMe(!!data.owned_by_me);
      const posts = (data.posts || []).map(normalizePost);
      setCards(posts);
      setTotal(data.total || 0);
      setHasMore(posts.length >= PAGE_SIZE);
      setPage(1);
    } catch (e: any) {
      // 403 表示私密专辑
      if (String(e?.message || "").includes("私密")) setError("private");
      else setError("missing");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadFirst(); }, [loadFirst]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const data = await api.getAlbum(parseInt(id, 10), { page: next, limit: PAGE_SIZE });
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

  const removeFromAlbum = async (postId: number) => {
    try {
      await api.removePostFromAlbum(parseInt(id, 10), postId);
      setCards(prev => prev.filter(c => c.id !== postId));
      setTotal(t => Math.max(0, t - 1));
      showToast("已移出专辑", "success");
    } catch {
      showToast("移出失败，请稍后重试", "error");
    }
  };

  const deleteAlbum = async () => {
    try {
      await api.deleteAlbum(parseInt(id, 10));
      showToast("专辑已删除", "success");
      navigate("/profile");
    } catch {
      showToast("删除失败，请稍后重试", "error");
    }
  };

  if (error !== "none") {
    return (
      <main className="max-w-screen-xl mx-auto px-4 py-24 text-center">
        <Icon name={error === "private" ? "lock" : "folder"} className="w-14 h-14 mx-auto mb-4 text-gray-300" />
        <p className="text-gray-500">{error === "private" ? "该专辑为私密，无法查看" : "专辑不存在或已被删除"}</p>
        <button
          onClick={() => navigate("/")}
          className="mt-5 bg-[#e05d6f] text-white text-sm font-bold px-6 py-2.5 rounded-full hover:bg-[#c94d5e] transition-colors"
        >
          回到首页
        </button>
      </main>
    );
  }

  return (
    <main className="max-w-screen-xl mx-auto px-4 md:px-6 py-6">
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-gray-400 hover:text-[#e05d6f] transition-colors flex items-center gap-1 mb-4"
      >
        <Icon name="arrowLeft" className="w-4 h-4" /> 返回
      </button>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6" data-testid="album-header">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold text-gray-800 flex items-center gap-2">
              {album?.title || "加载中…"}
              {album && !album.is_public && (
                <span className="text-[11px] font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">私密</span>
              )}
            </h1>
            {album?.description && <p className="text-sm text-gray-500 mt-1">{album.description}</p>}
            <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
              {owner && (
                <button
                  onClick={() => navigate(`/profile?user=${owner.id}`)}
                  className="flex items-center gap-1.5 hover:text-[#e05d6f] transition-colors"
                >
                  <img src={owner.avatar} alt="" className="w-5 h-5 rounded-full bg-gray-100" />
                  {owner.nickname}
                </button>
              )}
              <span>{total} 张图片</span>
            </div>
          </div>

          {ownedByMe && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={deleteAlbum}
                className="px-3 py-1.5 rounded-full text-xs text-red-500 hover:bg-red-50 transition-colors flex items-center gap-1"
              >
                <Icon name="trash" className="w-3.5 h-3.5" /> 删除专辑
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <MasonrySkeleton />
      ) : cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Icon name="folder" className="w-12 h-12 text-gray-300" />
          <p className="text-gray-400 text-sm">这个专辑还是空的</p>
          <button onClick={() => navigate("/")} className="text-sm text-[#e05d6f] hover:underline">
            去首页找图 →
          </button>
        </div>
      ) : (
        <>
          <MasonryGrid cards={cards} onCardClick={setSelected} />
          {hasMore && (
            <div className="flex justify-center py-8">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-6 py-2.5 rounded-full bg-white border border-gray-200 text-sm text-gray-600 hover:border-[#e05d6f] hover:text-[#e05d6f] disabled:opacity-60 transition-colors"
              >
                {loadingMore ? "加载中..." : "加载更多"}
              </button>
            </div>
          )}
        </>
      )}

      {selected && (
        <PostDetailModal
          card={selected}
          onClose={() => setSelected(null)}
        />
      )}

      {selected && ownedByMe && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[75]">
          <button
            onClick={() => removeFromAlbum(selected.id)}
            className={cn(
              "px-4 py-2 rounded-full bg-white shadow-lg border border-gray-200",
              "text-sm text-red-500 hover:bg-red-50 transition-colors",
            )}
          >
            从专辑移出《{selected.title}》
          </button>
        </div>
      )}
    </main>
  );
}
