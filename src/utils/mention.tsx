import { requestSearch } from "./searchEvent";

/** 匹配 @昵称（1-20 字，不含空白） */
const MENTION_RE = /@([^\s@]{1,20})/g;

export interface MentionToken {
  type: "text" | "mention";
  content: string;
  nickname?: string;
}

/** 把评论正文切成 文本 / @提及 片段，便于高亮渲染 */
export function splitMentions(content: string): MentionToken[] {
  const tokens: MentionToken[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;

  while ((match = MENTION_RE.exec(content)) !== null) {
    if (match.index > last) {
      tokens.push({ type: "text", content: content.slice(last, match.index) });
    }
    tokens.push({ type: "mention", content: match[0], nickname: match[1] });
    last = match.index + match[0].length;
  }
  if (last < content.length) {
    tokens.push({ type: "text", content: content.slice(last) });
  }
  return tokens;
}

/**
 * 渲染正文：@昵称 高亮并可点击跳转搜索。
 * 仅做本地高亮，无需后端查询昵称是否存在。
 */
export function renderContentWithMentions(content: string): React.ReactNode {
  return splitMentions(content).map((token, i) => {
    if (token.type === "mention") {
      return (
        <button
          key={i}
          type="button"
          data-testid="mention"
          onClick={() => requestSearch(token.nickname!)}
          className="text-[#e05d6f] font-medium hover:underline align-baseline"
        >
          {token.content}
        </button>
      );
    }
    return <span key={i}>{token.content}</span>;
  });
}
