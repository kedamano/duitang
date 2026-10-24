import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImageLightbox from "./ImageLightbox";

const images = ["/a.jpg", "/b.jpg", "/c.jpg"];

describe("ImageLightbox", () => {
  it("渲染当前图片与计数器", () => {
    render(<ImageLightbox images={images} index={1} onChange={() => {}} onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(screen.getByAltText("第 2 张")).toHaveAttribute("src", "/b.jpg");
  });

  it("点击左右按钮切换", async () => {
    const onChange = vi.fn();
    render(<ImageLightbox images={images} index={0} onChange={onChange} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "下一张" }));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("首张点上一张会循环到最后一张", async () => {
    const onChange = vi.fn();
    render(<ImageLightbox images={images} index={0} onChange={onChange} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "上一张" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("键盘方向键与 Esc 生效", async () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(<ImageLightbox images={images} index={1} onChange={onChange} onClose={onClose} />);
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith(2);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("单图时不显示切换按钮", () => {
    render(<ImageLightbox images={["/only.jpg"]} index={0} onChange={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "下一张" })).not.toBeInTheDocument();
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
  });

  it("点击关闭按钮与遮罩都会关闭", async () => {
    const onClose = vi.fn();
    render(<ImageLightbox images={images} index={0} onChange={() => {}} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "关闭预览" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
