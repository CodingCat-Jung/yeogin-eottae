// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// 1) .env에서 백엔드 주소 읽기 (예: http://34.47.89.151)
//    개발 중엔 비워두고 프록시로만 쓰는 게 가장 안전.
const ENV_TARGET = (process.env.VITE_BACKEND_ADDRESS ?? "").trim();

// 2) 실행 환경에 따라 기본 타겟 결정
// - VM 내부에서 프론트 실행 시: uvicorn(127.0.0.1:8000)
// - 로컬 PC에서 프론트 실행 시: 원격 VM의 퍼블릭 IP
const DEFAULT_TARGET =
  process.env.RUNNING_IN_VM === "1"
    ? "http://127.0.0.1:8000"
    : "http://34.47.89.151";

// 최종 타겟 (환경변수 > 기본값)
const TARGET = ENV_TARGET || DEFAULT_TARGET;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./app"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // ✅ API는 반드시 상대 경로(`/api`)로 호출 → 프록시가 백엔드로 전달
      "/api": {
        target: TARGET,
        changeOrigin: true,
        secure: false,
      },
      // ✅ 헬스체크도 프록시
      "/health": {
        target: TARGET,
        changeOrigin: true,
        secure: false,
      },
      // ✅ 정적 파일(/static)도 프록시
      "/static": {
        target: TARGET,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
