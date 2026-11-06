import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AboutPage from "./AboutPage";

function renderAbout(hash = "") {
  return render(
    <MemoryRouter initialEntries={[`/about${hash}`]}>
      <AboutPage />
    </MemoryRouter>
  );
}

describe("AboutPage", () => {
  it("渲染四个板块：关于/帮助/反馈/举报", () => {
    renderAbout();
    expect(screen.getByTestId("about-about")).toBeInTheDocument();
    expect(screen.getByTestId("about-help")).toBeInTheDocument();
    expect(screen.getByTestId("about-feedback")).toBeInTheDocument();
    expect(screen.getByTestId("about-report")).toBeInTheDocument();
  });

  it("帮助板块包含常见问题条目", () => {
    renderAbout();
    const help = screen.getByTestId("about-help");
    expect(help.textContent).toContain("帮助中心");
    expect(help.textContent).toContain("如何发布图片");
    expect(help.textContent).toContain("支持深色模式吗");
  });

  it("举报板块展示举报邮箱", () => {
    renderAbout();
    const report = screen.getByTestId("about-report");
    expect(report.textContent).toContain("report@duitang.com");
  });

  it("板块快捷导航锚点齐全", () => {
    renderAbout();
    const nav = screen.getByRole("navigation");
    expect(nav.textContent).toContain("关于堆糖");
    expect(nav.textContent).toContain("举报中心");
  });
});
