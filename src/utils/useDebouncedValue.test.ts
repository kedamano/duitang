import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebouncedValue } from "./useDebouncedValue";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useDebouncedValue", () => {
  it("初始值立即可用", () => {
    const { result } = renderHook(() => useDebouncedValue("a", 300));
    expect(result.current).toBe("a");
  });

  it("连续变化只在停止后更新一次", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: "" },
    });

    // 模拟逐字输入
    for (const v of ["汉", "汉服", "汉服写"]) {
      rerender({ v });
      act(() => { vi.advanceTimersByTime(100); });
      expect(result.current).toBe("");
    }

    // 停止输入 300ms 后只剩最后一次的值
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe("汉服写");
  });

  it("延迟可配置", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 50), {
      initialProps: { v: "x" },
    });
    rerender({ v: "y" });
    act(() => { vi.advanceTimersByTime(50); });
    expect(result.current).toBe("y");
  });
});
