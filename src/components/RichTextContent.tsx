import { looksLikeHtml, sanitizeRichText } from "../utils/richText";
import { cn } from "../utils/cn";

/**
 * 富文本内容渲染。
 * HTML 走白名单消毒后注入；历史纯文本保持原有换行与转义，避免把老数据当 HTML 解析。
 */
export default function RichTextContent({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const raw = content || "";
  if (!raw.trim()) return null;

  if (!looksLikeHtml(raw)) {
    return (
      <p className={cn("text-sm text-body leading-relaxed break-words whitespace-pre-wrap", className)}>
        {raw}
      </p>
    );
  }

  return (
    <div
      className={cn("rich-content text-sm text-body", className)}
      // 内容已在后端 sanitize-html + 前端 DOMPurify 双重白名单过滤
      dangerouslySetInnerHTML={{ __html: sanitizeRichText(raw) }}
    />
  );
}
