import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../context/ToastContext";
import NotifyPrefsModal from "./NotifyPrefsModal";
import * as apiModule from "../api";

vi.mock("../api", () => ({
  AUTH_EXPIRED_EVENT: "duitang:auth-expired",
  AuthExpiredError: class extends Error {},
  api: {
    getNotifyPrefs: vi.fn(),
    updateNotifyPrefs: vi.fn(),
  },
}));

function renderModal(onClose = vi.fn()) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <NotifyPrefsModal onClose={onClose} />
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (apiModule.api.getNotifyPrefs as any).mockResolvedValue({
    prefs: {}, types: ["like", "collect", "comment", "comment_like", "reply", "follow"],
  });
});

describe("NotifyPrefsModal", () => {
  it("默认全部开启", async () => {
    renderModal();
    const like = await screen.findByRole("switch", { name: "点赞通知" });
    expect(like).toHaveAttribute("aria-checked", "true");
  });

  it("已关闭的类型显示为关闭", async () => {
    (apiModule.api.getNotifyPrefs as any).mockResolvedValue({ prefs: { like: false }, types: [] });
    renderModal();
    const like = await screen.findByRole("switch", { name: "点赞通知" });
    expect(like).toHaveAttribute("aria-checked", "false");
  });

  it("切换后保存提交对应偏好", async () => {
    (apiModule.api.updateNotifyPrefs as any).mockResolvedValue({ prefs: { like: false } });
    renderModal();
    const like = await screen.findByRole("switch", { name: "点赞通知" });
    await userEvent.click(like);
    expect(like).toHaveAttribute("aria-checked", "false");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(apiModule.api.updateNotifyPrefs).toHaveBeenCalled());
    expect((apiModule.api.updateNotifyPrefs as any).mock.calls[0][0].like).toBe(false);
  });

  it("保存成功后关闭弹窗", async () => {
    (apiModule.api.updateNotifyPrefs as any).mockResolvedValue({ prefs: {} });
    const onClose = vi.fn();
    renderModal(onClose);
    await screen.findByRole("switch", { name: "点赞通知" });
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("加载失败时显示错误态且禁止保存", async () => {
    (apiModule.api.getNotifyPrefs as any).mockRejectedValue(new Error("boom"));
    renderModal();
    expect(await screen.findByText("设置加载失败，请关闭后重试")).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "点赞通知" })).not.toBeInTheDocument();
    // 关键：不能把"未知"当成"全开"写回去
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    expect(apiModule.api.updateNotifyPrefs).not.toHaveBeenCalled();
  });
});
