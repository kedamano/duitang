import DOMPurify from "dompurify";

/** 与后端 cleanRichText 保持一致的白名单 */
const ALLOWED_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "a", "blockquote", "code", "pre", "h3", "h4"];
const ALLOWED_ATTR = ["href", "title", "target", "rel"];

/** 是否像 HTML（含标签）；历史纯文本描述不加处理 */
export function looksLikeHtml(value: string): boolean {
  return /<[a-z][^>]*>/i.test(value || "");
}

/**
 * 前端二次消毒：即使后端已清洗，渲染前仍按白名单过滤一遍。
 * 没有 DOMPurify 可用时（如部分测试环境）退回转义纯文本，绝不直接输出原始串。
 */
export function sanitizeRichText(value: string): string {
  const raw = value || "";
  if (!raw.trim()) return "";
  if (!looksLikeHtml(raw)) return raw;

  try {
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "style"],
    });
  } catch {
    // 消毒失败时退化为纯文本，避免 XSS
    return raw.replace(/<[^>]*>/g, "");
  }
}

/** 富文本是否为空（TipTap 空文档是 `<p></p>`） */
export function isRichTextEmpty(value: string): boolean {
  const raw = (value || "").trim();
  if (!raw) return true;
  const text = raw.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  return text.length === 0;
}

/** 取纯文本摘要（列表卡片等场景） */
export function richTextExcerpt(value: string, max = 60): string {
  const text = (value || "")
    // 块级标签收尾补空格，避免两段文字粘连；行内标签直接去掉，避免中文被空格隔开
    .replace(/<\/(p|li|h3|h4|blockquote|div)>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? text.slice(0, max) + "…" : text;
}
