import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AiImageGenModal from "./AiImageGenModal";

describe("AiImageGenModal", () => {
  const onConfirm = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderOpen() {
    return render(<AiImageGenModal open onClose={onClose} onConfirm={onConfirm} />);
  }

  it("open=false 时不渲染", () => {
    render(<AiImageGenModal open={false} onClose={onClose} onConfirm={onConfirm} />);
    expect(screen.queryByText("AI 生成图片")).not.toBeInTheDocument();
  });

  it("空提示词时生成按钮禁用", () => {
    renderOpen();
    expect(screen.getByRole("button", { name: /开始生成/ })).toBeDisabled();
  });

  it("输入提示词后按钮可用，点击开始生成并展示预览区", () => {
    renderOpen();
    const textarea = screen.getByPlaceholderText(/橘猫/);
    fireEvent.change(textarea, { target: { value: "一只猫" } });
    const genBtn = screen.getByRole("button", { name: /开始生成/ });
    expect(genBtn).not.toBeDisabled();
    fireEvent.click(genBtn);
    expect(screen.getByText("生成结果")).toBeInTheDocument();
    const img = screen.getByAltText("AI generated") as HTMLImageElement;
    expect(img.src).toContain("pollinations");
    expect(img.src).toContain(encodeURIComponent("一只猫"));
  });

  it("风格与尺寸可切换，生成 URL 带上所选尺寸", () => {
    renderOpen();
    fireEvent.click(screen.getByText("赛博朋克"));
    fireEvent.click(screen.getByText(/横版 3:2/));
    fireEvent.change(screen.getByPlaceholderText(/橘猫/), { target: { value: "城市" } });
    fireEvent.click(screen.getByRole("button", { name: /开始生成/ }));
    const img = screen.getByAltText("AI generated") as HTMLImageElement;
    expect(img.src).toContain("width=768");
    expect(img.src).toContain("height=512");
    expect(img.src).toContain(encodeURIComponent("cyberpunk"));
  });

  it("首次加载失败自动换种子重试一次，第二次才报错", () => {
    renderOpen();
    fireEvent.change(screen.getByPlaceholderText(/橘猫/), { target: { value: "猫" } });
    fireEvent.click(screen.getByRole("button", { name: /开始生成/ }));
    const img = screen.getByAltText("AI generated") as HTMLImageElement;
    const firstSrc = img.src;

    // 第一次 error：应自动重试（src 变化、无错误文案）
    fireEvent.error(img);
    expect(screen.queryByText(/生成失败/)).not.toBeInTheDocument();
    const secondSrc = (screen.getByAltText("AI generated") as HTMLImageElement).src;
    expect(secondSrc).not.toBe(firstSrc);

    // 第二次 error：报错并给出手动重试入口
    fireEvent.error(screen.getByAltText("AI generated"));
    expect(screen.getByText(/生成失败/)).toBeInTheDocument();
    expect(screen.getByText("点击重试")).toBeInTheDocument();
  });

  it("加载成功显示「使用此图片」，点击回传 dataUrl 并关闭", async () => {
    // stub fetch + FileReader 让 urlToDataUrl 在 jsdom 里走通
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      blob: async () => new Blob(["img"], { type: "image/jpeg" }),
    }));
    renderOpen();
    fireEvent.change(screen.getByPlaceholderText(/橘猫/), { target: { value: "猫" } });
    fireEvent.click(screen.getByRole("button", { name: /开始生成/ }));
    fireEvent.load(screen.getByAltText("AI generated"));

    const useBtn = await screen.findByText("使用此图片");
    fireEvent.click(useBtn);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0][0]).toMatch(/^data:/);
    expect(onClose).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("点遮罩关闭", () => {
    renderOpen();
    const overlay = screen.getByText("AI 生成图片").closest(".fixed")!;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });
});
