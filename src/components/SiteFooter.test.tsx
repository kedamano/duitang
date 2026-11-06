import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import SiteFooter from "./SiteFooter";

function Target() {
  const loc = useLocation();
  return <div data-testid="target">{loc.pathname + loc.hash}</div>;
}

function renderFooter() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<SiteFooter />} />
        <Route path="/about" element={<Target />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SiteFooter", () => {
  it("渲染下载卡与四个真实路由链接", () => {
    renderFooter();
    const footer = screen.getByTestId("site-footer");
    const links = Array.from(footer.querySelectorAll("nav a")) as HTMLAnchorElement[];
    expect(links.length).toBe(4);
    // 每个链接都指向 /about 锚点，不是占位 #
    for (const a of links) {
      expect(a.getAttribute("href")).not.toBe("#");
      expect(a.getAttribute("href")).toContain("/about");
    }
    expect(links[0].textContent).toBe("关于堆糖");
  });

  it("点击立即下载跳转到关于页", () => {
    renderFooter();
    fireEvent.click(screen.getByRole("button", { name: "立即下载" }));
    expect(screen.getByTestId("target")).toBeInTheDocument();
  });
});
