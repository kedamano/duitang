import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCollection } from "../context/CollectionContext";
import { useToast } from "../context/ToastContext";
import { api } from "../api";
import { cn } from "../utils/cn";
import AiImageGenModal from "../components/AiImageGenModal";

const boardOptions = ["壁纸头像", "动漫插画", "时尚穿搭", "美食菜谱", "手工DIY", "家居生活", "美妆造型", "旅行摄影", "古风汉服", "萌宠植物", "文字句子", "婚纱婚礼"];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PublishPage() {
  const { user, setShowLogin } = useAuth();
  const { addUserPost } = useCollection();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [images, setImages] = useState<{ file?: File; preview: string }[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [board, setBoard] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [showAiGen, setShowAiGen] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  if (!user) {
    return (
      <div className="min-h-screen bg-[#f8f8f8] flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">请先登录</h2>
          <p className="text-gray-400 text-sm mb-6">登录后才能发布内容哦</p>
          <button onClick={() => setShowLogin(true)} className="bg-[#e05d6f] text-white font-bold text-sm px-8 py-3 rounded-full hover:bg-[#c94d5e] transition-colors">
            去登录
          </button>
        </div>
      </div>
    );
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newImages: { file?: File; preview: string }[] = [];
    for (const file of Array.from(files)) {
      if (newImages.length + images.length >= 9) break;
      const dataUrl = await fileToDataUrl(file);
      newImages.push({ file, preview: dataUrl });
    }
    setImages(prev => [...prev, ...newImages].slice(0, 9));
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    const newImages: { file?: File; preview: string }[] = [];
    for (const file of files) {
      if (newImages.length + images.length >= 9) break;
      const dataUrl = await fileToDataUrl(file);
      newImages.push({ file, preview: dataUrl });
    }
    setImages(prev => [...prev, ...newImages].slice(0, 9));
  };

  const handleAiImage = (dataUrl: string) => {
    if (images.length >= 9) return;
    setImages(prev => [...prev, { preview: dataUrl }].slice(0, 9));
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t) && tags.length < 5) {
      setTags([...tags, t]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handlePublish = async () => {
    if (!title.trim() || images.length === 0) return;
    setPublishing(true);

    try {
      const imageUrls: string[] = [];
      for (const img of images) {
        if (img.preview.startsWith('data:')) {
          const blob = await fetch(img.preview).then(r => r.blob());
          const file = new File([blob], 'image.jpg', { type: 'image/jpeg' });
          const data = await api.upload(file);
          if (!data.url) throw new Error('图片上传失败');
          imageUrls.push(data.url);
        } else if (img.preview.startsWith('/uploads/') || img.preview.startsWith('http')) {
          imageUrls.push(img.preview);
        }
      }

      const result = await api.createPost({
        title: title.trim(),
        description: description.trim() || '',
        board,
        images: imageUrls,
        tags,
      });
      addUserPost(result.post);
      setPublishing(false);
      showToast("发布成功", "success");
      navigate("/");
    } catch (err) {
      showToast('发布失败: ' + (err as Error).message, "error");
      setPublishing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f8f8] pb-20">
      {/* Top Bar */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-3xl mx-auto flex items-center justify-between h-14 px-4">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-gray-500 hover:text-gray-700 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">返回</span>
          </button>
          <h1 className="font-bold text-gray-800">发布新内容</h1>
          <button
            onClick={handlePublish}
            disabled={!title.trim() || publishing || images.length === 0}
            className={cn(
              "text-sm font-bold px-6 py-2.5 rounded-full transition-all",
              title.trim() && images.length > 0 && !publishing
                ? "bg-[#e05d6f] text-white shadow-md hover:bg-[#c94d5e]"
                : "bg-gray-200 text-gray-400 cursor-not-allowed",
            )}
          >
            {publishing ? "发布中..." : "发布"}
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 mt-6">
        {/* User info */}
        <div className="flex items-center gap-3 mb-6">
          <img src={user.avatar} alt="" className="w-10 h-10 rounded-full ring-2 ring-[#f0a0a8]" />
          <div>
            <p className="font-semibold text-gray-800 text-sm">{user.nickname}</p>
            <p className="text-xs text-gray-400">发布到堆糖</p>
          </div>
        </div>

        {/* Image Upload Area */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-semibold text-gray-700">
              上传图片 {images.length > 0 && <span className="text-gray-400 font-normal">({images.length}/9)</span>}
            </label>
            <button
              onClick={() => setShowAiGen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gradient-to-r from-violet-500 to-pink-500 text-white shadow-sm hover:shadow-md hover:scale-105 active:scale-95 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              ✨ AI 生成图片
            </button>
          </div>

          {images.length === 0 ? (
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={cn(
                "w-full h-56 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-all cursor-pointer",
                dragActive
                  ? "border-[#e05d6f] bg-[#fde8eb]/30"
                  : "border-gray-300 hover:border-[#e05d6f] hover:bg-gray-50",
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-16 h-16 rounded-full bg-[#fde8eb] flex items-center justify-center">
                <svg className="w-8 h-8 text-[#e05d6f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-600">点击或拖拽上传图片</p>
                <p className="text-xs text-gray-400 mt-1">支持 JPG、PNG 格式，最多 9 张</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {images.map((img, i) => (
                <div key={i} className="relative group w-28 h-28 rounded-xl overflow-hidden bg-gray-100">
                  <img src={img.preview} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute top-1.5 right-1.5 w-7 h-7 bg-black/50 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  {i === 0 && (
                    <span className="absolute bottom-1.5 left-1.5 text-xs bg-[#e05d6f] text-white px-1.5 py-0.5 rounded font-medium">封面</span>
                  )}
                </div>
              ))}
              {images.length < 9 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-28 h-28 rounded-xl border-2 border-dashed border-gray-300 hover:border-[#e05d6f] hover:bg-[#fde8eb]/20 flex flex-col items-center justify-center gap-1 transition-colors group"
                >
                  <svg className="w-7 h-7 text-gray-400 group-hover:text-[#e05d6f] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-xs text-gray-400 group-hover:text-[#e05d6f]">{images.length}/9</span>
                </button>
              )}
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
        </div>

        {/* Title */}
        <div className="mb-5">
          <label className="text-sm font-semibold text-gray-700 mb-2 block">
            标题 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="给你的内容起一个好标题..."
            maxLength={50}
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#e05d6f]/30 focus:border-[#e05d6f] transition-all text-gray-700 placeholder-gray-400"
          />
          <p className="text-xs text-gray-400 mt-1 text-right">{title.length}/50</p>
        </div>

        {/* Description */}
        <div className="mb-5">
          <label className="text-sm font-semibold text-gray-700 mb-2 block">描述</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="描述一下你的内容，让大家更了解..."
            rows={4}
            maxLength={500}
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#e05d6f]/30 focus:border-[#e05d6f] transition-all text-gray-700 placeholder-gray-400 resize-none"
          />
          <p className="text-xs text-gray-400 mt-1 text-right">{description.length}/500</p>
        </div>

        {/* Board */}
        <div className="mb-5">
          <label className="text-sm font-semibold text-gray-700 mb-2 block">选择画板</label>
          <div className="flex flex-wrap gap-2">
            {boardOptions.map(b => (
              <button
                key={b}
                onClick={() => setBoard(board === b ? "" : b)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all",
                  board === b
                    ? "bg-[#e05d6f] text-white shadow-sm"
                    : "bg-white border border-gray-200 text-gray-600 hover:border-[#e05d6f] hover:text-[#e05d6f]",
                )}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* Tags */}
        <div className="mb-5">
          <label className="text-sm font-semibold text-gray-700 mb-2 block">
            标签 <span className="text-gray-400 font-normal">（最多5个）</span>
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {tags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 bg-[#fde8eb] text-[#e05d6f] text-xs font-medium px-3 py-1.5 rounded-full">
                #{tag}
                <button onClick={() => removeTag(tag)} className="ml-0.5 hover:text-red-500">
                  <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              placeholder="输入标签后回车添加"
              className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#e05d6f]/30 focus:border-[#e05d6f] transition-all text-gray-700 placeholder-gray-400"
            />
            <button onClick={addTag} disabled={!tagInput.trim()} className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-40">
              添加
            </button>
          </div>
        </div>

        {/* Tips */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-700">
          <p className="font-semibold mb-2">💡 发布小贴士</p>
          <ul className="list-disc list-inside text-amber-600 space-y-1 text-xs">
            <li>上传清晰的图片，封面图会吸引更多糖友关注</li>
            <li>标题简洁有力，描述详细有温度</li>
            <li>选择合适的画板和标签，让更多人发现你的内容</li>
            <li>使用 ✨ AI 生成图片功能快速创作专属内容！</li>
          </ul>
        </div>
      </div>

      <AiImageGenModal
        open={showAiGen}
        onClose={() => setShowAiGen(false)}
        onConfirm={handleAiImage}
      />
    </div>
  );
}
