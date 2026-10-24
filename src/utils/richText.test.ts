import { describe, it, expect } from "vitest";
import { looksLikeHtml, sanitizeRichText, isRichTextEmpty, richTextExcerpt } from "./richText";

describe("looksLikeHtml", () => {
  it("识别含标签的字符串", () => {
    expect(looksLikeHtml("<p>hi</p>")).toBe(true);
    expect(looksLikeHtml("<strong>x</strong>")).toBe(true);
  });

  it("纯文本不是 HTML", () => {
    expect(looksLikeHtml("普通文字")).toBe(false);
    expect(looksLikeHtml("a < b 且 c > d")).toBe(false);
    expect(looksLikeHtml("")).toBe(false);
  });
});

describe("sanitizeRichText", () => {
  it("保留白名单标签", () => {
    const out = sanitizeRichText("<p>你好 <strong>粗</strong> <em>斜</em></p><ul><li>一</li></ul>");
    expect(out).toContain("<strong>粗</strong>");
    expect(out).toContain("<em>斜</em>");
    expect(out).toContain("<li>一</li>");
  });

  it("剥离 script 与事件属性", () => {
    const out = sanitizeRichText('<p onclick="alert(1)">安全</p><script>alert(1)</script>');
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/onclick/i);
    expect(out).toContain("安全");
  });

  it("保留安全链接", () => {
    const out = sanitizeRichText('<p><a href="https://example.com">站点</a></p>');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain("站点");
  });

  it("纯文本原样返回", () => {
    expect(sanitizeRichText("就是文字")).toBe("就是文字");
  });

  it("空值返回空串", () => {
    expect(sanitizeRichText("")).toBe("");
  });
});

describe("isRichTextEmpty", () => {
  it("空字符串与空段落视为空", () => {
    expect(isRichTextEmpty("")).toBe(true);
    expect(isRichTextEmpty("<p></p>")).toBe(true);
    expect(isRichTextEmpty("<p>&nbsp;</p>")).toBe(true);
  });

  it("有文字则不为空", () => {
    expect(isRichTextEmpty("<p>hi</p>")).toBe(false);
    expect(isRichTextEmpty("普通文字")).toBe(false);
  });
});

describe("richTextExcerpt", () => {
  it("去掉标签并截断", () => {
    expect(richTextExcerpt("<p>你好<strong>世界</strong></p>")).toBe("你好世界");
    const long = richTextExcerpt("<p>" + "字".repeat(100) + "</p>", 10);
    expect(long.endsWith("…")).toBe(true);
    expect(long.length).toBeLessThan(15);
  });
});
