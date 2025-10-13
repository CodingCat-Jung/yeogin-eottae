// app/store/authStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 같은 오리진(리버스 프록시/Ingress) 배포 가정 → API 빈 문자열 유지 */
const API = ""; // import.meta.env.VITE_BACKEND_ADDRESS ?? ""

/* ===================== 타입 ===================== */
export type User = {
  id: number;
  nickname: string;
  email?: string;
  profile_image_url?: string | null;
  /** 프사 캐시 버스트용 타임스탬프(숫자) */
  updated_at?: number | null;
} | null;

type AuthState = {
  token: string | null;
  user: User;
  isAuthed: boolean;
  initialized: boolean;

  setToken: (t: string | null) => void;
  setUser: (u: User) => void;
  setAuthed: (v: boolean) => void;

  /** 서버 세션/토큰 모두 끊고 스토어 초기화 */
  logout: () => Promise<void>;
  /** 앱 시작/새로고침 시 세션 또는 토큰으로 인증 동기화 */
  initialize: () => Promise<void>;
  /** 토큰만 로컬에서 복구(레거시 호환) */
  hydrateFromStorage: () => void;
  /** 새로고침 직후 user가 비어있을 때만 me로 보충 */
  hydrateUserFromAPI: () => Promise<void>;
};

type Stored = Pick<AuthState, "token" | "user" | "isAuthed" | "initialized">;

/* ===================== 유틸 ===================== */
/** /api/auth/me 응답을 우리 User 형태로 정규화 (updated_at → number|null 강제) */
function normalizeMe(raw: any): User {
  const u = raw?.user ?? raw?.data ?? raw;
  if (!u) return null;

  const id = u.id ?? u.userId ?? u.uid ?? u.pk;
  const nickname = u.nickname ?? u.name ?? u.username ?? u.nick;
  const email = u.email ?? u.mail ?? undefined;
  const profileImageUrl =
    u.profile_image_url ??
    u.profileImageUrl ??
    u.avatarUrl ??
    u.avatar_url ??
    u.photoURL ??
    u.photo_url ??
    null;

  // ✅ updated_at을 항상 숫자로 정규화 (unix 초/밀리초 혹은 ISO 문자열 모두 대응)
  let updated_at: number | null =
    u.updated_at ?? u.updatedAt ?? u.profile_updated_at ?? u.profileUpdatedAt ?? null;

  if (typeof updated_at === "string") {
    const asNum = Number(updated_at);
    if (Number.isFinite(asNum)) {
      updated_at = asNum;
    } else {
      const parsed = Date.parse(updated_at);
      updated_at = Number.isFinite(parsed) ? parsed : null;
    }
  } else if (typeof updated_at !== "number") {
    updated_at = null;
  }

  if (id == null || !nickname) return null;

  return {
    id: Number(id),
    nickname: String(nickname),
    email: email ? String(email) : undefined,
    profile_image_url: profileImageUrl ? String(profileImageUrl) : null,
    updated_at,
  };
}

/** 서버가 일시적으로 빈 이미지를 줄 때 기존 프사를 유지하기 위한 보수적 머지 */
function mergeUserKeepAvatar(oldU: User, newU: User): User {
  if (!newU) return oldU ?? null;
  if (!oldU) return newU;

  const nextProfile = (newU as any)?.profile_image_url;
  const keepProfile =
    nextProfile !== undefined &&
    nextProfile !== null &&
    String(nextProfile).trim() !== ""
      ? String(nextProfile)
      : (oldU as any)?.profile_image_url ?? null;

  const nextTs = (newU as any)?.updated_at;
  const keepTs =
    typeof nextTs === "number" && Number.isFinite(nextTs)
      ? nextTs
      : (oldU as any)?.updated_at ?? null;

  return {
    ...oldU,
    ...newU,
    profile_image_url: keepProfile,
    updated_at: keepTs,
  };
}

// CSRF(서버 구현에 맞춰 쿠키 이름 조정)
function getCsrfFromCookie(): string | null {
  // 우선순위: csrf → csrf_token → XSRF-TOKEN
  const m1 = document.cookie.match(/(?:^|;\s*)csrf=([^;]+)/);
  if (m1) return decodeURIComponent(m1[1]);
  const m2 = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  if (m2) return decodeURIComponent(m2[1]);
  const m3 = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  return m3 ? decodeURIComponent(m3[1]) : null;
}

