import { useEffect, useRef, useState } from "react";
import { cn } from "../utils/cn";
import { categories, FOLLOW_NAV } from "../data/images";
import { Icon } from "./Icons";

/** 画板 key → 图标名（下拉面板用） */
const BOARD_ICONS: Record<string, string> = {
  wallpaper: "face", anime: "palette", fashion: "sparkle", food: "bowl",
  diy: "edit", home: "home", makeup: "flower", travel: "plane",
  ancient: "tag", pet: "heart", quote: "quote", wedding: "bookmark",
};

/**
 * 分类下拉面板：顶栏不再平铺全部画板，
 * 点「分类 ▾」弹出图标网格选择；选中后按钮显示当前分类名并高亮。
 */
export default function CategoryDropdown({
  activeNav, onSelect, variant = "tab",
}: {
  activeNav: string;
  onSelect: (label: string) => void;
  /** tab=下划线入口（顶栏导航行）；row=侧栏竖排条目 */
  variant?: "tab" | "row";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isCategory = activeNav !== "推荐" && activeNav !== FOLLOW_NAV;
  const boards = categories.filter(c => c.key !== "all");

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        data-testid="category-trigger"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex items-center gap-1 text-sm font-medium transition-colors whitespace-nowrap",
          variant === "tab"
            ? cn(
              "px-4 py-3 border-b-2",
              isCategory
                ? "border-[#e05d6f] text-[#e05d6f]"
                : "border-transparent text-body2 hover:text-[#e05d6f]",
            )
            : cn(
              "w-full px-3 py-2.5 rounded-xl text-left gap-2",
              isCategory
                ? "bg-brand-soft text-[#e05d6f]"
                : "text-body2 hover:bg-soft hover:text-ink2",
            ),
        )}
      >
        {variant === "row" && <Icon name="folder" className="w-4 h-4" />}
        {isCategory ? activeNav : variant === "row" ? "全部分类" : "分类"}
        <svg className={cn("w-3.5 h-3.5 transition-transform duration-200 ml-auto", variant === "tab" && "ml-0", open && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          data-testid="category-panel"
          className="absolute left-0 top-full z-50 mt-1 w-64 bg-surface rounded-2xl shadow-xl border border-line p-3 animate-fade-in"
        >
          <p className="text-xs text-mute px-2 pb-2">全部分类</p>
          <div className="grid grid-cols-3 gap-1">
            {boards.map(c => (
              <button
                key={c.key}
                type="button"
                data-nav-item={c.label}
                onClick={() => { onSelect(c.label); setOpen(false); }}
                className={cn(
                  "flex flex-col items-center gap-1.5 py-3 rounded-xl transition-colors",
                  activeNav === c.label
                    ? "bg-brand-soft text-[#e05d6f]"
                    : "text-body2 hover:bg-soft hover:text-[#e05d6f]",
                )}
              >
                <Icon name={BOARD_ICONS[c.key] || "tag"} className="w-5 h-5" />
                <span className="text-xs">{c.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
