import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 后端地址：默认 http://localhost:3001，端口被占用时可用环境变量覆盖
//   PowerShell:  $env:BACKEND_URL="http://localhost:3002"; npm run dev
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

// https://vite.dev/config/
const proxy = {
  "/api/pollinations": {
    target: "https://image.pollinations.ai",
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/api\/pollinations/, ""),
  },
  "/api": {
    target: BACKEND_URL,
    changeOrigin: true,
  },
  "/uploads": {
    target: BACKEND_URL,
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: { proxy },
  // vite preview 不继承 server.proxy，生产构建验证时需要同样指向后端
  preview: { proxy },
});
