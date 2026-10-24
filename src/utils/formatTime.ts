/** 把后端的时间字符串（SQLite `YYYY-MM-DD HH:MM:SS`，UTC）格式化为相对时间 */
export function formatRelativeTime(input: string | number | Date, now: Date = new Date()): string {
  if (!input) return "";
  // SQLite CURRENT_TIMESTAMP 是 UTC 且不带时区标记，需显式按 UTC 解析
  let date: Date;
  if (input instanceof Date) date = input;
  else if (typeof input === "number") date = new Date(input);
  else {
    const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(input) ? input : input.replace(" ", "T") + "Z";
    date = new Date(normalized);
  }
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 0) return "刚刚";
  if (diffSec < 60) return "刚刚";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)} 天前`;

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
