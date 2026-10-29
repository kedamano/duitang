import path from "path";
import { fileURLToPath } from "url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/main.tsx", "src/types/**"],
      // 防回归底线：按当前实测（约 63.5/60.7/51.9/67.7）留 2 个点的余量，
      // 新增测试后逐步上调；统计范围为全部源码（含未被单测引用的组件）
      thresholds: { statements: 61, branches: 58, functions: 49, lines: 65 },
      reporter: ["text", "html"],
    },
  },
});
