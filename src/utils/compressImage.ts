/**
 * 客户端图片压缩：上传前把超大图缩到合理尺寸。
 *
 * 目的：手机直出的照片常有 4000-8000px / 5-10MB，后端 jimp 纯 JS 解码很慢，
 * 磁盘和带宽也浪费。图片社区的展示上限远用不到原图分辨率，
 * 在浏览器里用 canvas 先缩到最长边 ≤2560px 再上传，体验与成本双赢。
 *
 * 规则：
 * - GIF 跳过（canvas 只取首帧，会毁掉动画）
 * - 带透明通道的 PNG 保持 PNG（转 JPEG 会变黑底）
 * - 其余统一重编码为 JPEG（quality 0.85）
 * - 压完反而变大或失败时保留原文件，绝不劣化
 */

/** 最长边像素上限（够 1600 档变体与高清屏展示用） */
export const MAX_EDGE = 2560;
/** JPEG 重编码质量 */
export const JPEG_QUALITY = 0.85;
/** 小于该体积没必要折腾（100KB） */
const SKIP_UNDER_BYTES = 100 * 1024;

export interface CompressResult {
  file: File;
  /** 压缩后的字节数（未压缩时等于原文件） */
  bytes: number;
  /** 是否真的变小了 */
  compressed: boolean;
  /** 跳过原因（GIF/太小/失败回落） */
  skipped?: "gif" | "small" | "bigger" | "failed";
}

/** 探测图片是否可能含透明通道（WebP/PNG） */
function mayHaveAlpha(type: string): boolean {
  return type === "image/png";
}

function pickOutputType(type: string): string {
  return mayHaveAlpha(type) ? "image/png" : "image/jpeg";
}

/** 解码 + 缩放 + 重编码；任何一步失败返回 null */
async function recompress(file: File): Promise<Blob | null> {
  try {
    let bitmap: ImageBitmap;
    if (typeof createImageBitmap === "function") {
      bitmap = await createImageBitmap(file);
    } else {
      // 老浏览器回落：用 <img> + objectURL 解码
      bitmap = await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(img as unknown as ImageBitmap);
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
        img.src = url;
      });
    }
    const w = (bitmap as ImageBitmap).width;
    const h = (bitmap as ImageBitmap).height;
    if (!w || !h) return null;

    const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, tw, th);
    if (typeof (bitmap as ImageBitmap).close === "function") (bitmap as ImageBitmap).close();

    const type = pickOutputType(file.type);
    return await new Promise<Blob | null>(resolve =>
      canvas.toBlob(b => resolve(b), type, JPEG_QUALITY),
    );
  } catch {
    return null;
  }
}

/**
 * 压缩单张图片。总是返回可上传的 File：
 * 成功且更小时返回新文件，否则原样返回。
 */
export async function compressImage(file: File): Promise<CompressResult> {
  if (file.type === "image/gif") {
    return { file, bytes: file.size, compressed: false, skipped: "gif" };
  }
  if (file.size < SKIP_UNDER_BYTES) {
    return { file, bytes: file.size, compressed: false, skipped: "small" };
  }

  const blob = await recompress(file);
  if (!blob) {
    return { file, bytes: file.size, compressed: false, skipped: "failed" };
  }
  // 压完更大（例如已高度优化的 JPEG / 透明 PNG 重编码）：保留原图
  if (blob.size >= file.size) {
    return { file, bytes: file.size, compressed: false, skipped: "bigger" };
  }

  const ext = blob.type === "image/png" ? "png" : "jpg";
  const base = file.name.replace(/\.[^.]+$/, "");
  const out = new File([blob], `${base}.${ext}`, { type: blob.type, lastModified: Date.now() });
  return { file: out, bytes: blob.size, compressed: true };
}

/** 人类可读的体积（MB / KB） */
export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + "MB";
  return Math.max(1, Math.round(n / 1024)) + "KB";
}
