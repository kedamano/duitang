import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import RichTextContent from "./RichTextContent";

describe("RichTextContent", () => {
  it("空内容不渲染", () => {
    const { container } = render(<RichTextContent content="   " />);
    expect(container.innerHTML).toBe("");
  });

  it("历史纯文本按原样渲染并保留换行", () => {
    render(<RichTextContent content={"第一行\n第二行 <非标签>"} />);
    const p = screen.getByText(/第一行/);
    expect(p.tagName).toBe("P");
    expect(p.className).toContain("whitespace-pre-wrap");
    // 纯文本里的 < 不会被当 HTML 解析
    expect(p.textContent).toContain("<非标签>");
  });

  it("HTML 内容消毒后按结构渲染", () => {
    const { container } = render(
      <RichTextContent content="<p>加粗<strong>重点</strong></p><script>window.x=1</script>" />,
    );
    const div = container.querySelector(".rich-content");
    expect(div).toBeTruthy();
    expect(div!.querySelector("strong")?.textContent).toBe("重点");
    // script 必须被剥掉
    expect(div!.innerHTML).not.toContain("script");
    expect((window as unknown as { x?: number }).x).toBeUndefined();
  });

  it("危险属性被过滤（onerror / javascript:）", () => {
    const { container } = render(
      <RichTextContent content={'<p onclick="evil()">点我</p><a href="javascript:evil()">链接</a>'} />,
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/onclick/i);
    expect(html).not.toMatch(/javascript:/i);
  });

  it("外部 className 生效", () => {
    const { container } = render(<RichTextContent content="hi" className="custom-x" />);
    expect(container.querySelector(".custom-x")).toBeTruthy();
  });
});
