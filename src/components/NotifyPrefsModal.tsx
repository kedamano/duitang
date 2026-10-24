import { useEffect, useState } from "react";
import { api } from "../api";
import { useToast } from "../context/ToastContext";
import { cn } from "../utils/cn";
import { Icon } from "./Icons";

type PrefsValue = boolean | "followers";

const TYPE_LABELS: { key: string; label: string; desc: string; icon: string }[] = [
  { key: "like", label: "点赞", desc: "有人赞了你的帖子", icon: "heart" },
  { key: "collect", label: "收藏", desc: "有人收藏了你的帖子", icon: "bookmark" },
  { key: "comment", label: "评论", desc: "有人评论了你的帖子", icon: "comment" },
  { key: "comment_like", label: "赞评论", desc: "有人赞了你的评论", icon: "thumbsUp" },
  { key: "reply", label: "回复", desc: "有人回复了你的评论", icon: "reply" },
  { key: "follow", label: "关注", desc: "有人关注了你", icon: "hand" },
  { key: "mention", label: "@ 提醒", desc: "有人在评论中提到你", icon: "bell" },
];

/** 通知偏好设置：按类型开关，或限定「仅关注的人」 */
export default function NotifyPrefsModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const [prefs, setPrefs] = useState<Record<string, PrefsValue>>({});
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getNotifyPrefs()
      .then(d => { if (!cancelled) setPrefs(d.prefs || {}); })
      .catch(() => {
        if (cancelled) return;
        // 加载失败时禁止保存：否则会把"未知"当成"全部开启"写回去
        setLoadFailed(true);
        showToast("通知设置加载失败", "error");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [showToast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 三态循环：开启 → 仅关注的人 → 关闭 → 开启
  // 注意：未保存过的类型其值为 undefined，按"开启"处理
  const cycle = (key: string) => setPrefs(prev => {
    const current = prev[key];
    const next = current === "followers" ? false : current === false ? true : "followers";
    return { ...prev, [key]: next };
  });

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.updateNotifyPrefs(prefs);
      setPrefs(res.prefs || {});
      showToast("通知设置已保存", "success");
      onClose();
    } catch {
      showToast("保存失败，请稍后重试", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-fade-in" data-testid="notify-prefs-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">通知设置</h3>
          <button onClick={onClose} aria-label="关闭" className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-2">
          {loading ? (
            <div className="py-10 text-center text-sm text-gray-400">加载中...</div>
          ) : loadFailed ? (
            <div className="py-10 text-center">
              <Icon name="warning" className="w-8 h-8 mx-auto mb-2 text-amber-500" />
              <p className="text-sm text-gray-400">设置加载失败，请关闭后重试</p>
            </div>
          ) : (
            TYPE_LABELS.map(t => {
              const value = prefs[t.key];
              const enabled = value !== false;
              const followersOnly = value === "followers";
              return (
                <div key={t.key} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
                  <Icon name={t.icon} className="w-5 h-5 text-gray-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">{t.label}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {followersOnly ? t.desc + "（仅关注的人）" : t.desc}
                    </p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={enabled}
                    aria-label={`${t.label}通知`}
                    onClick={() => cycle(t.key)}
                    className={cn(
                      "relative w-10 h-5 rounded-full transition-colors shrink-0",
                      enabled ? "bg-[#e05d6f]" : "bg-gray-200",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all",
                        enabled ? "left-[22px]" : "left-0.5",
                      )}
                    />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 rounded-full text-sm text-gray-600 hover:bg-gray-100 transition-colors">
            取消
          </button>
          <button
            onClick={save}
            disabled={saving || loading || loadFailed}
            className="px-5 py-2 rounded-full text-sm font-bold text-white bg-[#e05d6f] hover:bg-[#c94d5e] disabled:opacity-60 transition-colors"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
