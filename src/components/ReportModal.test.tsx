import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../context/ToastContext";
import ReportModal from "./ReportModal";
import * as apiModule from "../api";

vi.mock("../api", () => ({
  AUTH_EXPIRED_EVENT: "duitang:auth-expired",
  AuthExpiredError: class extends Error {},
  api: {
    report: vi.fn(),
  },
}));

function renderModal(onClose = vi.fn()) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ReportModal targetType="post" targetId={7} targetTitle="一条帖子标题" onClose={onClose} />
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (apiModule.api.report as any).mockResolvedValue({ ok: true });
});

describe("ReportModal", () => {
  it("展示目标内容与举报原因选项", () => {
    renderModal();
    expect(screen.getByText("一条帖子标题")).toBeInTheDocument();
    expect(screen.getByText("垃圾广告")).toBeInTheDocument();
    expect(screen.getByText("色情低俗")).toBeInTheDocument();
  });

  it("提交时带上类型、目标与理由", async () => {
    const onClose = vi.fn();
    renderModal(onClose);

    await userEvent.click(screen.getByText("侵权 / 盗图"));
    await userEvent.click(screen.getByRole("button", { name: "提交举报" }));

    await waitFor(() => expect(apiModule.api.report).toHaveBeenCalled());
    const payload = (apiModule.api.report as any).mock.calls[0][0];
    expect(payload.target_type).toBe("post");
    expect(payload.target_id).toBe(7);
    expect(payload.reason).toBe("侵权 / 盗图");
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("补充说明会拼进理由", async () => {
    renderModal();
    await userEvent.type(screen.getByLabelText(/补充说明/), "这张图盗自我的");
    await userEvent.click(screen.getByRole("button", { name: "提交举报" }));
    await waitFor(() => expect(apiModule.api.report).toHaveBeenCalled());
    expect((apiModule.api.report as any).mock.calls[0][0].reason).toContain("这张图盗自我的");
  });

  it("提交失败时保留弹窗并提示", async () => {
    (apiModule.api.report as any).mockRejectedValue(new Error("网络异常"));
    const onClose = vi.fn();
    renderModal(onClose);
    await userEvent.click(screen.getByRole("button", { name: "提交举报" }));
    await waitFor(() => expect(apiModule.api.report).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });
});
