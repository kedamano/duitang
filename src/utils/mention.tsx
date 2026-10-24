import { requestSearch } from "./searchEvent";

/**
 * 评论正文的轻量富文本 + @提及渲染。
 *
 * 为什么评论不用 HTML 编辑器：
 * 1) 评论以「快」为核心，弹一个富文本工具栏反而拖慢输入；
 * 2) @提及 高亮依赖纯文本扫描，混入 HTML 后解析复杂度陡增；
 * 3) 不存 HTML 就不存在 XSS 面——所有内容都经 React 文本节点转义。
 *
 * 支持的标记：**加粗**、*斜体*、`行内代码`、@昵称
 */

export type CommentToken =
  | { type: "text"; content: string }
  | { type: "mention"; content: string; nickname: string }
  | { type: "bold"; content: string }
  | { type: "italic"; content: string }
  | { type: "code"; content: string };

/** 匹配优先级：代码 → 加粗 → 斜体 → @提及 */
const PATTERNS: { type: CommentToken["type"]; re: RegExp }[] = [
  { type: "code", re: /`([^`\n]{1,200})`/g },
  { type: "bold", re: /\*\*([^*\n]{1,200})\*\*/g },
  { type: "italic", re: /\*([^*\n]{1,100})\*/g },
  { type: "mention", re: /@([^\s@]{1,20})/g },
];

/** 把正文切成有序的 token（同层不嵌套，足够覆盖评论场景） */
export function tokenizeComment(content: string): CommentToken[] {
  const text = content || "";
  if (!text) return [];

  // 收集所有匹配及其区间
  const hits: { start: number; end: number; type: CommentToken["type"]; raw: string; inner: string }[] = [];
  for (const { type, re } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      // 与更高优先级规则已占用的区间重叠：跳过，并把扫描位置回退到本匹配起点之后，
      // 否则会把后面真正该匹配的内容一起吃掉（例如 `**粗** 与 *斜*` 里的斜体）。
      if (hits.some(h => start < h.end && end > h.start)) {
        re.lastIndex = start + 1;
        continue;
      }
      hits.push({ start, end, type, raw: m[0], inner: m[1] });
    }
  }
  hits.sort((a, b) => a.start - b.start);

  const tokens: CommentToken[] = [];
  let cursor = 0;
  for (const h of hits) {
    if (h.start > cursor) tokens.push({ type: "text", content: text.slice(cursor, h.start) });
    if (h.type === "mention") {
      tokens.push({ type: "mention", content: h.raw, nickname: h.inner });
    } else {
      tokens.push({ type: h.type, content: h.inner } as CommentToken);
    }
    cursor = h.end;
  }
  if (cursor < text.length) tokens.push({ type: "text", content: text.slice(cursor) });
  return tokens;
}

/** 渲染评论正文：富文本片段 + @提及可点击 */
export function renderCommentContent(content: string): React.ReactNode {
  return tokenizeComment(content).map((token, i) => {
    switch (token.type) {
      case "mention":
        return (
          <button
            key={i}
            type="button"
            data-testid="mention"
            onClick={() => requestSearch(token.nickname)}
            className="text-[#e05d6f] font-medium hover:underline align-baseline"
          >
            {token.content}
          </button>
        );
      case "bold":
        return (
          <strong key={i} data-testid="comment-bold" className="font-bold text-gray-800">
            {token.content}
          </strong>
        );
      case "italic":
        return (
          <em key={i} data-testid="comment-italic">
            {token.content}
          </em>
        );
      case "code":
        return (
          <code key={i} data-testid="comment-code" className="bg-gray-100 px-1 py-0.5 rounded text-[0.9em] font-mono">
            {token.content}
          </code>
        );
      default:
        return <span key={i}>{token.content}</span>;
    }
  });
}

/** 兼容旧调用点：仅做 @提及 渲染 */
export function renderContentWithMentions(content: string): React.ReactNode {
  return renderCommentContent(content);
}

/** 匹配 @昵称（保留导出，供测试与提示用） */
export const MENTION_REGEX = /@([^\s@]{1,20})/g;
