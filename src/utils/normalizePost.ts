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

/** 头像缺失时的兜底：与后端注册时同源的 dicebear 生成式头像（按昵称取种子） */
function fallbackAvatar(nickname: string): string {
  return `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(nickname)}&backgroundColor=ffdfbf,ffd5dc,d1d4f9,c0aede,b6e3f4`;
}

/** 由变体数组拼出 srcset：每项 `url widthw`，宽度为 0 时忽略 */
function buildSrcset(variants: { url: string; width: number; sign?: string | null }[]): string {
  return variants
    .filter(v => typeof v.url === "string" && v.url && v.width > 0)
    .sort((a, b) => a.width - b.width)
    .map(v => `${withSign(v.url, v.sign)} ${v.width}w`)
    .join(", ");
}

/** 拼防盗链签名：/uploads/x.jpg + sign → /uploads/x.jpg?sign=xxx */
export function withSign(url: string, sign?: string | null): string {
  if (!url || !sign) return url;
  if (!url.startsWith("/uploads/")) return url;
  return `${url}?sign=${encodeURIComponent(sign)}`;
}

/**
 * 后端 post → 前端 ImageCard 的唯一转换入口。
 * 兼容 images/tags/sizes 为字符串或数组，board 为英文 key 或历史中文标签。
 */
export function normalizePost(p: any): ImageCard {
  const images = parseJsonArray<string>(p.images);
  const thumbs = parseJsonArray<string>(p.thumbs);
  const tags = parseJsonArray<string>(p.tags);
  const sizes = parseJsonArray<PostSize>(p.sizes);
  const variants = parseJsonArray<{ url: string; width: number }[]>(p.images_variants);
  const imageSigns = parseJsonArray<string | null>(p.image_signs);
  const variantSigns = parseJsonArray<{ url: string; width: number; sign?: string | null }[]>(p.variant_signs);
  const { w: width, h: height } = readSize(sizes[0]);
  const author = p.author_nickname || "匿名";

  // 变体缺失时，用"原图 + 缩略图"兜底，保证 srcset 仍有意义
  const rawFinal = variants.length === images.length
    ? variants
    : images.map((img, i) => [{ url: thumbs[i] || img, width: thumbs[i] && thumbs[i] !== img ? 400 : 0 }, { url: img, width }]);

  // 附加服务端下发的防盗链签名
  const finalVariants = rawFinal.map((list, i) => {
    const signs = variantSigns[i] || [];
    return list.map((v, j) => ({ ...v, sign: signs[j]?.sign ?? null }));
  });

  const firstVariants = finalVariants[0] || [];
  const srcset = buildSrcset(firstVariants);
  const signedImages = images.map((img, i) => withSign(img, imageSigns[i] ?? null));
  const signedThumbs = thumbs.map((t, i) => withSign(t, imageSigns[i] ?? null));

  return {
    id: p.id,
    src: signedImages[0] || "",
    images: signedImages,
    thumbs: signedThumbs,
    thumb: signedThumbs[0] || signedImages[0] || "",
    variants: finalVariants,
    srcset: srcset || undefined,
    title: p.title ?? "",
    description: p.description || "",
    author,
    authorId: p.author_id,
    avatar: p.author_avatar || fallbackAvatar(author),
    tags,
    category: toBoardKey(p.board) || "all",
    likes: p.likes_count || 0,
    collects: p.collects_count || 0,
    comments: p.comments_count || 0,
    shares: p.shares_count || 0,
    date: p.created_at || "",
    width,
    height,
    is_liked: p.is_liked || false,
    is_collected: p.is_collected || false,
  };
}
