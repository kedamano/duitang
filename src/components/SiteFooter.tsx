import { Icon } from "./Icons";
import { Link } from "react-router-dom";

/**
 * 全站页脚：下载 App 引导卡 + 版权链接。
 * 挂在 App 路由外层，所有页面底部统一展示（原先是首页右栏专属）。
 * 深浅模式通用：用语义色 token，粉色仅用于品牌强调。
 * 版权链接指向 /about 对应锚点板块（关于/帮助/反馈/举报）。
 */
const FOOTER_LINKS = [
  { label: "关于堆糖", to: "/about#about" },
  { label: "帮助中心", to: "/about#help" },
  { label: "意见反馈", to: "/about#feedback" },
  { label: "举报中心", to: "/about#report" },
];

export default function SiteFooter() {
  return (
    <footer data-testid="site-footer" className="mt-12 border-t border-line bg-surface">
      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* 下载 App 引导卡：粉色渐变 + 白色内容，全站统一入口 */}
        <div className="bg-gradient-to-br from-[#e05d6f] to-[#f0a0a8] rounded-2xl p-5 sm:p-6 text-white shadow-md flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <Icon name="phone" className="w-5 h-5" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h3 className="font-bold text-base mb-0.5">下载堆糖App</h3>
            <p className="text-xs text-white/85">随时随地收集你喜欢的图片</p>
          </div>
          <button className="bg-surface text-[#e05d6f] font-bold text-sm px-6 py-2.5 rounded-full hover:shadow-lg transition-shadow shrink-0">
            立即下载
          </button>
        </div>

        {/* 版权链接 */}
        <div className="mt-8 text-xs text-mute flex flex-col items-center gap-3">
          <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            {FOOTER_LINKS.map(l => (
              <Link
                key={l.label}
                to={l.to}
                className="hover:text-[#e05d6f] transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <p>© 2026 duitang.com 版权所有</p>
        </div>
      </div>
    </footer>
  );
}
