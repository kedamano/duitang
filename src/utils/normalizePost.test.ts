import { describe, it, expect } from "vitest";
import { normalizePost, parseJsonArray } from "./normalizePost";
import { labelToBoard, boardToLabel, toBoardKey } from "../data/images";

describe("parseJsonArray", () => {
  it("handles arrays, JSON strings, empty and malformed input", () => {
    expect(parseJsonArray([1, 2])).toEqual([1, 2]);
    expect(parseJsonArray('["a","b"]')).toEqual(["a", "b"]);
    expect(parseJsonArray(null)).toEqual([]);
    expect(parseJsonArray("")).toEqual([]);
    expect(parseJsonArray("not json")).toEqual([]);
    expect(parseJsonArray('{"a":1}')).toEqual([]); // 非数组 JSON 也安全降级
  });
});

describe("normalizePost", () => {
  it("maps backend fields to ImageCard", () => {
    const card = normalizePost({
      id: 7, title: "测试", description: "描述", board: "wallpaper",
      images: '["/uploads/a.jpg","/uploads/b.jpg"]', tags: '["壁纸"]',
      sizes: '[{"w":512,"h":768}]',
      author_id: 3, author_nickname: "糖小兔", author_avatar: "a.svg",
      likes_count: 10, collects_count: 2, comments_count: 1, shares_count: 4,
    });
    expect(card).toMatchObject({
      id: 7, src: "/uploads/a.jpg", title: "测试", category: "wallpaper",
      author: "糖小兔", authorId: 3, likes: 10, collects: 2, comments: 1, shares: 4,
      width: 512, height: 768,
    });
    expect(card.tags).toEqual(["壁纸"]);
    expect(card.images).toEqual(["/uploads/a.jpg", "/uploads/b.jpg"]);
  });

  it("falls back to default 400x300 when sizes missing", () => {
    const card = normalizePost({ id: 1, title: "x", images: [], tags: [] });
    expect(card.width).toBe(400);
    expect(card.height).toBe(300);
  });

  it("accepts legacy [w,h] tuple sizes", () => {
    const card = normalizePost({ id: 1, title: "x", images: [], tags: [], sizes: "[[640,480]]" });
    expect(card.width).toBe(640);
    expect(card.height).toBe(480);
  });

  // 回归：历史数据把中文标签存进了 board，必须归一化成英文 key，否则分类筛选永远为空
  it("normalizes legacy Chinese board to key", () => {
    const card = normalizePost({ id: 1, title: "x", board: "动漫插画", images: [], tags: [] });
    expect(card.category).toBe("anime");
  });
});

describe("board label/key maps", () => {
  it("every nav label maps to a board key and back", () => {
    for (const [label, key] of Object.entries(labelToBoard)) {
      expect(boardToLabel[key]).toBe(label);
    }
  });

  it("推荐 maps to all and is excluded from publishable boards", () => {
    expect(labelToBoard["推荐"]).toBe("all");
    expect(Object.values(labelToBoard).filter(v => v !== "all")).toHaveLength(12);
  });

  it("toBoardKey accepts both Chinese label and English key", () => {
    expect(toBoardKey("旅行摄影")).toBe("travel");
    expect(toBoardKey("travel")).toBe("travel");
    expect(toBoardKey("")).toBe("");
    expect(toBoardKey(undefined)).toBe("");
  });
});
