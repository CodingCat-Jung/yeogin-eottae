import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Sparkles,
  Clock3,
  Heart,
  Bookmark,
  Check,
} from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import { Card } from "./ui/card";

/* ===================== Props ===================== */
type ResultDataProps = {
  data: any[];
  surveyId?: number | string;
  initialIndex?: number;
  hideInlineActions?: boolean;        // History에서 원형 액션 숨김
  RightActions?: () => JSX.Element;   // 외부 액션 슬롯
  onActiveChange?: (index: number, item: any) => void;
  /** 'card' = 카드 단위 위시, 'recommendation' = 묶음(도시/국가) 단위 위시 */
  wishMode?: "card" | "recommendation";
};

/* ===================== Component ===================== */
export function ResultData({
                             data,
                             surveyId,
                             initialIndex = 0,
                             hideInlineActions = false,
                             RightActions,
                             onActiveChange,
                             wishMode = "recommendation",
                           }: ResultDataProps) {
  const [index, setIndex] = useState(0);

  // 위시/북마크 변경 시 강제 리렌더 트리거
  const [wishNonce, setWishNonce] = useState(0);
  const bump = () => setWishNonce((n) => n + 1);

  // mount & data 변경 시 초기 인덱스 반영
  useEffect(() => {
    const safe = Array.isArray(data) ? data : [];
    const clamp = Math.max(0, Math.min(initialIndex, Math.max(safe.length - 1, 0)));
    setIndex(clamp);
  }, [initialIndex, data]);

  const safeData = Array.isArray(data) ? data : [];
  const total = safeData.length;
  const safeIndex = Math.min(Math.max(index, 0), Math.max(total - 1, 0));
  const cur = safeData[safeIndex];

  // 현재 카드의 안전한 키 (id 없을 때 대비)
  const cardKey = useMemo(() => {
    const id = cur?.id;
    if (id != null) return `id:${String(id)}`;
    const city = (cur?.city ?? "").toLowerCase();
    const country = (cur?.country ?? "").toLowerCase();
    return `v2:${String(surveyId ?? "s")}:${safeIndex}:${city}/${country}`;
  }, [cur?.id, cur?.city, cur?.country, surveyId, safeIndex]);

  // 부모 콜백
  useEffect(() => {
    onActiveChange?.(safeIndex, cur);
  }, [safeIndex, cur, onActiveChange]);

  // 키보드 좌/우
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setIndex((v) => Math.max(0, v - 1));
      if (e.key === "ArrowRight") setIndex((v) => Math.min(total - 1, v + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  // schedule 정규화
  const dayEntries = useMemo(() => normalizeSchedule(cur?.schedule), [cur]);

  /* ========== localStorage keys & helpers ========== */
  const WISH_KEY = "travia:wishlist";        // 묶음 단위 (city/country)
  const CARD_WISH_KEY = "travia:wish-cards"; // 카드 단위 (cardKey)
  const BM_KEY = "travia:bookmarks";

  // 외부 탭/컴포넌트에서 바뀐 것도 반영 (storage + 커스텀 이벤트)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if ([WISH_KEY, CARD_WISH_KEY, BM_KEY].includes(e.key)) bump();
    };
    const onCustom = () => bump();
    window.addEventListener("storage", onStorage);
    window.addEventListener("travia:wishlist-updated", onCustom as EventListener);
    window.addEventListener("travia:wish-cards-updated", onCustom as EventListener);
    window.addEventListener("travia:bookmarks-updated", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("travia:wishlist-updated", onCustom as EventListener);
      window.removeEventListener("travia:wish-cards-updated", onCustom as EventListener);
      window.removeEventListener("travia:bookmarks-updated", onCustom as EventListener);
    };
  }, []);

  /* ========== derived states (wish/bookmark) ========== */
  // 카드 단위 위시 여부: cardKey 기준
  const isCardWished = useMemo(() => {
    const list: WishCardItem[] = readLS(CARD_WISH_KEY, []);
    return list.some((x) => x.key === cardKey);
  }, [cardKey, wishNonce]);

  // 묶음 단위 위시 여부: city/country 기준
  const isWishlisted = useMemo(() => {
    const list: WishlistItem[] = readLS(WISH_KEY, []);
    return list.some((w) => eqCityCountry(w, cur));
  }, [cur, wishNonce]);

  // 북마크 여부
  const isBookmarked = useMemo(() => {
    const list: BookmarkItem[] = readLS(BM_KEY, []);
    return list.some((b) => eqBookmark(b, surveyId, safeIndex, cur));
  }, [cur, safeIndex, surveyId, wishNonce]);

  /* ========== toggles (모두 bump + 커스텀 이벤트 발행) ========== */
  const toggleCardWishlist = () => {
    const list: WishCardItem[] = readLS(CARD_WISH_KEY, []);
    const idx = list.findIndex((x) => x.key === cardKey);
    if (idx >= 0) list.splice(idx, 1);
    else list.push({ key: cardKey, snapshot: cur, addedAt: Date.now() });
    writeLS(CARD_WISH_KEY, list);
    bump();
    window.dispatchEvent(new CustomEvent("travia:wish-cards-updated", { detail: { key: cardKey } }));
  };

  const toggleWishlist = () => {
    const list: WishlistItem[] = readLS(WISH_KEY, []);
    const exists = list.findIndex((w) => eqCityCountry(w, cur));
    if (exists >= 0) list.splice(exists, 1);
    else
      list.push({
        city: cur?.city ?? "",
        country: cur?.country ?? "",
        reason: cur?.reason ?? "",
        addedAt: Date.now(),
      });
    writeLS(WISH_KEY, list);
    bump();
    window.dispatchEvent(new CustomEvent("travia:wishlist-updated"));
  };

  const toggleBookmark = () => {
    const list: BookmarkItem[] = readLS(BM_KEY, []);
    const idx = list.findIndex((b) => eqBookmark(b, surveyId, safeIndex, cur));
    if (idx >= 0) list.splice(idx, 1);
    else
      list.push({
        surveyId: surveyId ?? null,
        resultIndex: safeIndex,
        city: cur?.city ?? "",
        country: cur?.country ?? "",
        addedAt: Date.now(),
      });
    writeLS(BM_KEY, list);
    bump();
    window.dispatchEvent(new CustomEvent("travia:bookmarks-updated"));
  };

  if (!total) {
    return (
      <div className="grid place-items-center h-36 rounded-2xl bg-white/70 ring-1 ring-zinc-200 text-zinc-500">
        추천 결과가 없어요.
      </div>
    );
  }

  return (
    <div className="w-full" id={`result-${safeIndex}`}>
      {/* 헤더 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
        <div className="flex items-start gap-3">
          <div className="grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl sm:text-[26px] font-extrabold tracking-tight text-zinc-900">
              {cur?.city && cur?.country
                ? `${cur.city}, ${cur.country}`
                : cur?.city || cur?.country || "추천 지역"}
            </h2>
            <p className="text-sm text-zinc-500">지난 추천을 빠르게 다시 확인해 보세요.</p>
          </div>
        </div>

        {/* 우측 컨트롤 */}
        <div className="flex items-center gap-2 md:gap-3 ml-auto">
          {!hideInlineActions && (
            <>
              <WishPill
                active={wishMode === "card" ? isCardWished : isWishlisted}
                onToggle={wishMode === "card" ? toggleCardWishlist : toggleWishlist}
              />
              <IconGhostButton
                aria-label="북마크"
                onClick={toggleBookmark}
                title={isBookmarked ? "북마크 해제" : "북마크 추가"}
              >
                <Bookmark
                  className={[
                    "w-4 h-4",
                    isBookmarked ? "text-amber-600 fill-amber-400/30" : "text-amber-500",
                  ].join(" ")}
                />
              </IconGhostButton>
            </>
          )}

          {RightActions && (
            <div className="flex items-center gap-2 pr-1">
              <RightActions />
            </div>
          )}

          {/* Pager */}
          <div className="flex items-center gap-2 md:gap-3 pl-1">
            <IconGhostButton
              aria-label="이전"
              disabled={safeIndex <= 0}
              onClick={() => setIndex((v) => Math.max(0, v - 1))}
            >
              <ChevronLeft className="w-4 h-4 text-violet-700" />
            </IconGhostButton>
            <span className="min-w-[64px] text-center text-sm text-zinc-500">
              <strong className="text-zinc-800">{safeIndex + 1}</strong> / {total}
            </span>
            <IconGhostButton
              aria-label="다음"
              disabled={safeIndex >= total - 1}
              onClick={() => setIndex((v) => Math.min(total - 1, v + 1))}
            >
              <ChevronRight className="w-4 h-4 text-violet-700" />
            </IconGhostButton>
          </div>
        </div>
      </div>

      {/* 추천 이유 */}
      {cur?.reason && (
        <Accordion type="single" collapsible>
          <AccordionItem value="reason">
            <AccordionTrigger className="rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-zinc-200 hover:bg-violet-50/60 text-[15px] font-semibold text-violet-800 data-[state=open]:shadow-md">
              <div className="flex items-center gap-2">
                <Sparkles className="h-[18px] w-[18px]" />
                추천 이유 보기
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <p className="mt-3 rounded-xl bg-zinc-50 ring-1 ring-zinc-200 px-4 py-3 text-zinc-700 leading-7">
                {cur.reason}
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {/* Day 카드 슬라이더 */}
      <motion.div
        initial={{ opacity: 0, y: 4, filter: "blur(3px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.35 }}
        className="relative mt-4"
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent rounded-l-2xl" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent rounded-r-2xl" />
        <div
          role="region"
          aria-label="여행 일정 슬라이더"
          className="overflow-x-auto flex gap-4 px-2 pt-2 pb-3 pr-6 snap-x snap-mandatory"
          style={{ scrollBehavior: "smooth" }}
        >
          {dayEntries.map((day, i) => (
            <DayCard key={i} label={`Day ${i + 1}`} items={day.items} />
          ))}
          {dayEntries.length === 0 && (
            <Card className="snap-start shrink-0 w-full rounded-2xl bg-white ring-1 ring-zinc-200 shadow-sm p-5">
              <p className="text-zinc-600">일정을 불러올 수 없어요. 추천 이유만 확인할 수 있습니다.</p>
            </Card>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/* ===================== Wish Pill ===================== */
function WishPill({
                    active,
                    onToggle,
                    labelOn = "위시",
                    labelOff = "위시",
                  }: {
  active: boolean;
  onToggle: () => void;
  labelOn?: string;
  labelOff?: string;
}) {
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), 250);
    return () => clearTimeout(t);
  }, [flash]);

  const handleClick = () => {
    onToggle();
    setFlash(true);
  };

  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      animate={flash ? { scale: [1, 1.06, 1] } : {}}
      transition={{ duration: 0.25 }}
      onClick={handleClick}
      aria-pressed={active}
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold select-none",
        "ring-1 transition-all duration-150",
        active
          ? "bg-rose-600 text-white ring-rose-600 shadow-sm"
          : "bg-white text-rose-600 ring-rose-300 hover:bg-rose-50",
      ].join(" ")}
      title={active ? "위시에서 제거" : "위시에 추가"}
    >
      {active ? (
        <>
          <Heart className="w-4 h-4 fill-white/30" />
          <span className="hidden sm:inline">{labelOn}</span>
          <Check className="w-4 h-4 ml-0.5" />
        </>
      ) : (
        <>
          <Heart className="w-4 h-4 text-rose-600" />
          <span className="hidden sm:inline">{labelOff}</span>
        </>
      )}
    </motion.button>
  );
}

