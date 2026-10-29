import { useRef } from "react";

/**
 * 水平滑动手势（移动端切图用）。
 * 判定：横向位移 > 48px 且明显大于纵向位移（避免与页面滚动冲突）。
 * 返回可直接展开到容器上的 touch 事件处理器。
 */
export function useSwipe(onLeft: () => void, onRight: () => void, enabled = true) {
  const start = useRef<{ x: number; y: number } | null>(null);

  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start.current = t ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!enabled || !s) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) onLeft(); else onRight();
    },
  };
}
