import { Icon } from "../components/Icons";
import { useNavigate, useLocation } from "react-router-dom";
import { useEffect } from "react";

/**
 * 关于页：整合页脚「关于堆糖 / 帮助中心 / 意见反馈 / 举报中心」四个板块。
 * 纯静态信息页，锚点 #about / #help / #feedback / #report 直达对应板块。
 */
const SECTIONS = [
  {
    id: "about",
    icon: "bulb",
    title: "关于堆糖",
    body: (
      <>
        <p>堆糖是一个以图片为核心的兴趣社区，你可以浏览错落瀑布流、把喜欢的图收集进专辑、关注感兴趣的作者、在评论区讨论、发布自己的图文作品。</p>
        <p>我们希望这里是一个干净、友好的分享空间——尊重原创、鼓励分享、抵制违规内容。</p>
      </>
    ),
  },
  {
    id: "help",
    icon: "bubble",
    title: "帮助中心",
    faq: [
      ["如何发布图片？", "登录后点击顶栏「发布」按钮，上传最多 9 张图片，填写标题、描述、分类与标签即可发布。支持 JPG / PNG，会自动压缩。"],
      ["如何收集喜欢的图？", "在卡片或详情页点击「收藏」按钮（书签图标），即可把图片收进你的专辑，随时在个人主页查看。"],
      ["如何关注作者？", "点击作者头像进入主页，点「关注」；之后 TA 的更新会出现在「关注动态」流里。"],
      ["图片为什么会压缩？", "为节省流量与加快加载，上传时会自动把长边压到 2560px 内（JPEG 质量 0.85），并生成多档尺寸按需加载，原图细节基本无损。"],
      ["支持深色模式吗？", "支持。顶栏右上角可一键切换，会记住偏好并跟随系统设置。"],
    ],
  },
  {
    id: "feedback",
    icon: "mail",
    title: "意见反馈",
    body: (
      <>
        <p>遇到问题或有改进建议，欢迎告诉我们。你的反馈会直接影响产品的迭代方向。</p>
        <ul>
          <li>功能建议、体验问题、内容异常都可以反馈</li>
          <li>反馈时尽量附上截图与操作步骤，便于定位</li>
        </ul>
        <p className="text-sm">反馈邮箱：<span className="font-medium text-ink2">feedback@duitang.com</span></p>
      </>
    ),
  },
  {
    id: "report",
    icon: "shield",
    title: "举报中心",
    body: (
      <>
        <p>如果你发现违规内容（色情、暴力、侵权、诈骗、人身攻击等），请通过内容旁的「举报」入口提交，或发送邮件至举报专线。</p>
        <p>我们设有审核队列，会在收到举报后尽快人工复核并处理；对确认违规的内容会下架，对屡次违规的账号会封禁。</p>
        <p className="text-sm">举报邮箱：<span className="font-medium text-ink2">report@duitang.com</span></p>
      </>
    ),
  },
];

export default function AboutPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // 初次加载若带 #锚点（如 /about#help），滚动到对应板块
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.slice(1);
      // 等 DOM 渲染完成再滚
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [location.hash]);

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-6 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink flex items-center gap-2">
          <Icon name="bulb" className="w-6 h-6 text-[#e05d6f]" /> 关于堆糖
        </h1>
        <p className="text-sm text-mute mt-1">关于我们 · 帮助 · 反馈 · 举报</p>
      </div>

      {/* 板块快捷导航 */}
      <nav className="flex flex-wrap gap-2 mb-6">
        {SECTIONS.map(s => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={e => {
              e.preventDefault();
              document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="text-xs text-body2 bg-surface border border-line rounded-full px-3 py-1.5 hover:text-[#e05d6f] hover:border-[#e05d6f]/40 transition-colors"
          >
            {s.title}
          </a>
        ))}
      </nav>

      <div className="space-y-4">
        {SECTIONS.map(s => (
          <section
            key={s.id}
            id={s.id}
            data-testid={`about-${s.id}`}
            className="bg-surface rounded-2xl border border-line p-5 scroll-mt-24"
          >
            <h2 className="text-base font-semibold text-ink flex items-center gap-2 mb-3">
              <Icon name={s.icon} className="w-5 h-5 text-[#e05d6f]" /> {s.title}
            </h2>
            <div className="text-sm text-body leading-relaxed space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_li]:text-body">
              {s.body}
              {s.faq && (
                <dl className="space-y-3 mt-2">
                  {s.faq.map(([q, a]) => (
                    <div key={q}>
                      <dt className="font-medium text-ink2">· {q}</dt>
                      <dd className="text-body2 mt-0.5">{a}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </section>
        ))}
      </div>

      <button
        onClick={() => navigate("/")}
        className="mt-6 text-sm text-mute hover:text-[#e05d6f] transition-colors flex items-center gap-1"
      >
        <Icon name="arrowLeft" className="w-4 h-4" /> 返回首页
      </button>
    </main>
  );
}
