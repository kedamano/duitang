import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSwipe } from "./useSwipe";

const touch = (x: number, y: number) => ({ clientX: x, clientY: y });

describe("useSwipe", () => {
  it("左滑触发 onLeft", () => {
    const left = vi.fn(); const right = vi.fn();
    const { result } = renderHook(() => useSwipe(left, right));
    result.current.onTouchStart({ touches: [touch(300, 200)] } as never);
    result.current.onTouchEnd({ changedTouches: [touch(150, 210)] } as never);
    expect(left).toHaveBeenCalledTimes(1);
    expect(right).not.toHaveBeenCalled();
  });

  it("右滑触发 onRight", () => {
    const left = vi.fn(); const right = vi.fn();
    const { result } = renderHook(() => useSwipe(left, right));
    result.current.onTouchStart({ touches: [touch(100, 200)] } as never);
    result.current.onTouchEnd({ changedTouches: [touch(260, 190)] } as never);
    expect(right).toHaveBeenCalledTimes(1);
    expect(left).not.toHaveBeenCalled();
  });

  it("位移不足 48px 不触发", () => {
    const left = vi.fn(); const right = vi.fn();
    const { result } = renderHook(() => useSwipe(left, right));
    result.current.onTouchStart({ touches: [touch(100, 200)] } as never);
    result.current.onTouchEnd({ changedTouches: [touch(130, 200)] } as never);
    expect(left).not.toHaveBeenCalled();
    expect(right).not.toHaveBeenCalled();
  });

  it("纵向为主（页面滚动）不触发", () => {
    const left = vi.fn(); const right = vi.fn();
    const { result } = renderHook(() => useSwipe(left, right));
    result.current.onTouchStart({ touches: [touch(100, 100)] } as never);
    result.current.onTouchEnd({ changedTouches: [touch(120, 400)] } as never);
    expect(left).not.toHaveBeenCalled();
    expect(right).not.toHaveBeenCalled();
  });

  it("enabled=false 时一律不触发", () => {
    const left = vi.fn(); const right = vi.fn();
    const { result } = renderHook(() => useSwipe(left, right, false));
    result.current.onTouchStart({ touches: [touch(300, 200)] } as never);
    result.current.onTouchEnd({ changedTouches: [touch(50, 200)] } as never);
    expect(left).not.toHaveBeenCalled();
  });

  it("未开始触摸就 touchend 不报错", () => {
    const left = vi.fn();
    const { result } = renderHook(() => useSwipe(left, vi.fn()));
    expect(() =>
      result.current.onTouchEnd({ changedTouches: [touch(0, 0)] } as never),
    ).not.toThrow();
    expect(left).not.toHaveBeenCalled();
  });
});
