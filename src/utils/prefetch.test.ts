import { describe, it, expect, vi, beforeEach } from "vitest";
import { prefetchPost, takePrefetchedPost, clearPrefetchCache } from "./prefetch";
import * as apiModule from "../api";

vi.mock("../api", () => ({
  api: { getPost: vi.fn() },
}));

const fakePost = { id: 7, title: "预取帖" } as never;

describe("prefetch 详情预取缓存", () => {
  beforeEach(() => {
    clearPrefetchCache();
    vi.clearAllMocks();
  });

  it("hover 预取后，take 命中并一次性消费", async () => {
    (apiModule.api.getPost as ReturnType<typeof vi.fn>).mockResolvedValue({ post: fakePost });
    prefetchPost(7);
    await vi.waitFor(() => expect(apiModule.api.getPost).toHaveBeenCalledWith(7));
    expect(takePrefetchedPost(7)).toBe(fakePost);
    // 命中即删：第二次取为空
    expect(takePrefetchedPost(7)).toBeNull();
  });

  it("同一 id 并发 hover 只发一次请求", async () => {
    let resolve: (v: unknown) => void = () => {};
    (apiModule.api.getPost as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(r => { resolve = r; }),
    );
    prefetchPost(8);
    prefetchPost(8);
    prefetchPost(8);
    expect(apiModule.api.getPost).toHaveBeenCalledTimes(1);
    resolve({ post: fakePost });
  });

  it("预取失败静默，不影响后续真实请求", async () => {
    (apiModule.api.getPost as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("网络错误"));
    prefetchPost(9);
    await vi.waitFor(() => expect(apiModule.api.getPost).toHaveBeenCalled());
    expect(takePrefetchedPost(9)).toBeNull();
  });

  it("无 id 不请求", () => {
    prefetchPost(0);
    expect(apiModule.api.getPost).not.toHaveBeenCalled();
  });
});