/* ===================== Small Components ===================== */
function IconGhostButton({
                           children,
                           disabled,
                           onClick,
                           ...rest
                         }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode;
}) {
  return (
    <button
      {...rest}
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "h-9 w-9 rounded-full border border-zinc-200 bg-white",
        "hover:bg-zinc-50 transition",
        disabled ? "opacity-40 cursor-not-allowed" : "",
      ].join(" ")}
    >
      <div className="grid place-items-center">{children}</div>
    </button>
  );
}

type DayItem = { time?: string; activity?: string };

function DayCard({ label, items }: { label: string; items: DayItem[] }) {
  return (
    <Card className="snap-start shrink-0 w-[18rem] sm:w-72 min-h-[300px] rounded-2xl bg-white ring-1 ring-zinc-200 shadow-sm p-4">
      <h3 className="text-lg font-semibold text-violet-700 mb-3">{label}</h3>
      <div className="flex flex-col gap-2">
        {items.map((it, idx) => (
          <PlanItem key={idx} time={formatTime(it.time)} activity={it.activity} />
        ))}
        {items.length === 0 && <p className="text-sm text-zinc-500">등록된 일정이 없어요.</p>}
      </div>
    </Card>
  );
}

function PlanItem({ time, activity }: { time?: string; activity?: string }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <Clock3 className="w-4 h-4 mt-0.5 text-violet-600" />
      <div className="text-sm leading-6">
        <div className="font-medium text-zinc-800">{time || "-"}</div>
        <div className="text-zinc-600">{activity || ""}</div>
      </div>
    </div>
  );
}

