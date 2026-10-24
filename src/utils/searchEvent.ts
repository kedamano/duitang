/** 跨组件触发搜索：评论里的 @ 提及点击后，跳转到首页并带入关键词 */
export const SEARCH_EVENT = "duitang:search";

export function requestSearch(query: string) {
  window.dispatchEvent(new CustomEvent(SEARCH_EVENT, { detail: { query } }));
}
