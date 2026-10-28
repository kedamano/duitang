import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "./ErrorBoundary";

function Bomb({ message }: { message: string }) {
  if (message) throw new Error(message);
  return <span>正常内容</span>;
}

describe("ErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("无错误时渲染 children", () => {
    render(
      <ErrorBoundary>
        <Bomb message="" />
      </ErrorBoundary>,
    );
    expect(screen.getByText("正常内容")).toBeInTheDocument();
  });

  it("子组件抛错时显示兜底页与错误信息", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb message="炸了呀" />
      </ErrorBoundary>,
    );
    expect(screen.getByText("页面出错了")).toBeInTheDocument();
    expect(screen.getByText("炸了呀")).toBeInTheDocument();
  });

  it("「回到首页」把 hash 重置为 /", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const loc = { hash: "#/pin/9", reload: vi.fn() };
    vi.stubGlobal("location", loc);
    render(
      <ErrorBoundary>
        <Bomb message="x" />
      </ErrorBoundary>,
    );
    await userEvent.click(screen.getByText("回到首页"));
    expect(loc.hash).toBe("#/");
  });
});
