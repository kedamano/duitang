import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AdminReportsPage from "./AdminReportsPage";
import { ToastProvider } from "../context/ToastContext";
import * as apiModule from "../api";

vi.mock("../api", () => ({
  AUTH_EXPIRED_EVENT: "duitang:auth-expired",
  AuthExpiredError: class extends Error {},
  api: {
    adminReports: vi.fn(),
    resolveReport: vi.fn(),
  },
}));

const pending = [
  {
    id: 1, target_type: "post", target_preview: "违规帖子内容", reason: "色情低俗",
    reporter_nickname: "举报人", created_at: "2026-01-02 10:00:00", status: "pending",
  },
  {
    id: 2, target_type: "comment", target_preview: null, reason: "",
    reporter_nickname: "路人", created_at: "2026-01-03 11:00:00", status: "pending",
  },
];

function renderPage() {
  return render(
    <ToastProvider>
      <AdminReportsPage />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (apiModule.api.adminReports as ReturnType<typeof vi.fn>).mockResolvedValue({ reports: pending });
  (apiModule.api.resolveReport as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
});

describe("AdminReportsPage", () => {
  it("加载并渲染待处理举报列表", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("report-list")).toBeInTheDocument());
    expect(apiModule.api.adminReports).toHaveBeenCalledWith("pending");
    expect(screen.getByText("违规帖子内容")).toBeInTheDocument();
    // 目标被删时显示占位；理由为空时显示「未填写」
    expect(screen.getByText("（内容已删除）")).toBeInTheDocument();
    expect(screen.getByText("理由：未填写")).toBeInTheDocument();
    // 类型中文标签
    expect(screen.getByText("帖子")).toBeInTheDocument();
    expect(screen.getByText("评论")).toBeInTheDocument();
  });

  it("切换标签重新请求对应状态", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("report-list")).toBeInTheDocument());
    fireEvent.click(screen.getByText("已处理"));
    await waitFor(() => expect(apiModule.api.adminReports).toHaveBeenCalledWith("resolved"));
  });

  it("删除内容：调用 resolve 并刷新列表", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("report-list")).toBeInTheDocument());
    fireEvent.click(screen.getAllByText("删除内容")[0]);
    await waitFor(() => expect(apiModule.api.resolveReport).toHaveBeenCalledWith(1, "delete"));
    // 初始 1 次 + 处理后刷新 1 次
    expect((apiModule.api.adminReports as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it("驳回：调用 resolve(id, reject)", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("report-list")).toBeInTheDocument());
    fireEvent.click(screen.getAllByText("驳回")[0]);
    await waitFor(() => expect(apiModule.api.resolveReport).toHaveBeenCalledWith(1, "reject"));
  });

  it("空状态显示占位", async () => {
    (apiModule.api.adminReports as ReturnType<typeof vi.fn>).mockResolvedValue({ reports: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText("该状态下暂无举报")).toBeInTheDocument());
  });

  it("加载失败时清空列表并提示", async () => {
    (apiModule.api.adminReports as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("无权限"));
    renderPage();
    await waitFor(() => expect(screen.getByText("无权限")).toBeInTheDocument());
    expect(screen.queryByTestId("report-list")).not.toBeInTheDocument();
  });
});
