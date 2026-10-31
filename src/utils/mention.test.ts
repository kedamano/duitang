import { describe, it, expect } from "vitest";
import { tokenizeComment } from "./mention";

describe("tokenizeComment", () => {
  it("纯文本切成一个片段", () => {
    const t = tokenizeComment("今天天气不错");
    expect(t).toEqual([{ type: "text", content: "今天天气不错" }]);
  });

  it("识别 @提及", () => {
    const t = tokenizeComment("你好 @糖小颜 在吗");
    expect(t[0]).toEqual({ type: "text", content: "你好 " });
    expect(t[1]).toEqual({ type: "mention", content: "@糖小颜", nickname: "糖小颜" });
    expect(t[2]).toEqual({ type: "text", content: " 在吗" });
  });

  it("识别加粗", () => {
    const t = tokenizeComment("这是 **重点** 内容");
    expect(t.find(x => x.type === "bold")).toEqual({ type: "bold", content: "重点" });
  });

  it("识别斜体", () => {
    const t = tokenizeComment("这是 *强调* 内容");
    expect(t.find(x => x.type === "italic")).toEqual({ type: "italic", content: "强调" });
  });

  it("识别行内代码", () => {
    const t = tokenizeComment("执行 `npm test` 即可");
    expect(t.find(x => x.type === "code")).toEqual({ type: "code", content: "npm test" });
  });

  it("加粗优先于斜体（** 不被当成两个 *）", () => {
    const t = tokenizeComment("**粗体**");
    expect(t).toEqual([{ type: "bold", content: "粗体" }]);
    expect(t.some(x => x.type === "italic")).toBe(false);
  });

  // 回归：斜体越界匹配被跳过后，不能吞掉后面真正的斜体起点
  it("加粗后面跟着斜体时两者都能识别", () => {
    const t = tokenizeComment("带 **重点** 与 *强调* 的评论");
    expect(t.find(x => x.type === "bold")).toEqual({ type: "bold", content: "重点" });
    expect(t.find(x => x.type === "italic")).toEqual({ type: "italic", content: "强调" });
  });

  it("多个加粗与斜体混排都正确", () => {
    const t = tokenizeComment("a **b** c *d* e");
    expect(t.filter(x => x.type === "bold")).toEqual([{ type: "bold", content: "b" }]);
    expect(t.filter(x => x.type === "italic")).toEqual([{ type: "italic", content: "d" }]);
  });

  it("代码优先于加粗与提及", () => {
    const t = tokenizeComment("`@someone **x**`");
    expect(t).toEqual([{ type: "code", content: "@someone **x**" }]);
  });

  it("支持多种标记混排", () => {
    const t = tokenizeComment("**重点** @某人 看 `code`");
    const types = t.map(x => x.type);
    expect(types).toContain("bold");
    expect(types).toContain("mention");
    expect(types).toContain("code");
  });

  it("未闭合的标记当普通文本", () => {
    const t = tokenizeComment("没有闭合的 **粗体");
    expect(t.every(x => x.type === "text")).toBe(true);
  });

  it("空内容返回空数组", () => {
    expect(tokenizeComment("")).toEqual([]);
  });

  it("贴图 markdown 解析为图片 token（alt + url）", () => {
    const t = tokenizeComment("看这个 ![](/uploads/a.jpg) 好看");
    expect(t[0]).toEqual({ type: "text", content: "看这个 " });
    expect(t[1]).toEqual({ type: "image", url: "/uploads/a.jpg", alt: "" });
    expect(t[2]).toEqual({ type: "text", content: " 好看" });
  });

  it("带 alt 的图片 token", () => {
    const t = tokenizeComment("![描述](https://example.com/x.png)");
    expect(t).toEqual([{ type: "image", url: "https://example.com/x.png", alt: "描述" }]);
  });

  it("站内相对路径图片也被识别", () => {
    const t = tokenizeComment("![x](/uploads/pic_1_thumb.jpg)");
    expect(t).toEqual([{ type: "image", url: "/uploads/pic_1_thumb.jpg", alt: "x" }]);
  });

  it("普通 markdown 链接不是图片", () => {
    const t = tokenizeComment("[链接](https://x.com)");
    expect(t.every(x => x.type === "text" || x.type === "bold" || x.type === "italic" || x.type === "code" || x.type === "mention")).toBe(true);
  });

  it("HTML 标签不会被当成标记（按文本保留，渲染时由 React 转义）", () => {
    const t = tokenizeComment("<script>alert(1)</script>");
    expect(t.every(x => x.type === "text")).toBe(true);
    expect((t as { content: string }[]).map(x => x.content).join("")).toBe("<script>alert(1)</script>");
  });
});
