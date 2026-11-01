import { useState, useRef, useEffect } from "react";
import type { RefObject } from "react";
import { api } from "../api";
import { cn } from "../utils/cn";

const COMMENT_EMOJIS = ["😀","😄","😂","🥰","😍","🤩","😮","😭","😅","🙃","👍","👏","🙏","💪","🎉","❤️","🔥","✨","🌹","🍰","🐱","🐶","🌸","🌙"];

/**
 * 评论/私信通用输入工具条：表情选择器 + 贴图（在输入框光标处插入）。
 * 可独立复用于评论框、回复框、私信输入框。
 */
export function CommentToolbar({
  inputRef, value, onChange, canUpload, emojiUp = true,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (v: string) => void;
  canUpload: boolean;
  /** 表情面板弹出方向：true 向上（底部输入框），false 向下（列表内回复框） */
  emojiUp?: boolean;
}) {
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);

  // 表情面板点击外部关闭（Escape 也关闭）
  useEffect(() => {
    if (!showEmoji) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || emojiBtnRef.current?.contains(t)) return;
      setShowEmoji(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowEmoji(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showEmoji]);

  /** 在输入框光标处插入文本（表情 / 图片 markdown），插入后恢复光标 */
  const insertAtCursor = (text: string) => {
    const el = inputRef.current;
    if (!el) { onChange(value + text); return; }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      try { el.setSelectionRange(pos, pos); } catch { /* 部分输入不支持 */ }
    });
  };

  const handlePickImage = async (file: File) => {
    setUploading(true);
    try {
      const r = await api.upload(file);
      insertAtCursor(`![](${r.thumb || r.url})`);
    } catch { /* 上传失败静默，按钮回弹 */ }
    finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="relative flex items-center gap-1 shrink-0">
      <button
        ref={emojiBtnRef}
        type="button"
        onClick={() => setShowEmoji(s => !s)}
        aria-label="插入表情"
        title="表情"
        className="w-8 h-8 rounded-full hover:bg-soft2 text-base leading-none transition-colors"
      >😊</button>
      {canUpload && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label="添加图片"
          title="插入图片"
          className="w-8 h-8 rounded-full hover:bg-soft2 text-base leading-none transition-colors disabled:opacity-50"
        >{uploading ? "…" : "🖼"}</button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handlePickImage(f); }}
      />
      {showEmoji && (
        <div
          ref={panelRef}
          className={cn(
            "absolute left-0 mb-2 bg-surface rounded-2xl shadow-xl border border-line p-2 z-20 grid grid-cols-6 gap-1 w-[216px] animate-fade-in",
            emojiUp ? "bottom-full" : "top-full mt-2 mb-0",
          )}
          role="dialog"
          aria-label="表情面板"
          data-testid="emoji-panel"
        >
          {COMMENT_EMOJIS.map(e => (
            <button
              key={e}
              type="button"
              onMouseDown={ev => ev.preventDefault()}
              onClick={() => { insertAtCursor(e); setShowEmoji(false); }}
              className="w-8 h-8 rounded-lg hover:bg-soft text-lg leading-none transition-colors"
              aria-label={`插入表情 ${e}`}
            >{e}</button>
          ))}
        </div>
      )}
    </div>
  );
}