async function ensureCsrf(base = API) {
  if (getCsrfFromCookie()) return;
  await fetch(`${base}/api/auth/csrf`, { credentials: "include" }).catch(() => {});
}

/* ===================== 스토어 ===================== */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthed: false,
      initialized: false,

      setToken: (t) => {
        if (t) localStorage.setItem("token", t);
        else localStorage.removeItem("token");
        set({ token: t, isAuthed: !!t });
      },

      setUser: (u) => set({ user: u }),

      setAuthed: (v) => set({ isAuthed: v }),

      logout: async () => {
        try {
          await ensureCsrf(API);
          const csrf = getCsrfFromCookie();
          await fetch(`${API}/api/auth/logout`, {
            method: "POST",
            credentials: "include",
            headers: csrf ? { "X-CSRF-Token": csrf } : undefined, // FastAPI alias(x-csrf-token)와 매칭됨
          });
        } catch {
          // 서버 세션 종료 실패는 무시(클라 상태만 초기화)
        }
        localStorage.removeItem("token");
        set({ token: null, user: null, isAuthed: false, initialized: true });
      },

      initialize: async () => {
        try {
          const prev = get().user;

          // 1) 세션 쿠키 기반 (캐시 우회)
          let res = await fetch(`${API}/api/auth/me`, {
            credentials: "include",
            cache: "no-store",
            headers: { "Cache-Control": "no-store" },
          });
          if (res.ok) {
            const me = normalizeMe(await res.json());
            if (me) {
              set({
                user: mergeUserKeepAvatar(prev, me),
                isAuthed: true,
                initialized: true,
              });
              return;
            }
          }

          // 2) 토큰 기반 (옵션: 유지하거나 제거 가능)
          const t = get().token ?? localStorage.getItem("token");
          if (t) {
            res = await fetch(`${API}/api/auth/me`, {
              headers: { Authorization: `Bearer ${t}`, "Cache-Control": "no-store" },
              credentials: "include",
              cache: "no-store",
            });
            if (res.ok) {
              const me = normalizeMe(await res.json());
              if (me) {
                set({
                  user: mergeUserKeepAvatar(prev, me),
                  token: t,
                  isAuthed: true,
                  initialized: true,
                });
                return;
              }
            }
          }
          set({ user: null, token: null, isAuthed: false, initialized: true });
        } catch {
          set({ initialized: true });
        }
      },

      hydrateFromStorage: () => {
        const t = localStorage.getItem("token");
        set({ token: t, isAuthed: !!t });
      },

      hydrateUserFromAPI: async () => {
        const prev = get().user;
        const { token } = get();
        if (prev) return; // 이미 있음

        try {
          // 우선 세션 (캐시 우회)
          let res = await fetch(`${API}/api/auth/me`, {
            credentials: "include",
            cache: "no-store",
            headers: { "Cache-Control": "no-store" },
          });
          if (res.ok) {
            const me = normalizeMe(await res.json());
            if (me) {
              set({ user: mergeUserKeepAvatar(prev, me), isAuthed: true });
              return;
            }
          }
          // 다음 Bearer
          if (token) {
            res = await fetch(`${API}/api/auth/me`, {
              headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-store" },
              credentials: "include",
              cache: "no-store",
            });
            if (res.ok) {
              const me = normalizeMe(await res.json());
              if (me) {
                set({ user: mergeUserKeepAvatar(prev, me), isAuthed: true });
              }
            }
          }
        } catch {
          /* noop */
        }
      },
    }),
    {
      name: "auth-store",
      version: 5, // ← 마이그레이션 버전 올림(업데이트 반영)
      partialize: (s) => ({
        token: s.token,
        user: s.user,
        isAuthed: s.isAuthed,
        initialized: s.initialized,
      }),
      migrate: (persisted: any, fromVersion: number): Stored => {
        if (!persisted || typeof persisted !== "object") {
          return { token: null, user: null, isAuthed: false, initialized: false };
        }
        if (fromVersion < 5) {
          return {
            token: persisted.token ?? null,
            user: persisted.user ?? null,
            isAuthed: Boolean(persisted.isAuthed ?? (persisted.token ? true : false)),
            initialized: Boolean(persisted.initialized ?? false),
          };
        }
        return persisted as Stored;
      },
    }
  )
);
