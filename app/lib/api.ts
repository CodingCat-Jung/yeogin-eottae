// app/lib/api.ts

// ✅ CSRF 쿠키 읽기 함수
export function getCsrfFromCookie(): string | null {
  const m = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// ✅ 공통 fetch 래퍼
export async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    credentials: "include", // ★ 세션 쿠키 포함
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

  return res.json();
}

// ✅ 예시: CSRF 검증이 필요한 POST
export async function secureAction(body: any) {
  const csrf = getCsrfFromCookie();
  if (!csrf) throw new Error("로그인/CSRF 토큰 없음");

  return apiFetch("/api/auth/secure-action", {
    method: "POST",
    headers: {
      "X-CSRF-Token": csrf,
    },
    body: JSON.stringify(body),
  });
}
