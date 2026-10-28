import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { compressImage, formatBytes, MAX_EDGE } from "./compressImage";

function jpegFile(name = "a.jpg", kb = 500): File {
  return new File([new Uint8Array(kb * 1024)], name, { type: "image/jpeg" });
}

/** stub canvas 管线：bitmap 尺寸 + toBlob 输出大小/类型 */
function stubCanvas(opts: {
  width?: number;
  height?: number;
  blobSize?: number;
  blobType?: string;
  decodeFails?: boolean;
  toBlobNull?: boolean;
}) {
  const bitmap = {
    width: opts.width ?? 4000,
    height: opts.height ?? 3000,
    close: vi.fn(),
  };
  if (opts.decodeFails) {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("decode")));
  } else {
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
  }
  const blob = new Blob(["x"], { type: opts.blobType || "image/jpeg" });
  if (opts.blobSize != null) {
    Object.defineProperty(blob, "size", { value: opts.blobSize });
  }
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  if (opts.toBlobNull) {
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(cb => cb(null));
  } else {
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(cb => cb(blob));
  }
  return bitmap;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("compressImage", () => {
  it("GIF 直接跳过（保护动画）", async () => {
    const f = new File([new Uint8Array(600 * 1024)], "a.gif", { type: "image/gif" });
    const r = await compressImage(f);
    expect(r.file).toBe(f);
    expect(r.skipped).toBe("gif");
  });

  it("小于 100KB 跳过", async () => {
    const f = jpegFile("small.jpg", 50);
    const r = await compressImage(f);
    expect(r.file).toBe(f);
    expect(r.skipped).toBe("small");
  });

  it("大图成功压缩：输出新 File 且标记 compressed", async () => {
    const f = jpegFile("big.jpg", 500);
    const bitmap = stubCanvas({ width: 4000, height: 3000, blobSize: 120 * 1024 });
    const r = await compressImage(f);
    expect(r.compressed).toBe(true);
    expect(r.file).not.toBe(f);
    expect(r.file.type).toBe("image/jpeg");
    expect(r.file.name.endsWith(".jpg")).toBe(true);
    expect(r.bytes).toBe(120 * 1024);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it("压缩后反而更大时保留原图", async () => {
    const f = jpegFile("opt.jpg", 200);
    stubCanvas({ blobSize: 300 * 1024 });
    const r = await compressImage(f);
    expect(r.file).toBe(f);
    expect(r.skipped).toBe("bigger");
    expect(r.compressed).toBe(false);
  });

  it("解码失败时回落原图，不抛异常", async () => {
    const f = jpegFile();
    stubCanvas({ decodeFails: true });
    const r = await compressImage(f);
    expect(r.file).toBe(f);
    expect(r.skipped).toBe("failed");
  });

  it("toBlob 返回 null 时回落原图", async () => {
    const f = jpegFile();
    stubCanvas({ toBlobNull: true });
    const r = await compressImage(f);
    expect(r.file).toBe(f);
    expect(r.skipped).toBe("failed");
  });

  it("透明 PNG 保持 PNG 输出", async () => {
    const f = new File([new Uint8Array(500 * 1024)], "a.png", { type: "image/png" });
    stubCanvas({ blobSize: 100 * 1024, blobType: "image/png" });
    const r = await compressImage(f);
    expect(r.compressed).toBe(true);
    expect(r.file.type).toBe("image/png");
    expect(r.file.name.endsWith(".png")).toBe(true);
  });

  it("JPEG 的 PNG 会被转成 JPEG（无透明假设）", async () => {
    const f = jpegFile("photo.png", 500); // type=jpeg 但名字是 png，按 type 走
    stubCanvas({ blobSize: 100 * 1024, blobType: "image/jpeg" });
    const r = await compressImage(f);
    expect(r.file.type).toBe("image/jpeg");
  });

  it("MAX_EDGE 常量导出可用", () => {
    expect(MAX_EDGE).toBe(2560);
  });
});

describe("formatBytes", () => {
  it("MB 与 KB 两种量级", () => {
    expect(formatBytes(3.5 * 1024 * 1024)).toBe("3.5MB");
    expect(formatBytes(200 * 1024)).toBe("200KB");
    expect(formatBytes(500)).toBe("1KB");
  });
});
