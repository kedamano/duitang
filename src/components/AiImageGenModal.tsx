import { useState, useRef } from "react";
import { cn } from "../utils/cn";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (dataUrl: string) => void;
}

const styleOptions = [
  { label: "真实感", value: "photorealistic, 8k, detailed" },
  { label: "动漫插画", value: "anime style, illustration, vibrant colors" },
  { label: "水彩画", value: "watercolor painting, soft colors, artistic" },
  { label: "油画", value: "oil painting, rich textures, classic art style" },
  { label: "像素风", value: "pixel art, retro style, 16-bit" },
  { label: "赛博朋克", value: "cyberpunk, neon lights, futuristic cityscape" },
  { label: "中国风", value: "Chinese ink painting, traditional art, elegant" },
  { label: "极简", value: "minimalist, clean lines, simple composition" },
];

const sizeOptions = [
  { label: "方形 1:1", w: 512, h: 512 },
  { label: "竖版 2:3", w: 512, h: 768 },
  { label: "横版 3:2", w: 768, h: 512 },
];

/** Build proxied URL — Vite dev server proxies /api/pollinations → image.pollinations.ai */
function buildPollinationsUrl(prompt: string, w: number, h: number, seed: number): string {
  const encoded = encodeURIComponent(prompt);
  // Use Vite proxy in dev, direct URL as fallback
  const base = typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "/api/pollinations"
    : "https://image.pollinations.ai";
  return `${base}/prompt/${encoded}?width=${w}&height=${h}&seed=${seed}&nologo=true&enhance=true`;
}

