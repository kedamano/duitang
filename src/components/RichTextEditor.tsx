import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cn } from "../utils/cn";
import { Icon } from "./Icons";

/** 工具栏按钮 */
function ToolButton({
  onClick, active, label, children, disabled,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={!!active}
      title={label}
      className={cn(
        "w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-colors",
        active ? "bg-brand-soft text-[#e05d6f]" : "text-body2 hover:bg-soft2",
        disabled && "opacity-40 cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}

/**
 * 富文本编辑器（TipTap）。
 * 输出 HTML，由后端 sanitize-html 与前端 DOMPurify 双重白名单过滤后再渲染。
 */
export default function RichTextEditor({
  value,
  onChange,
  placeholder = "写点什么…",
  minHeight = 140,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [3, 4] },
        codeBlock: false,
        horizontalRule: false,
      }),
    ],
    content: value || "",
    // TipTap v3 默认不在每次事务后重渲染，工具栏的激活态会滞后；这里显式开启
    shouldRerenderOnTransaction: true,
    // 由外部同步内容，避免受控更新时打断输入
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    editorProps: {
      attributes: {
        class: "rich-content focus:outline-none px-3 py-2 text-sm text-ink2",
        style: `min-height:${minHeight}px`,
      },
    },
  });

  // 外部值变化（例如切换到另一条帖子）时同步到编辑器
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() === (value || "")) return;
    editor.commands.setContent(value || "", { emitUpdate: false });
  }, [editor, value]);

  if (!editor) {
    return <div className="border border-line2 rounded-xl px-3 py-2 text-sm text-mute">编辑器加载中…</div>;
  }

  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("链接地址（留空则移除）", previous || "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  return (
    <div className="border border-line2 rounded-xl overflow-hidden bg-surface focus-within:border-[#e05d6f] transition-colors" data-testid="rich-text-editor">
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-line bg-soft/60 flex-wrap">
        <ToolButton label="加粗" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <span className="font-bold">B</span>
        </ToolButton>
        <ToolButton label="斜体" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <span className="italic">I</span>
        </ToolButton>
        <ToolButton label="删除线" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <span className="line-through">S</span>
        </ToolButton>
        <ToolButton label="小标题" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          H
        </ToolButton>
        <span className="w-px h-5 bg-soft2 mx-1" />
        <ToolButton label="无序列表" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <Icon name="list" className="w-4 h-4" />
        </ToolButton>
        <ToolButton label="有序列表" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <Icon name="listOrdered" className="w-4 h-4" />
        </ToolButton>
        <ToolButton label="引用" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Icon name="quote" className="w-4 h-4" />
        </ToolButton>
        <ToolButton label="行内代码" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
          <Icon name="code" className="w-4 h-4" />
        </ToolButton>
        <ToolButton label="链接" active={editor.isActive("link")} onClick={setLink}>
          <Icon name="link" className="w-4 h-4" />
        </ToolButton>
        <span className="w-px h-5 bg-soft2 mx-1" />
        <ToolButton label="清除格式" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
          <Icon name="eraser" className="w-4 h-4" />
        </ToolButton>
      </div>

      <div className="relative">
        <EditorContent editor={editor} />
        {isEditorEmpty(editor) && (
          <p className="pointer-events-none absolute left-3 top-2 text-sm text-mute">{placeholder}</p>
        )}
      </div>
    </div>
  );
}

/** TipTap 空文档判断 */
function isEditorEmpty(editor: { getText: () => string }): boolean {
  return editor.getText().trim().length === 0;
}
