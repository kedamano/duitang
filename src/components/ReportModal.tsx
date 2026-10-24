import { useState } from "react";
import { api } from "../api";
import { useToast } from "../context/ToastContext";
import { Icon } from "./Icons";
import { cn } from "../utils/cn";

const REASONS = [
  "垃圾广告",
  "色情低俗",
  "不实信息",
  "侵权 / 盗图",
  "辱骂或人身攻击",
  "其他",
];

/** 举报弹窗：帖子 / 评论 / 用户 */
export default function ReportModal({
  targetType,
  targetId,
  targetTitle,
  onClose,
}: {
  targetType: "post" | "comment" | "user";
  targetId: number;
  targetTitle?: string;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [reason, setReason] = useState(REASONS[0]);
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await api.report({
        target_type: targetType,
        target_id: targetId,
        reason: detail.trim() ? `${reason}：${detail.trim()}` : reason,
      });
      showToast(res.duplicated ? "你已举报过该内容，我们会尽快处理" : "举报已提交，感谢反馈", "success");
      onClose();
    } catch (e: any) {
      showToast(e?.message || "举报失败，请稍后重试", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const typeLabel = targetType === "post" ? "帖子" : targetType === "comment" ? "评论" : "用户";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-fade-in" data-testid="report-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">举报{typeLabel}</h3>
          <button onClick={onClose} aria-label="关闭" className="text-gray-400 hover:text-gray-600 transition-colors">
            <Icon name="close" className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {targetTitle && (
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 line-clamp-2">{targetTitle}</p>
          )}

          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">举报原因</p>
            <div className="flex flex-wrap gap-2">
              {REASONS.map(r => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs transition-colors",
                    reason === r
                      ? "bg-[#e05d6f] text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="report-detail" className="block text-xs font-medium text-gray-500 mb-1.5">
              补充说明（可选）
            </label>
            <textarea
              id="report-detail"
              value={detail}
              onChange={e => setDetail(e.target.value)}
              rows={3}
              maxLength={200}
              placeholder="补充更多信息有助于我们处理…"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:border-[#e05d6f]"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 rounded-full text-sm text-gray-600 hover:bg-gray-100 transition-colors">
            取消
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-5 py-2 rounded-full text-sm font-bold text-white bg-[#e05d6f] hover:bg-[#c94d5e] disabled:opacity-60 transition-colors"
          >
            {submitting ? "提交中..." : "提交举报"}
          </button>
        </div>
      </div>
    </div>
  );
}
