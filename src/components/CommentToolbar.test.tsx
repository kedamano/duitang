import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import { CommentToolbar } from "./CommentToolbar";

vi.mock("../api", () => ({
  AUTH_EXPIRED_EVENT: "duitang:auth-expired",
  AuthExpiredError: class extends Error {},
  api: { upload: vi.fn() },
}));

function setup(canUpload = false) {
  const ref = createRef<HTMLInputElement>();
  const onChange = vi.fn();
  render(
    <>
      <input ref={ref} />
      <CommentToolbar inputRef={ref} value="" onChange={onChange} canUpload={canUpload} />
    </>
  );
  return { ref, onChange };
}

beforeEach(() => { vi.clearAllMocks(); });

describe("CommentToolbar", () => {
  it("点击表情按钮打开面板", () => {
    setup();
    fireEvent.click(screen.getByLabelText("插入表情"));
    expect(screen.getByTestId("emoji-panel")).toBeInTheDocument();
  });

  it("点击面板外部关闭（⑧）", () => {
    setup();
    fireEvent.click(screen.getByLabelText("插入表情"));
    expect(screen.getByTestId("emoji-panel")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId("emoji-panel")).not.toBeInTheDocument();
  });

  it("按 Escape 关闭面板（⑧）", () => {
    setup();
    fireEvent.click(screen.getByLabelText("插入表情"));
    expect(screen.getByTestId("emoji-panel")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("emoji-panel")).not.toBeInTheDocument();
  });

  it("再次点击表情按钮切换面板（⑧）", () => {
    setup();
    const btn = screen.getByLabelText("插入表情");
    fireEvent.click(btn);
    expect(screen.getByTestId("emoji-panel")).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByTestId("emoji-panel")).not.toBeInTheDocument();
  });

  it("选 emoji 插入到输入框", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByLabelText("插入表情"));
    const emojiBtns = screen.getAllByRole("button").filter(b => (b.getAttribute("aria-label") || "").startsWith("插入表情 "));
    expect(emojiBtns.length).toBeGreaterThan(0);
    fireEvent.click(emojiBtns[0]);
    expect(onChange).toHaveBeenCalledWith("😀");
  });

  it("canUpload=true 时显示贴图按钮", () => {
    setup(true);
    expect(screen.getByLabelText("添加图片")).toBeInTheDocument();
  });

  it("canUpload=false 时不显示贴图按钮", () => {
    setup(false);
    expect(screen.queryByLabelText("添加图片")).not.toBeInTheDocument();
  });
});
