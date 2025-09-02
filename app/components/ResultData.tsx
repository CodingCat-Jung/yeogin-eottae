// components/ResultData.tsx
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
} from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import { Card } from "./ui/card";

/** 외부에서 data: 추천 결과 배열을 내려줌
 *  ✅ 위시리스트/북마크 지원 (localStorage)
 *  - wishlist key:   "travia:wishlist"
 *  - bookmarks key:  "travia:bookmarks"
 */
export function ResultData({
                             data,
                             surveyId, // 같은 설문 내에서 특정 추천(index)을 북마크하려면 전달
                           }: {
  data: any[];
  surveyId?: number | string;
}) {
  const [index, setIndex] = useState(0);

  // guard
  const safeData = Array.isArray(data) ? data : [];
  const total = safeData.length;
  const cur = safeData[Math.min(Math.max(index, 0), Math.max(total - 1, 0))];

  useEffect(() => {
    // 키보드 좌/우로 페이지 이동
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setIndex((v) => Math.max(0, v - 1));
      if (e.key === "ArrowRight") setIndex((v) => Math.min(total - 1, v + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  const dayEntries = useMemo(() => normalizeSchedule(cur?.schedule), [cur]);

  // ---- 위시리스트 / 북마크 로컬 스토리지 훅 ----
  const wishKey = "travia:wishlist";
  const bookmarkKey = "travia:bookmarks";

  const isWishlisted = useMemo(() => {
    if (!cur) return false;
    const list: WishlistItem[] = readLS(wishKey, []);
    return list.some((w) => eqCityCountry(w, cur));
  }, [cur]);

  const isBookmarked = useMemo(() => {
    if (!cur) return false;
    const list: BookmarkItem[] = readLS(bookmarkKey, []);
    return list.some((b) => eqBookmark(b, surveyId, index, cur));
  }, [cur, index, surveyId]);

  const toggleWishlist = () => {
    if (!cur) return;
    const list: WishlistItem[] = readLS(wishKey, []);
    const exists = list.findIndex((w) => eqCityCountry(w, cur));
    if (exists >= 0) {
      list.splice(exists, 1);
    } else {
      list.push({
        city: cur.city ?? "",
        country: cur.country ?? "",
        reason: cur.reason ?? "",
        addedAt: Date.now(),
      });
    }
    writeLS(wishKey, list);
  };

  const toggleBookmark = () => {
    if (!cur) return;
    const list: BookmarkItem[] = readLS(bookmarkKey, []);
    const idx = list.findIndex((b) => eqBookmark(b, surveyId, index, cur));
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push({
        surveyId: surveyId ?? null,
        resultIndex: index,
        city: cur.city ?? "",
        country: cur.country ?? "",
        addedAt: Date.now(),
      });
    }
    writeLS(bookmarkKey, list);
  };

  if (!total) {
    return (
      <div className="grid place-items-center h-36 rounded-2xl bg-white/70 ring-1 ring-zinc-200 text-zinc-500">
        추천 결과가 없어요.
      </div>
    );
  }

  return (
    <div className="w-full">
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

        {/* 우측 컨트롤: 위시/북마크 + Pager */}
        <div className="flex items-center gap-2 md:gap-3 ml-auto">
          {/* 위시리스트 토글 */}
          <IconGhostButton
            aria-label="위시리스트에 추가"
            onClick={toggleWishlist}
            title={isWishlisted ? "위시리스트에서 제거" : "위시리스트에 추가"}
          >
            <Heart
              className={[
                "w-4 h-4",
                isWishlisted ? "text-rose-600 fill-rose-500/20" : "text-rose-500",
              ].join(" ")}
            />
          </IconGhostButton>

          {/* 북마크 토글 */}
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

          {/* Pager */}
          <div className="flex items-center gap-2 md:gap-3 pl-1">
            <IconGhostButton
              aria-label="이전"
              disabled={index <= 0}
              onClick={() => setIndex((v) => Math.max(0, v - 1))}
            >
              <ChevronLeft className="w-4 h-4 text-violet-700" />
            </IconGhostButton>

            <span className="min-w-[64px] text-center text-sm text-zinc-500">
              <strong className="text-zinc-800">{index + 1}</strong> / {total}
            </span>

            <IconGhostButton
              aria-label="다음"
              disabled={index >= total - 1}
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

      {/* Day 카드 슬라이더 (가로 스크롤바 표시) */}
      <motion.div
        initial={{ opacity: 0, y: 4, filter: "blur(3px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.35 }}
        className="relative mt-4"
      >
        {/* 좌/우 페이드 */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent rounded-l-2xl" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent rounded-r-2xl" />

        <div
          role="region"
          aria-label="여행 일정 슬라이더"
          className="
            overflow-x-auto flex gap-4 px-2 pt-2 pb-3 pr-6
            snap-x snap-mandatory
            [scrollbar-width:thin] [scrollbar-color:#cfd1dd_transparent]
          "
          style={{ scrollBehavior: "smooth" }}
        >
          <style>{`
            /* WebKit(Chrome/Safari/Edge): 스크롤바 보이도록 + 은은한 스타일 */
            .snap-x::-webkit-scrollbar { height: 10px; }
            .snap-x::-webkit-scrollbar-track { background: transparent; }
            .snap-x::-webkit-scrollbar-thumb { background: #cfd1dd; border-radius: 8px; }
            .snap-x::-webkit-scrollbar-thumb:hover { background: #babccd; }
          `}</style>

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

/* ---------- 작은 구성요소들 ---------- */

function IconGhostButton({
                           children,
                           disabled,
                           onClick,
                           ...rest
                         }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) {
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

/* ---------- 유틸 ---------- */

type WishlistItem = {
  city: string;
  country: string;
  reason?: string;
  addedAt: number;
};

type BookmarkItem = {
  surveyId: number | string | null;
  resultIndex: number;
  city: string;
  country: string;
  addedAt: number;
};

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
  } catch {
    // ignore
  }
}

function eqCityCountry(a: { city?: string; country?: string }, b: any) {
  return (a.city ?? "").toLowerCase() === (b?.city ?? "").toLowerCase() &&
    (a.country ?? "").toLowerCase() === (b?.country ?? "").toLowerCase();
}

function eqBookmark(
  b: BookmarkItem,
  surveyId: number | string | null | undefined,
  resultIndex: number,
  cur: any
) {
  const sidA = b.surveyId ?? null;
  const sidB = surveyId ?? null;
  return (
    sidA === sidB &&
    b.resultIndex === resultIndex &&
    eqCityCountry(b, cur)
  );
}

/** 서버 schedule 다양한 형태를 관대하게 수용 → [{items:[...]}, ...] */
function normalizeSchedule(schedule: any): { items: DayItem[] }[] {
  if (!schedule) return [];
  // 객체 형태: { day_1: [{time,activity}], day_2: [...] }
  if (typeof schedule === "object" && !Array.isArray(schedule)) {
    const keys = Object.keys(schedule).sort(sortDayKey);
    return keys.map((k) => ({
      items: Array.isArray(schedule[k]) ? schedule[k] : [],
    }));
  }
  // 배열 형태: [{ time, activity, day }, ...] → day 기준 그룹핑
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

/** 08:00-09:00 → 08:00–09:00 (en dash), 기타 포맷은 원문 유지 */
function formatTime(v?: string) {
  if (!v) return "";
  return v.replace(/\s*-\s*/, "–");
}
