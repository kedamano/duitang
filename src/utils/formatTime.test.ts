import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "./formatTime";

// 固定"现在"，避免测试依赖当前时间
const now = new Date("2026-10-24T12:00:00Z");

describe("formatRelativeTime", () => {
  it("空值返回空串", () => {
    expect(formatRelativeTime("")).toBe("");
  });

  it("一分钟内显示刚刚", () => {
    expect(formatRelativeTime("2026-10-24 11:59:30", now)).toBe("刚刚");
  });

  it("按 SQLite 的 UTC 无时区格式解析", () => {
    // 若被当成本地时间解析，结果会差 8 小时
    expect(formatRelativeTime("2026-10-24 11:30:00", now)).toBe("30 分钟前");
  });

  it("小时与天", () => {
    expect(formatRelativeTime("2026-10-24 09:00:00", now)).toBe("3 小时前");
    expect(formatRelativeTime("2026-10-22 12:00:00", now)).toBe("2 天前");
  });

  it("超过一周显示日期", () => {
    expect(formatRelativeTime("2026-09-01 08:00:00", now)).toBe("2026-09-01");
  });

  it("带时区标记的 ISO 字符串也能解析", () => {
    expect(formatRelativeTime("2026-10-24T11:30:00Z", now)).toBe("30 分钟前");
  });

  it("非法输入返回空串而不是 Invalid Date", () => {
    expect(formatRelativeTime("not-a-date", now)).toBe("");
  });
});
