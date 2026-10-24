import { useEffect, useState } from "react";
import { api } from "../api";
import { useToast } from "../context/ToastContext";
import { Icon } from "./Icons";
import { cn } from "../utils/cn";

/** 新建专辑弹窗（个人主页使用） */
export default function CreateAlbumModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (album: any) => void;
}) {
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await api.createAlbum({ title: title.trim(), description: description.trim(), is_public: isPublic });
      showToast("专辑已创建", "success");
      onCreated?.(res.album);
      onClose();
    } catch (e: any) {
      showToast(e?.message || "创建失败，请稍后重试", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-fade-in" data-testid="create-album-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">新建专辑</h3>
          <button onClick={onClose} aria-label="关闭" className="text-gray-400 hover:text-gray-600 transition-colors">
            <Icon name="close" className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label htmlFor="album-title" className="block text-xs font-medium text-gray-500 mb-1.5">专辑名称</label>
            <input
              id="album-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={40}
              autoFocus
              placeholder="例如：夏日壁纸收藏"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#e05d6f]"
            />
          </div>
          <div>
            <label htmlFor="album-desc" className="block text-xs font-medium text-gray-500 mb-1.5">描述（可选）</label>
            <textarea
              id="album-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              maxLength={200}
              placeholder="这个专辑收录什么？"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:border-[#e05d6f]"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={e => setIsPublic(e.target.checked)}
              className="w-4 h-4 accent-[#e05d6f]"
            />
            公开（关闭后仅自己可见）
          </label>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 rounded-full text-sm text-gray-600 hover:bg-gray-100 transition-colors">
            取消
          </button>
          <button
            onClick={submit}
            disabled={!title.trim() || saving}
            className={cn(
              "px-5 py-2 rounded-full text-sm font-bold text-white transition-colors",
              title.trim() && !saving ? "bg-[#e05d6f] hover:bg-[#c94d5e]" : "bg-gray-200 text-gray-400 cursor-not-allowed",
            )}
          >
            {saving ? "创建中..." : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}
