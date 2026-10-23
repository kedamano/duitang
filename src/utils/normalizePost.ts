import type { ImageCard } from "../data/images";
import { toBoardKey } from "../data/images";

/** 安全解析后端 JSON 字段：可能已是数组，或是字符串，或是空 */
export function parseJsonArray<T = any>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** 后端返回的图片尺寸项：兼容 {w,h} 对象与 [w,h] 元组两种写法，缺失时回落默认比例 */
type PostSize = { w?: number; h?: number } | [number, number];

function readSize(size: PostSize | undefined): { w: number; h: number } {
  if (Array.isArray(size)) {
    const [w, h] = size;
    return { w: Number(w) > 0 ? Number(w) : 400, h: Number(h) > 0 ? Number(h) : 300 };
  }
  return {
    w: Number(size?.w) > 0 ? Number(size!.w) : 400,
    h: Number(size?.h) > 0 ? Number(size!.h) : 300,
  };
}

/**
 * 后端 post → 前端 ImageCard 的唯一转换入口。
 * 兼容 images/tags/sizes 为字符串或数组，board 为英文 key 或历史中文标签。
 */
export function normalizePost(p: any): ImageCard {
  const images = parseJsonArray<string>(p.images);
  const tags = parseJsonArray<string>(p.tags);
  const sizes = parseJsonArray<PostSize>(p.sizes);
  const { w: width, h: height } = readSize(sizes[0]);

  return {
    id: p.id,
    src: images[0] || "",
    images,
    title: p.title ?? "",
    description: p.description || "",
    author: p.author_nickname || "匿名",
    authorId: p.author_id,
    avatar: p.author_avatar || "",
    tags,
    category: toBoardKey(p.board) || "all",
    likes: p.likes_count || 0,
    collects: p.collects_count || 0,
    comments: p.comments_count || 0,
    shares: p.shares_count || 0,
    width,
    height,
    is_liked: p.is_liked || false,
    is_collected: p.is_collected || false,
  };
}
