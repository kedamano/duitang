import { useEffect, useState } from "react";
import { api } from "../api";
import { useToast } from "../context/ToastContext";
import { Icon } from "./Icons";
import { cn } from "../utils/cn";
import type { Album } from "../types/api";

/** 选择专辑弹窗：把当前帖子收进某个专辑，或现场新建一个 */
export default function AlbumPickerModal({
  postId,
  onClose,
  onAdded,
}: {
  postId: number;
  onClose: () => void;
  onAdded?: (albumTitle: string) => void;
}) {
  const { showToast } = useToast();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.myAlbums()
      .then(d => { if (!cancelled) setAlbums(d.albums || []); })
      .catch(() => { if (!cancelled) showToast("专辑列表加载失败", "error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [showToast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const addTo = async (album: Album) => {
    setBusyId(album.id);
    try {
      await api.addPostToAlbum(album.id, postId);
      showToast(`已收进「${album.title}」`, "success");
      onAdded?.(album.title);
      onClose();
    } catch {
      showToast("收进专辑失败，请稍后重试", "error");
    } finally {
      setBusyId(null);
    }
  };

  const createAndAdd = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    try {
      const created = await api.createAlbum({ title });
      await api.addPostToAlbum(created.album.id, postId);
      showToast(`已收进「${title}」`, "success");
      onAdded?.(title);
      onClose();
    } catch {
      showToast("创建专辑失败，请稍后重试", "error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col shadow-2xl animate-fade-in" data-testid="album-picker">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="font-bold text-ink">收进专辑</h3>
          <button onClick={onClose} aria-label="关闭" className="text-mute hover:text-body transition-colors">
            <Icon name="close" className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-line">
          <div className="flex items-center gap-2">
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") createAndAdd(); }}
              maxLength={40}
              placeholder="新建专辑名称…"
              aria-label="新建专辑名称"
              className="flex-1 px-3 py-2 rounded-xl border border-line2 text-sm focus:outline-none focus:border-[#e05d6f]"
            />
            <button
              onClick={createAndAdd}
              disabled={!newTitle.trim() || creating}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-medium transition-colors",
                newTitle.trim() && !creating
                  ? "bg-[#e05d6f] text-white hover:bg-[#c94d5e]"
                  : "bg-soft2 text-mute cursor-not-allowed",
              )}
            >
              {creating ? "创建中" : "新建"}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-10 text-center text-sm text-mute">加载中...</div>
          ) : albums.length === 0 ? (
            <div className="py-10 text-center">
              <Icon name="folder" className="w-10 h-10 mx-auto mb-2 text-mute2" />
              <p className="text-sm text-mute">还没有专辑，先在上面建一个吧</p>
            </div>
          ) : (
            albums.map(album => (
              <button
                key={album.id}
                onClick={() => addTo(album)}
                disabled={busyId === album.id}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-soft last:border-0 text-left hover:bg-soft disabled:opacity-60 transition-colors"
              >
                <span className="w-9 h-9 rounded-xl bg-brand-soft text-[#e05d6f] flex items-center justify-center shrink-0">
                  <Icon name="folder" className="w-4 h-4" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-ink truncate">{album.title}</span>
                  <span className="block text-xs text-mute">
                    {album.post_count} 张{album.is_public ? "" : " · 私密"}
                  </span>
                </span>
                <Icon name="plus" className="w-4 h-4 text-mute2" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
