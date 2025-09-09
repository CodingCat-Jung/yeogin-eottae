// app/lib/auth.ts
import { apiFetch } from "@/lib/api";
import { useUserStore } from "@/store/userStore";

export async function logoutAndReset() {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
  } finally {
    // ✅ 전역 상태/스토리지 싹 초기화
    useUserStore.getState().reset();
    // persist를 쓰면 로컬스토리지도 정리
    localStorage.removeItem("user");       // 사용 중인 키명에 맞춰 삭제
    sessionStorage.removeItem("user");     // 사용 중이면
  }
}
