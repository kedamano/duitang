import { useEffect, useState } from "react";

/**
 * 把快速变化的值延迟到停止变化后再更新，用于搜索输入等高频场景。
 * 输入框本身仍用原始值渲染，保证打字无延迟，只有下游请求跟着防抖。
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
