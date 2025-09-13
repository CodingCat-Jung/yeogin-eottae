import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./app"), // 프로젝트 구조에 맞게
    },
  },
  server: {
    port: 5173,
    proxy: {
      // 프론트에서 /api/... 로 요청하면 백엔드(8000)으로 전달됨
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        secure: false, // 로컬 개발환경이니까 false
      },
    },
  },
});
