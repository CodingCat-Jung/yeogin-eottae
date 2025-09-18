// app/lib/api.ts

// ✅ 백엔드 Base URL (같은 오리진이면 상대경로)
const BASE =
  (import.meta.env.VITE_BACKEND_ADDRESS || "").trim() || "";

// ✅ CSRF 쿠키 읽기
export function getCsrfFromCookie(): string | null {
  const m = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// ✅ 필요 시 CSRF 쿠키 발급 (없으면 /api/auth/csrf 호출)
export async function ensureCsrf() {
  if (!getCsrfFromCookie()) {
    const res = await fetch(`${BASE}/api/auth/csrf`, {
      credentials: "include",
    });
    // 200이면 서버가 Set-Cookie 해줌
    if (!res.ok) {
      throw new Error(`CSRF 발급 실패: ${res.status}`);
    }
  }
}

// ✅ 공통 fetch 래퍼
export async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    credentials: "include", // ★ 세션/CSRF 쿠키 포함
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || res.statusText);
  }
  return res.json() as Promise<T>;
}

/* ============================
   인증 관련 헬퍼
============================ */

// 로그인 (닉네임/비번)
export async function login(nickname: string, password: string) {
  await ensureCsrf();
  const csrf = getCsrfFromCookie();
  if (!csrf) throw new Error("CSRF 토큰 없음");

  return apiFetch<{ status: string; user_id: number; nickname: string }>(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "x-csrf-token": csrf }, // ★ 소문자-하이픈
      body: JSON.stringify({ nickname, password }),
    }
  );
}

// 현재 로그인 사용자
export async function fetchMe() {
  return apiFetch<{ id: number; nickname: string; profile_image_url: string | null }>(
    "/api/auth/me"
  );
}

// 로그아웃
export async function logout() {
  await ensureCsrf(); // (서버가 CSRF 검사 안 해도 일관성 유지 차원)
  const csrf = getCsrfFromCookie();
  return apiFetch("/api/auth/logout", {
    method: "POST",
    headers: csrf ? { "x-csrf-token": csrf } : undefined,
  });
}

/* ============================
   예: 보호된 POST 액션
============================ */

export async function secureAction(body: any) {
  await ensureCsrf();
  const csrf = getCsrfFromCookie();
  if (!csrf) throw new Error("CSRF 토큰 없음");

  return apiFetch("/api/auth/secure-action", {
    method: "POST",
    headers: { "x-csrf-token": csrf }, // ★ 여기도 통일
    body: JSON.stringify(body),
  });
}

/* ============================
   예: 이미지 업로드 (multipart)
============================ */
// 서버가 /api/upload 로 File(...) 받는 경우
export async function uploadImage(file: File) {
  await ensureCsrf();
  const csrf = getCsrfFromCookie();
  if (!csrf) throw new Error("CSRF 토큰 없음");

  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    credentials: "include",
    headers: {
      // multipart는 Content-Type 자동 설정(절대 수동 설정 X)
      "x-csrf-token": csrf,
    },
    body: form,
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || res.statusText);
  }
  return res.json() as Promise<{ url: string }>;
}