/** Fetch image URL → convert to base64 data URL to persist cross-page */
async function urlToDataUrl(url: string): Promise<string> {
  const resp = await fetch(url);
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function AiImageGenModal({ open, onClose, onConfirm }: Props) {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState(styleOptions[0]);
  const [size, setSize] = useState(sizeOptions[0]);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  if (!open) return null;

  const fullPrompt = prompt.trim()
    ? `${prompt.trim()}, ${style.value}`
    : style.value;

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    const newSeed = Math.floor(Math.random() * 99999);
    setError(null);
    setLoading(true);
    const url = buildPollinationsUrl(fullPrompt, size.w, size.h, newSeed);
    setPreviewUrl(url);
  };

  const handleRegenerate = () => {
    if (!prompt.trim()) return;
    const newSeed = Math.floor(Math.random() * 99999);
    setError(null);
    setLoading(true);
    const url = buildPollinationsUrl(fullPrompt, size.w, size.h, newSeed);
    setPreviewUrl(url);
  };

  const handleUseImage = async () => {
    if (!previewUrl) return;
    setConverting(true);
    try {
      // If already a data URL (base64), use directly
      if (previewUrl.startsWith("data:")) {
        onConfirm(previewUrl);
        handleClose();
        return;
      }
      // Otherwise fetch and convert to data URL
      const dataUrl = await urlToDataUrl(previewUrl);
      onConfirm(dataUrl);
      handleClose();
    } catch {
      setError("图片保存失败，请重试");
    } finally {
      setConverting(false);
    }
  };

  const handleClose = () => {
    setPrompt("");
    setPreviewUrl(null);
    setError(null);
    setLoading(false);
    setConverting(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-800">AI 生成图片</h2>
            <span className="text-xs bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full font-medium">Beta</span>
          </div>
          <button onClick={handleClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Prompt input */}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">描述你想要的图片</label>
            <div className="relative">
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && prompt.trim()) { e.preventDefault(); handleGenerate(); } }}
                placeholder="例如：一只可爱的橘猫在樱花树下打盹，梦幻光影..."
                rows={3}
                maxLength={300}
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400 transition-all text-gray-700 placeholder-gray-400 resize-none"
              />
              <span className="absolute bottom-3 right-3 text-xs text-gray-300">{prompt.length}/300</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">支持中文描述，AI 会自动处理。按 Enter 快速生成。</p>
          </div>

          {/* Style selection */}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">图片风格</label>
            <div className="flex flex-wrap gap-2">
              {styleOptions.map(s => (
                <button
                  key={s.label}
                  onClick={() => setStyle(s)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                    style.label === s.label
                      ? "bg-gradient-to-r from-violet-500 to-pink-500 text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Size selection */}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">图片尺寸</label>
            <div className="flex gap-2">
              {sizeOptions.map(s => (
                <button
                  key={s.label}
                  onClick={() => setSize(s)}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-xs font-medium border transition-all",
                    size.label === s.label
                      ? "border-violet-400 bg-violet-50 text-violet-600"
                      : "border-gray-200 bg-white text-gray-500 hover:border-gray-300",
                  )}
                >
                  {s.label}
                  <span className="block text-[10px] text-gray-400 mt-0.5">{s.w}×{s.h}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || loading}
            className={cn(
              "w-full py-3 rounded-2xl font-bold text-sm transition-all",
              prompt.trim() && !loading
                ? "bg-gradient-to-r from-violet-500 to-pink-500 text-white shadow-md shadow-violet-200 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99]"
                : "bg-gray-100 text-gray-400 cursor-not-allowed",
            )}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" />
                </svg>
                AI 生成中...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                ✨ 开始生成
              </span>
            )}
          </button>

          {/* Preview area */}
          {previewUrl && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-gray-700">生成结果</label>
                {!loading && (
                  <button
                    onClick={handleRegenerate}
                    className="text-xs text-violet-500 hover:text-violet-700 font-medium flex items-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    重新生成
                  </button>
                )}
              </div>

              <div className={cn(
                "relative rounded-2xl overflow-hidden bg-gray-100 flex items-center justify-center",
                size.w > size.h ? "aspect-video" : size.w === size.h ? "aspect-square" : "aspect-[2/3]",
              )}>
                {loading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-50 z-10">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center animate-pulse">
                      <svg className="w-6 h-6 text-white animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" />
                      </svg>
                    </div>
                    <p className="text-sm text-gray-400">AI 正在创作中，请稍候...</p>
                    <p className="text-xs text-gray-300">通常需要 5-15 秒</p>
                  </div>
                )}
                <img
                  ref={imgRef}
                  src={previewUrl}
                  alt="AI generated"
                  className={cn("w-full h-full object-cover transition-opacity duration-300", loading ? "opacity-0" : "opacity-100")}
                  onLoad={() => setLoading(false)}
                  onError={() => {
                    setLoading(false);
                    setError("生成失败，请检查网络或重试");
                  }}
                />
              </div>

              {error && (
                <p className="text-xs text-red-400 mt-2 text-center">{error}</p>
              )}

              {!loading && !error && (
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={handleRegenerate}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 font-medium hover:bg-gray-50 transition-colors"
                  >
                    换一张
                  </button>
                  <button
                    onClick={handleUseImage}
                    disabled={converting}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-pink-500 text-white text-sm font-bold shadow-sm hover:shadow-md transition-all disabled:opacity-60"
                  >
                    {converting ? (
                      <span className="flex items-center justify-center gap-1.5">
                        <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" />
                        </svg>
                        保存中...
                      </span>
                    ) : "✅ 使用此图片"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tips */}
          <div className="bg-gradient-to-r from-violet-50 to-pink-50 rounded-2xl p-4 text-xs text-violet-600 border border-violet-100">
            <p className="font-semibold mb-1.5">💡 创作小技巧</p>
            <ul className="space-y-1 text-violet-500">
              <li>• 描述越具体，效果越好：场景、色调、光线、情绪</li>
              <li>• 可以加入风格参考：例如"宫崎骏风格"、"赛博朋克"</li>
              <li>• 不满意可以点"换一张"用不同随机种子重新生成</li>
              <li>• 由 Pollinations AI 提供免费生成服务</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
