import { useEffect, useState } from "react";
import { api } from "../api";
import { useCollection } from "../context/CollectionContext";
import { useToast } from "../context/ToastContext";
import { boardToLabel, boardOptions, labelToBoard, type ImageCard } from "../data/images";
import { cn } from "../utils/cn";
import RichTextEditor from "./RichTextEditor";
import { isRichTextEmpty } from "../utils/richText";

/**
 * 帖子编辑弹窗（仅作者可见）。
 * 只提交可编辑的文本信息：标题、描述、画板、标签；图片与尺寸保持不变。
 */
export default function EditPostModal({
  card,
  onClose,
  onSaved,
}: {
  card: ImageCard;
  onClose: () => void;
  onSaved?: (post: any) => void;
}) {
  const { updateUserPost } = useCollection();
  const { showToast } = useToast();
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description || "");
  const [board, setBoard] = useState(boardToLabel[card.category] || boardOptions[0]);
  const [tagText, setTagText] = useState(card.tags.join(", "));
  const [saving, setSaving] = useState(false);

  // 切换卡片时同步表单，避免残留上一条帖子的内容
  useEffect(() => {
    setTitle(card.title);
    setDescription(card.description || "");
    setBoard(boardToLabel[card.category] || boardOptions[0]);
    setTagText(card.tags.join(", "));
  }, [card.id, card.title, card.description, card.category, card.tags]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    if (!title.trim()) {
      showToast("标题不能为空", "error");
      return;
    }
    setSaving(true);
    try {
      const tags = tagText.split(/[,，\s]+/).map(t => t.trim().replace(/^#/, "")).filter(Boolean).slice(0, 5);
      const data = await api.updatePost(card.id, {
        title: title.trim(),
        description: isRichTextEmpty(description) ? "" : description,
        board: labelToBoard[board] || board,
        tags,
      });
      updateUserPost(data.post);
      onSaved?.(data.post);
      showToast("已保存修改", "success");
      onClose();
    } catch (e: any) {
      showToast(e?.message || "保存失败，请稍后重试", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">编辑帖子</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="关闭">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label htmlFor="edit-title" className="block text-xs font-medium text-gray-500 mb-1.5">标题</label>
            <input
              id="edit-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={60}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#e05d6f] focus:ring-2 focus:ring-[#e05d6f]/10"
              placeholder="给这张图片起个标题"
            />
            <p className="text-[11px] text-gray-300 mt-1 text-right">{title.length}/60</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">描述</label>
            <RichTextEditor
              value={description}
              onChange={setDescription}
              placeholder="补充一点描述…"
              minHeight={100}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">画板</label>
            <div className="flex flex-wrap gap-2">
              {boardOptions.map(label => (
                <button
                  key={label}
                  onClick={() => setBoard(label)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                    board === label
                      ? "bg-[#e05d6f] text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="edit-tags" className="block text-xs font-medium text-gray-500 mb-1.5">标签（逗号分隔，最多 5 个）</label>
            <input
              id="edit-tags"
              value={tagText}
              onChange={e => setTagText(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#e05d6f] focus:ring-2 focus:ring-[#e05d6f]/10"
              placeholder="例如：少女心, 壁纸"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full text-sm text-gray-600 hover:bg-gray-100 transition-colors"
          >
            取消
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 rounded-full text-sm font-bold text-white bg-[#e05d6f] hover:bg-[#c94d5e] disabled:opacity-60 transition-colors"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
