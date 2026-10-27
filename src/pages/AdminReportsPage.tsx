import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useToast } from "../context/ToastContext";
import { Icon } from "../components/Icons";
import { cn } from "../utils/cn";

type Tab = "pending" | "resolved" | "rejected";

const TARGET_LABEL: Record<string, string> = { post: "帖子", comment: "评论", user: "用户" };

/** 管理员审核队列：/#/admin/reports */
export default function AdminReportsPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("pending");
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.adminReports(tab);
      setReports(data.reports || []);
    } catch (e: any) {
      showToast(e?.message || "加载审核队列失败", "error");
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [tab, showToast]);

  useEffect(() => { load(); }, [load]);

  const resolve = async (id: number, action: "delete" | "reject") => {
    setBusyId(id);
    try {
      await api.resolveReport(id, action);
      showToast(action === "delete" ? "已删除违规内容" : "已驳回举报", "success");
      await load();
    } catch (e: any) {
      showToast(e?.message || "处理失败", "error");
    } finally {
      setBusyId(null);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "pending", label: "待处理" },
    { key: "resolved", label: "已处理" },
    { key: "rejected", label: "已驳回" },
  ];

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-6 py-6">
      <h1 className="text-2xl font-extrabold text-ink flex items-center gap-2">
        <Icon name="shield" className="w-6 h-6 text-[#e05d6f]" /> 审核队列
      </h1>
      <p className="text-sm text-mute mt-1">处理用户举报的违规内容</p>

      <div className="flex border-b border-line mt-4">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex-1 text-center py-3 text-sm font-medium transition-colors border-b-2",
              tab === t.key ? "border-[#e05d6f] text-[#e05d6f]" : "border-transparent text-mute hover:text-body",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-mute">加载中...</div>
      ) : reports.length === 0 ? (
        <div className="py-20 text-center">
          <Icon name="shield" className="w-14 h-14 mx-auto mb-3 text-mute2" />
          <p className="text-mute text-sm">该状态下暂无举报</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3" data-testid="report-list">
          {reports.map(r => (
            <div key={r.id} className="bg-surface rounded-2xl border border-line p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-soft text-[#e05d6f] font-medium">
                      {TARGET_LABEL[r.target_type] || r.target_type}
                    </span>
                    <span className="text-xs text-mute">
                      {r.reporter_nickname} 举报于 {String(r.created_at).slice(0, 16)}
                    </span>
                  </div>
                  <p className="text-sm text-ink line-clamp-2">{r.target_preview || "（内容已删除）"}</p>
                  <p className="text-xs text-mute mt-1">理由：{r.reason || "未填写"}</p>
                </div>
              </div>

              {r.status === "pending" && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => resolve(r.id, "delete")}
                    disabled={busyId === r.id}
                    className="px-4 py-1.5 rounded-full text-xs font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-60 transition-colors"
                  >
                    删除内容
                  </button>
                  <button
                    onClick={() => resolve(r.id, "reject")}
                    disabled={busyId === r.id}
                    className="px-4 py-1.5 rounded-full text-xs font-medium bg-soft2 text-body hover:bg-soft2 disabled:opacity-60 transition-colors"
                  >
                    驳回
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
