import { useCallback, useEffect } from "react";
import { useSwipe } from "../hooks/useSwipe";

/**
 * 全屏大图预览（灯箱）。
 * 支持左右切换、键盘 ←/→/Esc、点击遮罩关闭、移动端左右滑动切图。
 */
export default function ImageLightbox({
  images,
  index,
  onChange,
  onClose,
}: {
  images: string[];
  index: number;
  onChange: (next: number) => void;
  onClose: () => void;
}) {
  const count = images.length;
  const current = Math.min(Math.max(index, 0), Math.max(count - 1, 0));

  const go = useCallback((dir: number) => {
    if (count <= 1) return;
    onChange((current + dir + count) % count);
  }, [count, current, onChange]);

  // 移动端左右滑动切图（定义在所有早退之前，保证 hooks 顺序稳定）
  const swipe = useSwipe(() => go(1), () => go(-1), count > 1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  if (count === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="大图预览"
      data-testid="image-lightbox"
      onClick={onClose}
      {...swipe}
    >
      <img
        src={images[current]}
        alt={`第 ${current + 1} 张`}
        className="max-w-[92vw] max-h-[88vh] object-contain select-none"
        onClick={e => e.stopPropagation()}
      />

      <button
        onClick={e => { e.stopPropagation(); onClose(); }}
        aria-label="关闭预览"
        className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl leading-none"
      >
        ×
      </button>

      <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
        {current + 1} / {count}
      </span>

      {count > 1 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); go(-1); }}
            aria-label="上一张"
            className="absolute left-4 text-white/70 hover:text-white text-4xl leading-none px-2 py-4"
          >
            ‹
          </button>
          <button
            onClick={e => { e.stopPropagation(); go(1); }}
            aria-label="下一张"
            className="absolute right-4 text-white/70 hover:text-white text-4xl leading-none px-2 py-4"
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}
