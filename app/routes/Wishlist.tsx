// routes/Wishlist.tsx
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { ResultData } from "@/components/ResultData";

/* ---------- 타입 ---------- */
type WishRow = { item_type: string; item_id: number; created_at?: string; note?: string };
type RecLite = { id: number; survey_id?: number | null; title?: any; summary?: any };
type DetailResp = { preferences?: any; recommendation?: any; result?: any; data?: any };
type WishCardItem = { key: string; snapshot: any; addedAt: number };

/* ---------- 상수/유틸 ---------- */
const CARD_WISH_KEY = "travia:wish-cards";

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS<T>(key: string, value: T) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

/** 여러 이름의 CSRF 쿠키를 지원 */
function getCsrfFromCookie() {
  const names = ["csrf_token", "csrftoken", "XSRF-TOKEN", "XSRF_TOKEN"];
  for (const name of names) {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

/** Authorization 헤더(있으면) + 공통 Accept */
function buildAuthHeaders() {
  const token = useAuthStore.getState().token;
  const h: Record<string, string> = { Accept: "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/** detail 로드 실패 시 타이틀에서 city/country 추출 */
function parseCity(t: any): string | null {
  try {
    if (typeof t === "string") return t.split(/[,\n]/)[0]?.trim() || null;
    if (Array.isArray(t)) return parseCity(t[0]) || null;
    if (t && typeof t === "object") return t.city ?? t.destination ?? t.place ?? null;
  } catch {}
  return null;
}
function parseCountry(t: any): string | null {
  try {
    if (typeof t === "string") {
      const parts = t.split(/[,\n]/).map((s) => s.trim());
      return parts.length > 1 ? parts[1] : null;
    }
    if (Array.isArray(t)) return parseCountry(t[0]) || null;
    if (t && typeof t === "object") return t.country ?? null;
  } catch {}
  return null;
}
function summarizeReason(s: any): string | null {
  try {
    if (typeof s === "string") return s;
    if (Array.isArray(s)) return s.map((x) => summarizeReason(x)).filter(Boolean).join(" / ");
    if (s && typeof s === "object") return s.reason ?? s.description ?? s.summary ?? null;
  } catch {}
  return null;
}

export default function WishlistPage() {
  const navigate = useNavigate();
  const { setUser, setAuthed } = useAuthStore();

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const cur = useMemo(
    () => items[Math.min(Math.max(activeIndex, 0), Math.max(items.length - 1, 0))],
    [items, activeIndex]
  );

  /* ---- me 보정 ---- */
  async function ensureMe() {
    try {
      const res = await fetch(`/api/auth/me`, { credentials: "include", headers: buildAuthHeaders() });
      if (!res.ok) return false;
      const me = await res.json();
      setUser?.({ id: me.id, nickname: me.nickname, email: me.email });
      setAuthed?.(true);
      return true;
    } catch {
      return false;
    }
  }

  /* ---- 로딩 (서버 위시 + 로컬 카드 위시 병합) ---- */
  async function load() {
    setLoading(true);
    setErr(null);
    try {
      // 1) 서버 위시 목록
      let res = await fetch(`/api/wishlist/my`, { credentials: "include", headers: buildAuthHeaders() });
      if (res.status === 401) {
        const ok = await ensureMe();
        if (ok) res = await fetch(`/api/wishlist/my`, { credentials: "include", headers: buildAuthHeaders() });
      }
      if (res.status === 401) {
        useAuthStore.getState().logout?.();
        navigate("/login?re_uri=/wish", { replace: true });
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = (await res.json()) as WishRow[];

      const recIds = Array.from(
        new Set(
          (Array.isArray(list) ? list : [])
            .filter((w) => (w.item_type ?? "").toLowerCase() === "recommendation")
            .map((w) => Number(w.item_id))
            .filter((n) => Number.isFinite(n))
        )
      );

      // 2) 서버 rec -> 카드
      const fromServerCards: any[] = [];
      const recs: RecLite[] = recIds.length
        ? (await Promise.all(
          recIds.map(async (id) => {
            try {
              const r = await fetch(`/api/recommendations/${id}`, {
                credentials: "include",
                headers: buildAuthHeaders(),
              });
              if (!r.ok) throw new Error();
              return await r.json();
            } catch {
              return null;
            }
          })
        )).filter(Boolean) as RecLite[]
        : [];

      for (const rec of recs) {
        const sid = rec.survey_id;
        if (!sid) continue;
        try {
          const d = await fetch(`/api/v1/survey/detail/${sid}`, {
            credentials: "include",
            headers: buildAuthHeaders(),
          });
          if (!d.ok) throw new Error(`detail ${sid} HTTP ${d.status}`);
          const detail: DetailResp = await d.json();
          const cards = (detail?.recommendation ?? detail?.result ?? detail?.data ?? []) as any[];
          if (Array.isArray(cards) && cards.length) {
            fromServerCards.push(...cards.map((c) => ({ ...c, _recId: rec.id })));
          } else {
            fromServerCards.push({
              id: `rec-${rec.id}`,
              _recId: rec.id,
              city: parseCity(rec.title) ?? "저장한 추천",
              country: parseCountry(rec.title) ?? "",
              reason: summarizeReason(rec.summary) ?? "서버에서 상세를 불러오지 못했어요.",
              schedule: [],
            });
          }
        } catch {
          fromServerCards.push({
            id: `rec-${rec.id}`,
            _recId: rec.id,
            city: parseCity(rec.title) ?? "저장한 추천",
            country: parseCountry(rec.title) ?? "",
            reason: summarizeReason(rec.summary) ?? "상세 로드 실패",
            schedule: [],
          });
        }
      }

      // 3) 로컬 카드 위시 (snapshot 펼치면서 __wishKey 부여)
      const localWishItems = readLS<WishCardItem[]>(CARD_WISH_KEY, []);
      const localCards = (Array.isArray(localWishItems) ? localWishItems : [])
        .map((w) => {
          const snap = w?.snapshot ?? {};
          return { ...snap, _recId: snap?._recId ?? snap?.recId ?? null, __wishKey: w.key };
        })
        .filter(Boolean);

      // 4) 병합(안정 키로 중복 제거)
      const uniq = new Map<string | number, any>();
      for (const c of fromServerCards) {
        const id = c?.id ?? `${c?._recId}:${c?.city}:${c?.country}`;
        uniq.set(id, c);
      }
      for (const c of localCards) {
        const id = c?.id ?? `${c?._recId}:${c?.city}:${c?.country}:${c?.__wishKey ?? ""}`;
        if (!uniq.has(id)) uniq.set(id, c);
      }

      const merged = Array.from(uniq.values());
      setItems(merged);

      // 5) 초기 활성
      setActiveIndex(0);
    } catch (e: any) {
      setErr(e?.message || "위시리스트를 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

  /* ---- 초기 및 외부 변경 반영 ---- */
  useEffect(() => {
    (async () => {
      await ensureMe();
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const reload = () => load();
    window.addEventListener("travia:wish-cards-updated", reload as EventListener);
    window.addEventListener("travia:wishlist-updated", reload as EventListener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === CARD_WISH_KEY) load();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("travia:wish-cards-updated", reload as EventListener);
      window.removeEventListener("travia:wishlist-updated", reload as EventListener);
      window.removeEventListener("storage", onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- 해제: 서버(recId) 또는 로컬(__wishKey) 모두 처리 ---- */
  async function unWishCurrent() {
    if (!cur) return;

    // 1) 서버 묶음 위시(recId) 해제
    if (cur._recId != null) {
      const recId = Number(cur._recId);
      const prev = items.slice();

      const next = items.filter((x) => Number(x?._recId) !== recId);
      const newIndex = Math.min(activeIndex, Math.max(next.length - 1, 0));
      setItems(next);
      setActiveIndex(newIndex);

      const csrf = getCsrfFromCookie();
      try {
        const res = await fetch(`/api/wishlist`, {
          method: "DELETE",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(csrf ? { "X-CSRF-Token": csrf, "X-CSRFToken": csrf } : {}),
            ...buildAuthHeaders(),
          },
          body: JSON.stringify({ item_type: "recommendation", item_id: recId }),
        });
        if (res.status === 401) {
          setItems(prev);
          setActiveIndex(activeIndex);
          useAuthStore.getState().logout?.();
          navigate("/login?re_uri=/wish", { replace: true });
          return;
        }
        if (!res.ok) throw new Error(`unwish failed: ${res.status}`);
        window.dispatchEvent(new CustomEvent("travia:wishlist-updated"));
      } catch {
        setItems(prev);
        setActiveIndex(activeIndex);
        alert("위시 해제에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
      return;
    }

    // 2) 로컬 카드 위시(__wishKey) 해제
    if (cur.__wishKey) {
      const key = String(cur.__wishKey);
      const prev = items.slice();

      // 로컬 스토리지에서 제거
      const list = readLS<WishCardItem[]>(CARD_WISH_KEY, []);
      const left = (Array.isArray(list) ? list : []).filter((w) => w.key !== key);
      writeLS(CARD_WISH_KEY, left);

      // UI에서도 제거
      const next = items.filter((x) => x.__wishKey !== key);
      const newIndex = Math.min(activeIndex, Math.max(next.length - 1, 0));
      setItems(next);
      setActiveIndex(newIndex);

      // 다른 탭/컴포넌트 동기화
      window.dispatchEvent(new CustomEvent("travia:wish-cards-updated", { detail: { key } }));
      return;
    }

    // 둘 다 없으면 안내
    alert("이 카드는 연결된 위시 정보가 없어 해제할 수 없어요.");
  }

  /* ---- 렌더 ---- */
  if (loading) return <div className="p-6 text-center text-zinc-500">불러오는 중…</div>;
  if (err) {
    return (
      <div className="p-6 flex flex-col items-center gap-2">
        <TriangleAlert className="w-6 h-6 text-rose-500" />
        <p className="text-sm text-zinc-600">{err}</p>
      </div>
    );
  }
  if (!items.length) {
    return (
      <div className="wishlist-scope max-w-screen-md mx-auto p-6">
        <HideInlineIconsCSS />
        <h1 className="text-lg font-bold mb-3">위시리스트</h1>
        <div className="text-zinc-500">위시에 저장한 카드가 아직 없어요.</div>
      </div>
    );
  }

  const canServerUnwish = !!cur?._recId;
  const canLocalUnwish = !!cur?.__wishKey;
  const disableUnwish = !canServerUnwish && !canLocalUnwish;
  const buttonLabel = canServerUnwish ? "💔 위시 해제" : "💔 위시 해제";

  return (
    <div className="wishlist-scope max-w-screen-md mx-auto p-6 space-y-4">
      <HideInlineIconsCSS />

      {/* 헤더 + 데스크톱 해제 버튼 */}
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-lg font-bold">위시리스트</h1>
        <button
          onClick={unWishCurrent}
          disabled={disableUnwish}
          className={[
            "hidden md:inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold transition",
            disableUnwish
              ? "bg-zinc-100 text-zinc-400 ring-1 ring-zinc-200 cursor-not-allowed"
              : "bg-rose-50 text-rose-600 ring-1 ring-rose-200 hover:bg-rose-100",
          ].join(" ")}
          aria-label="위시리스트에서 제거"
          title={disableUnwish ? "해제할 위시 정보가 없어요" : undefined}
        >
          {buttonLabel}
        </button>
      </div>

      <ResultData
        data={items}
        hideInlineActions={true}
        onActiveChange={(idx: number, item: any) => {
          setActiveIndex(idx);
        }}
      />

      {/* 모바일 하단 고정 해제 버튼 */}
      <div className="md:hidden fixed bottom-4 left-0 right-0 z-40">
        <div className="mx-auto w-full max-w-screen-sm px-4">
          <div className="flex gap-2 rounded-2xl bg-white/90 backdrop-blur-md shadow-lg ring-1 ring-zinc-200 p-2">
            <button
              onClick={unWishCurrent}
              disabled={disableUnwish}
              className={[
                "flex-1 inline-flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold transition",
                disableUnwish ? "bg-zinc-200 text-zinc-500" : "bg-rose-500 text-white hover:brightness-105",
              ].join(" ")}
              aria-label="위시리스트에서 제거"
            >
              {buttonLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 위시리스트 화면에서만 하트/북마크 아이콘 강제 숨김 (보강용) */
function HideInlineIconsCSS() {
  return (
    <style>{`
      .wishlist-scope .lucide-heart,
      .wishlist-scope .lucide-bookmark { display: none !important; }
      .wishlist-scope button:has(.lucide-heart),
      .wishlist-scope button:has(.lucide-bookmark) { display: none !important; }
      @supports(padding:max(0px)) {
        .wishlist-scope { padding-bottom: max(env(safe-area-inset-bottom), 16px); }
      }
    `}</style>
  );
}
