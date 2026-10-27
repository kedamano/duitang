import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCollection } from "../context/CollectionContext";
import { useToast } from "../context/ToastContext";
import { api } from "../api";
import { cn } from "../utils/cn";
import { labelToBoard, boardOptions } from "../data/images";
import AiImageGenModal from "../components/AiImageGenModal";
import RichTextEditor from "../components/RichTextEditor";
import { isRichTextEmpty } from "../utils/richText";
import type { Album } from "../types/api";
import { Icon } from "../components/Icons";

/** 与后端 multer 限制保持一致 */
const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** 草稿键：只存文本信息，图片受 localStorage 配额限制不持久化 */
const DRAFT_KEY = "duitang_publish_draft";

interface Draft {
  title: string;
  description: string;
  tags: string[];
  board: string;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** 读取图片真实宽高（后端据此返回 sizes，前端做错落瀑布流） */
function measureImage(url: string): Promise<{ w: number; h: number }> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 400, h: img.naturalHeight || 300 });
    img.onerror = () => resolve({ w: 400, h: 300 });
    img.src = url;
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
  const [myAlbums, setMyAlbums] = useState<Album[]>([]);
  const [albumId, setAlbumId] = useState<number | null>(null);
  // 拖拽排序时记录源下标
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // 拉取我的专辑，供发布时选择归入
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api.myAlbums()
      .then(d => { if (!cancelled) setMyAlbums(d.albums || []); })
      .catch(() => { /* 专辑加载失败不影响发布 */ });
    return () => { cancelled = true; };
  }, [user]);

  // 进入页面时恢复草稿：优先服务端（跨设备可用），回落到 localStorage
  useEffect(() => {
    let cancelled = false;
    const apply = (d: Partial<Draft> | null, fromServer: boolean) => {
      if (cancelled || !d) return;
      if (d.title) setTitle(d.title);
      if (d.description) setDescription(d.description);
      if (Array.isArray(d.tags) && d.tags.length) setTags(d.tags.slice(0, 5));
      if (d.board) setBoard(d.board);
      if (d.title || d.description || d.board || (d.tags || []).length) {
        showToast(fromServer ? "已恢复服务端草稿" : "已恢复上次未发布的草稿", "success");
      }
    };

    api.getMyDraft()
      .then(d => {
        if (d.draft) { apply(d.draft, true); return; }
        try {
          const raw = localStorage.getItem(DRAFT_KEY);
          if (raw) apply(JSON.parse(raw) as Draft, false);
        } catch { /* 草稿损坏则忽略 */ }
      })
      .catch(() => {
        // 服务端不可用时回落到本地草稿
        try {
          const raw = localStorage.getItem(DRAFT_KEY);
          if (raw) apply(JSON.parse(raw) as Draft, false);
        } catch { /* 忽略 */ }
      });

    return () => { cancelled = true; };
  }, [showToast]);

  // 输入过程中自动保存草稿（防抖）：同时写服务端与 localStorage
  useEffect(() => {
    const timer = setTimeout(() => {
      const empty = !title.trim() && isRichTextEmpty(description) && tags.length === 0 && !board;
      const payload: Draft = { title, description, tags, board };
      try {
        if (empty) localStorage.removeItem(DRAFT_KEY);
        else localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      } catch {
        /* 配额不足时放弃本地保存，不打断输入 */
      }
      if (!user) return;
      if (empty) api.deleteMyDraft().catch(() => {});
      else api.saveMyDraft(payload).catch(() => { /* 服务端保存失败不影响发布 */ });
    }, 1200);
    return () => clearTimeout(timer);
  }, [title, description, tags, board, user]);

  /** 过滤掉非图片与超过 10MB 的文件，避免白等一次上传失败 */
  const pickValidFiles = (files: File[]): File[] => {
    const valid: File[] = [];
    const tooBig: string[] = [];
    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > MAX_FILE_BYTES) { tooBig.push(f.name); continue; }
      valid.push(f);
    }
    if (tooBig.length) showToast(`${tooBig.length} 张图片超过 10MB，已跳过`, "error");
    return valid;
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="text-center">
          <Icon name="lock" className="w-14 h-14 mx-auto mb-4 text-mute2" />
          <h2 className="text-xl font-bold text-ink mb-2">请先登录</h2>
          <p className="text-mute text-sm mb-6">登录后才能发布内容哦</p>
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
    for (const file of pickValidFiles(Array.from(files))) {
      if (newImages.length + images.length >= 9) break;
      const dataUrl = await fileToDataUrl(file);
      newImages.push({ file, preview: dataUrl });
    }
    setImages(prev => [...prev, ...newImages].slice(0, 9));
    e.target.value = "";
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
    const files = pickValidFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/")));
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

  /** 把某张图移到第一位（作为封面） */
  const setAsCover = (index: number) => {
    setImages(prev => {
      if (index <= 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.unshift(moved);
      return next;
    });
  };

  /** 调整图片顺序 */
  const moveImage = (index: number, dir: -1 | 1) => {
    setImages(prev => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
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
      const thumbs: string[] = [];
      const variants: { url: string; width: number }[][] = [];
      const sizes: { w: number; h: number }[] = [];
      for (const img of images) {
        if (img.preview.startsWith('data:')) {
          const blob = await fetch(img.preview).then(r => r.blob());
          const file = new File([blob], 'image.jpg', { type: img.file?.type || blob.type || 'image/jpeg' });
          const data = await api.upload(file);
          if (!data.url) throw new Error('图片上传失败');
          imageUrls.push(data.url);
          // 尺寸变体由后端生成；失败时回落原图
          if (Array.isArray(data.variants) && data.variants.length) {
            variants.push(data.variants);
            thumbs.push(data.variants[0].url || data.url);
          } else {
            variants.push([{ url: data.url, width: data.width || 0 }]);
            thumbs.push(data.thumb || data.url);
          }
        } else {
          // 已是可访问地址（本地上传结果或 AI 生成的远程图）
          imageUrls.push(img.preview);
          thumbs.push(img.preview);
          variants.push([{ url: img.preview, width: 0 }]);
        }
        sizes.push(await measureImage(img.preview));
      }

      const result = await api.createPost({
        title: title.trim(),
        description: isRichTextEmpty(description) ? '' : description,
        board: labelToBoard[board] ?? board,
        images: imageUrls,
        tags,
        sizes,
        thumbs,
        variants,
      });
      addUserPost(result.post);
      // 归入专辑（可选，失败不阻断发布）
      if (albumId && result.post?.id) {
        try { await api.addPostToAlbum(albumId, result.post.id); } catch { /* 忽略 */ }
      }
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* 忽略 */ }
      api.deleteMyDraft().catch(() => { /* 忽略 */ });
      setPublishing(false);
      showToast("发布成功", "success");
      navigate("/");
    } catch (err) {
      showToast('发布失败: ' + (err as Error).message, "error");
      setPublishing(false);
    }
  };

  return (
    <div className="min-h-screen bg-page pb-20">
      {/* Top Bar */}
      <div className="sticky top-14 z-30 bg-surface border-b border-line shadow-sm">
        <div className="max-w-3xl mx-auto flex items-center justify-between h-14 px-4">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-body2 hover:text-ink2 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">返回</span>
          </button>
          <h1 className="font-bold text-ink">发布新内容</h1>
          <button
            onClick={handlePublish}
            disabled={!title.trim() || publishing || images.length === 0}
            className={cn(
              "text-sm font-bold px-6 py-2.5 rounded-full transition-all",
              title.trim() && images.length > 0 && !publishing
                ? "bg-[#e05d6f] text-white shadow-md hover:bg-[#c94d5e]"
                : "bg-soft2 text-mute cursor-not-allowed",
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
            <p className="font-semibold text-ink text-sm">{user.nickname}</p>
            <p className="text-xs text-mute">发布到堆糖</p>
          </div>
        </div>

        {/* Image Upload Area */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-semibold text-ink2">
              上传图片 {images.length > 0 && <span className="text-mute font-normal">({images.length}/9)</span>}
            </label>
            <button
              onClick={() => setShowAiGen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gradient-to-r from-violet-500 to-pink-500 text-white shadow-sm hover:shadow-md hover:scale-105 active:scale-95 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              AI 生成图片
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
                  ? "border-[#e05d6f] bg-brand-soft/30"
                  : "border-line3 hover:border-[#e05d6f] hover:bg-soft",
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-16 h-16 rounded-full bg-brand-soft flex items-center justify-center">
                <svg className="w-8 h-8 text-[#e05d6f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-body">点击或拖拽上传图片</p>
                <p className="text-xs text-mute mt-1">支持 JPG、PNG 格式，最多 9 张</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {images.map((img, i) => (
                <div
                  key={i}
                  draggable
                  onDragStart={e => {
                    setDragIndex(i);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                  onDrop={e => {
                    e.preventDefault();
                    const from = dragIndex;
                    setDragIndex(null);
                    if (from === null || from === i) return;
                    setImages(prev => {
                      const next = [...prev];
                      const [moved] = next.splice(from, 1);
                      next.splice(i, 0, moved);
                      return next;
                    });
                  }}
                  className={cn(
                    "relative group w-28 h-28 rounded-xl overflow-hidden bg-soft2 cursor-grab active:cursor-grabbing",
                    dragIndex === i && "ring-2 ring-[#e05d6f] ring-offset-2",
                  )}
                >
                  <img src={img.preview} alt="" className="w-full h-full object-cover pointer-events-none" />
                  <button
                    onClick={() => removeImage(i)}
                    aria-label={`删除第 ${i + 1} 张图片`}
                    className="absolute top-1.5 right-1.5 w-7 h-7 bg-black/50 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  {i === 0 && (
                    <span className="absolute bottom-1.5 left-1.5 text-xs bg-[#e05d6f] text-white px-1.5 py-0.5 rounded font-medium">封面</span>
                  )}
                  {/* 设为封面：非首图时显示 */}
                  {i !== 0 && (
                    <button
                      onClick={() => setAsCover(i)}
                      className="absolute bottom-1.5 left-1.5 text-[10px] bg-black/50 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                    >
                      设为封面
                    </button>
                  )}
                  {/* 顺序调整 */}
                  <div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => moveImage(i, -1)}
                      disabled={i === 0}
                      aria-label="前移"
                      className="w-6 h-6 bg-black/50 text-white rounded flex items-center justify-center disabled:opacity-30 hover:bg-black/70"
                    >
                      <Icon name="arrowLeft" className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => moveImage(i, 1)}
                      disabled={i === images.length - 1}
                      aria-label="后移"
                      className="w-6 h-6 bg-black/50 text-white rounded flex items-center justify-center disabled:opacity-30 hover:bg-black/70"
                    >
                      <Icon name="arrowRight" className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
              {images.length < 9 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-28 h-28 rounded-xl border-2 border-dashed border-line3 hover:border-[#e05d6f] hover:bg-brand-soft/20 flex flex-col items-center justify-center gap-1 transition-colors group"
                >
                  <svg className="w-7 h-7 text-mute group-hover:text-[#e05d6f] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-xs text-mute group-hover:text-[#e05d6f]">{images.length}/9</span>
                </button>
              )}
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
        </div>

        {/* Title */}
        <div className="mb-5">
          <label className="text-sm font-semibold text-ink2 mb-2 block">
            标题 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="给你的内容起一个好标题..."
            maxLength={50}
            className="w-full bg-surface border border-line2 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#e05d6f]/30 focus:border-[#e05d6f] transition-all text-ink2 placeholder:text-mute"
          />
          <p className="text-xs text-mute mt-1 text-right">{title.length}/50</p>
        </div>

        {/* Description */}
        <div className="mb-5">
          <label className="text-sm font-semibold text-ink2 mb-2 block">描述</label>
          <RichTextEditor
            value={description}
            onChange={setDescription}
            placeholder="描述一下你的内容，支持加粗、列表、链接…"
            minHeight={130}
          />
          <p className="text-xs text-mute mt-1 text-right">{description.length}/5000</p>
        </div>

        {/* Board */}
        <div className="mb-5">
          <label className="text-sm font-semibold text-ink2 mb-2 block">选择画板</label>
          <div className="flex flex-wrap gap-2">
            {boardOptions.map(b => (
              <button
                key={b}
                onClick={() => setBoard(board === b ? "" : b)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all",
                  board === b
                    ? "bg-[#e05d6f] text-white shadow-sm"
                    : "bg-surface border border-line2 text-body hover:border-[#e05d6f] hover:text-[#e05d6f]",
                )}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* Album（可选）*/}
        {myAlbums.length > 0 && (
          <div className="mb-5">
            <label htmlFor="publish-album" className="text-sm font-semibold text-ink2 mb-2 block">
              归入专辑 <span className="text-mute font-normal">（可选）</span>
            </label>
            <select
              id="publish-album"
              value={albumId ?? ""}
              onChange={e => setAlbumId(e.target.value ? Number(e.target.value) : null)}
              className="w-full sm:w-64 px-3 py-2 rounded-xl border border-line2 text-sm bg-surface focus:outline-none focus:border-[#e05d6f]"
            >
              <option value="">不归入专辑</option>
              {myAlbums.map(a => (
                <option key={a.id} value={a.id}>{a.title}</option>
              ))}
            </select>
          </div>
        )}

        {/* Tags */}
        <div className="mb-5">
          <label className="text-sm font-semibold text-ink2 mb-2 block">
            标签 <span className="text-mute font-normal">（最多5个）</span>
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {tags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 bg-brand-soft text-[#e05d6f] text-xs font-medium px-3 py-1.5 rounded-full">
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
              className="flex-1 bg-surface border border-line2 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#e05d6f]/30 focus:border-[#e05d6f] transition-all text-ink2 placeholder:text-mute"
            />
            <button onClick={addTag} disabled={!tagInput.trim()} className="px-4 py-2.5 bg-soft2 text-body rounded-xl text-sm font-medium hover:bg-soft2 transition-colors disabled:opacity-40">
              添加
            </button>
          </div>
        </div>

        {/* Tips */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-700">
          <p className="font-semibold mb-2 flex items-center gap-1">
            <Icon name="bulb" className="w-4 h-4" /> 发布小贴士
          </p>
          <ul className="list-disc list-inside text-amber-600 space-y-1 text-xs">
            <li>上传清晰的图片，封面图会吸引更多糖友关注</li>
            <li>标题简洁有力，描述详细有温度</li>
            <li>选择合适的画板和标签，让更多人发现你的内容</li>
            <li>使用 AI 生成图片功能快速创作专属内容！</li>
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