/* ===================== Utils ===================== */
type WishCardItem = { key: string; snapshot: any; addedAt: number };
type WishlistItem = { city: string; country: string; reason?: string; addedAt: number };
type BookmarkItem = { surveyId: number | string | null; resultIndex: number; city: string; country: string; addedAt: number };

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLS<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function eqCityCountry(a: { city?: string; country?: string }, b: any) {
  return (
    (a.city ?? "").toLowerCase() === (b?.city ?? "").toLowerCase() &&
    (a.country ?? "").toLowerCase() === (b?.country ?? "").toLowerCase()
  );
}
function eqBookmark(b: BookmarkItem, surveyId: number | string | null | undefined, resultIndex: number, cur: any) {
  const sidA = b.surveyId ?? null;
  const sidB = surveyId ?? null;
  return sidA === sidB && b.resultIndex === resultIndex && eqCityCountry(b, cur);
}

/** 다양한 schedule 포맷 허용 → [{items:[...]}, ...] */
function normalizeSchedule(schedule: any): { items: DayItem[] }[] {
  if (!schedule) return [];
  if (typeof schedule === "object" && !Array.isArray(schedule)) {
    const keys = Object.keys(schedule).sort(sortDayKey);
    return keys.map((k) => ({ items: Array.isArray(schedule[k]) ? schedule[k] : [] }));
  }
  if (Array.isArray(schedule)) {
    const groups: Record<string, DayItem[]> = {};
    for (const item of schedule) {
      const key = String(item?.day ?? "1");
      groups[key] ||= [];
      groups[key].push({ time: item?.time, activity: item?.activity });
    }
    const keys = Object.keys(groups).sort((a, b) => Number(a) - Number(b));
    return keys.map((k) => ({ items: groups[k] }));
  }
  return [];
}
function sortDayKey(a: string, b: string) {
  const ai = parseInt(a.replace(/\D/g, "") || "0", 10);
  const bi = parseInt(b.replace(/\D/g, "") || "0", 10);
  return ai - bi;
}
/** 08:00-09:00 → 08:00–09:00 */
function formatTime(v?: string) {
  if (!v) return "";
  return v.replace(/\s*-\s*/, "–");
}
