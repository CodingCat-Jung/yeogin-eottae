// components/HistorySection.tsx
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Sparkles,
  MapPin,
  CalendarClock,
} from "lucide-react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./ui/accordion";
import { Button } from "./ui/button";

/** string / string[] / {icon,value} 모두 허용 */
type PrefValue =
  | { icon?: string; value?: string }
  | string
  | string[]
  | null
  | undefined;

export type HistorySectionProps = {
  index: number;
  total: number;
  loading: boolean;
  detail: {
    preferences?: {
      comp?: { icon?: string; value?: string };
      style?: string[] | Array<{ value?: string; icon?: string }>;
      duration?: string;
      budget?: string;
      driving?: { icon?: string; value?: string };
      climate?: { icon?: string; value?: string };
      cont?: { icon?: string; value?: string };
      density?: { icon?: string; value?: string };
      // 필요시 여기 새 필드들 추가
      months?: string[]; // ["1월","3월"] 등
      flexible?: { icon?: string; value?: string } | string | null;
      departSlot?: { icon?: string; value?: string };
      returnSlot?: { icon?: string; value?: string };
    };
    recommendation?: any;
  } | null;
  onPrev: () => void;
  onNext: () => void;

  /** 추천 본문 슬롯(ResultData 등) */
  RecommendationSlot?: (props: { data: any }) => JSX.Element;

  /** 상단에서 이미 제목을 보여줄 때 내부 헤더 숨김 */
  hideInnerHeader?: boolean;

  /** “맞춤 추천 결과”가 열렸을 때 헤더 오른쪽(1/N 왼쪽)에 붙일 pill(위시/보관) */
  ControlsLeftActions?: () => JSX.Element;

  /** ✅ 상단 헤더의 1/N 페이저 표시/숨김 */
  hideHeaderPager?: boolean;
};

const Fade = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
    transition={{ duration: 0.35 }}
  >
    {children}
  </motion.div>
);

/** 어떤 값이 와도 안전 문자열 */
function toText(input: any): string {
  try {
    if (input == null) return "-";
    const t = typeof input;
    if (t === "string" || t === "number" || t === "boolean") return String(input);
    if (Array.isArray(input)) return input.map(toText).join(", ");
    if (t === "object") {
      const cand =
        (input as any).value ??
        (input as any).label ??
        (input as any).name ??
        (input as any).text ??
        null;
      if (cand != null) return toText(cand);
      return JSON.stringify(input);
    }
    return String(input);
  } catch {
    return String(input);
  }
}

/** React 노드(아이콘 컴포넌트)처럼 보이는지 */
function isReactNodeIcon(x: any) {
  return x && typeof x === "object" && ("$$typeof" in x || "type" in x);
}

/** icon 선택: 배열 → 첫 원소.icon, 객체.icon → fallback → 기본점 */
function pickIcon(value: any, fallback?: string) {
  if (Array.isArray(value)) {
    const first = value[0];
    if (first && typeof first === "object" && "icon" in first && (first as any).icon) {
      return (first as any).icon;
    }
    if (fallback && String(fallback).trim()) return fallback;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const inner = (value as any).icon;
    if (inner) return inner;
  }
  if (fallback && String(fallback).trim()) return fallback;
  return "•";
}

const HistorySection = ({
                          index,
                          total,
                          loading,
                          detail,
                          onPrev,
                          onNext,
                          RecommendationSlot,
                          hideInnerHeader = false,
                          ControlsLeftActions,
                          hideHeaderPager = false, // ✅ 기본값
                        }: HistorySectionProps): JSX.Element => {
  const hasList = Number.isFinite(total) && total > 0;
  const clampedIndex = hasList ? Math.min(Math.max(index, 0), total - 1) : 0;

  // ✅ 어떤 아코디언이 열렸는지 제어 (기본 "reco"로 열림)
  const [openVal, setOpenVal] = useState<string | undefined>("reco");
  const isRecoOpen = openVal === "reco";

  // 인덱스/추천 변경 시에도 계속 "reco" 열어두기
  useEffect(() => {
    setOpenVal("reco");
  }, [index, detail?.recommendation]);

  return (
    <div className="rounded-3xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_18px_48px_-22px_rgba(101,67,255,0.25)] p-6 sm:p-8">
      {/* 헤더 */}
      {!hideInnerHeader && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-[28px] font-extrabold tracking-tight text-zinc-900 leading-tight">
                최근 설문 내역
              </h2>
              <p className="text-sm text-zinc-500 mt-0.5">
                지난 추천을 빠르게 다시 확인해 보세요.
              </p>
            </div>
          </div>

          {/* 헤더 오른쪽: (좌) pill (우) 인덱스+네비 */}
          <div className="flex items-center gap-2">
            {isRecoOpen && ControlsLeftActions && (
              <div
                className="flex items-center gap-2 shrink-0"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <ControlsLeftActions />
              </div>
            )}

            {/* ✅ 상단 1/N 페이저를 조건부로 */}
            {!hideHeaderPager && (
              <div className="flex items-center rounded-full bg-white/70 ring-1 ring-zinc-200 shadow-sm px-1.5 py-1 gap-1">
                <div className="px-2 min-w-[72px] text-center">
                  <span className="text-sm font-semibold text-zinc-800">
                    {hasList ? clampedIndex + 1 : "—"}
                  </span>
                  <span className="mx-1 text-zinc-400">/</span>
                  <span className="text-sm text-zinc-400">{hasList ? total : "—"}</span>
                </div>
                <Button
                  variant="ghost"
                  onClick={onPrev}
                  disabled={!hasList || clampedIndex <= 0}
                  className="h-8 w-8 rounded-full hover:bg-violet-50 text-violet-600 disabled:opacity-40"
                  aria-label="이전"
                  title="이전"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  onClick={onNext}
                  disabled={!hasList || clampedIndex >= total - 1}
                  className="h-8 w-8 rounded-full hover:bg-violet-50 text-violet-600 disabled:opacity-40"
                  aria-label="다음"
                  title="다음"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 로딩 스켈레톤 */}
      {loading && (
        <div className="mt-6 grid gap-4">
          <div className="h-12 rounded-2xl bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-100 animate-[pulse_1.4s_ease-in-out_infinite]" />
          <div className="h-12 rounded-2xl bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-100 animate-[pulse_1.4s_ease-in-out_infinite]" />
        </div>
      )}

      {/* 본문 */}
      {!loading && detail && (
        <Fade>
          <Accordion
            type="single"
            collapsible
            value={openVal}
            onValueChange={(v) => setOpenVal(v as string | undefined)}
            className="mt-6 space-y-4"
          >
            {/* 선호 정보 */}
            <AccordionItem value="prefs" className="border-none">
              <AccordionTrigger className="group rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-zinc-200 hover:bg-violet-50/60 text-[15px] font-semibold text-violet-700 data-[state=open]:shadow-md transition">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-[18px] w-[18px]" />
                  내 선호 정보
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {PrefCard("동행 유형", detail.preferences?.comp)}
                  {PrefCard("여행 스타일", detail.preferences?.style, "✨")}
                  {PrefCard("여행 기간", detail.preferences?.duration, "⏱")}
                  {PrefCard("예산", detail.preferences?.budget, "💰")}
                  {PrefCard("이동수단", detail.preferences?.driving)}
                  {PrefCard("대륙", detail.preferences?.cont)}
                  {PrefCard("기온", detail.preferences?.climate, "🌡️")}
                  {PrefCard("인파 밀도", detail.preferences?.density)}
                  {/* 필요시 추가 필드 */}
                  {PrefCard("여행 월", detail.preferences?.months, "🗓️")}
                  {PrefCard("출국 시간대", detail.preferences?.departSlot, "🛫")}
                  {PrefCard("귀국 시간대", detail.preferences?.returnSlot, "🛬")}
                  {detail.preferences?.flexible
                    ? PrefCard("일정 유연함", detail.preferences?.flexible, "🔀")
                    : null}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* 추천 결과 */}
            <AccordionItem value="reco" className="border-none">
              <AccordionTrigger className="group rounded-2xl bg-gradient-to-r from-violet-50 to-fuchsia-50 px-5 py-4 shadow-sm ring-1 ring-violet-100 hover:from-violet-100/60 hover:to-fuchsia-100/60 text-[15px] font-semibold text-violet-800 data-[state=open]:shadow-md transition">
                <div className="flex items-center gap-2">
                  <MapPin className="h-[18px] w-[18px]" />
                  맞춤 추천 결과
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                {detail.recommendation ? (
                  RecommendationSlot ? (
                    <RecommendationSlot data={detail.recommendation} />
                  ) : (
                    <DefaultRecommendation data={detail.recommendation} />
                  )
                ) : (
                  <EmptyRow text="추천 결과를 불러올 수 없어요." />
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Fade>
      )}
    </div>
  );
};

/* ───────────────────── 프리미티브 / UI ───────────────────── */

function Chip({ text }: { text: any }) {
  const str = toText(text);
  return (
    <span className="inline-flex items-center rounded-full bg-zinc-100/80 text-zinc-700 px-2.5 py-1 text-xs font-medium ring-1 ring-zinc-200">
      {str}
    </span>
  );
}

/** 카드형 선호 항목 */
function PrefCard(label: string, value: any, fallbackIcon?: string) {
  const iconRaw = pickIcon(value, fallbackIcon);

  const renderValue = () => {
    if (value == null) return <span className="text-zinc-400 text-sm">-</span>;

    if (Array.isArray(value)) {
      const items = value
        .map((v: any) => (v && typeof v === "object" && "value" in v ? (v as any).value : v))
        .map(toText)
        .filter(Boolean);

      if (!items.length) return <span className="text-zinc-400 text-sm">-</span>;
      if (items.length === 1) return <div className="text-zinc-800 font-semibold">{items[0]}</div>;

      return (
        <div className="flex flex-wrap gap-1.5">
          {items.map((t, i) => (
            <Chip key={`${t}-${i}`} text={t} />
          ))}
        </div>
      );
    }

    if (typeof value === "object") {
      const main =
        (value as any).value ??
        (value as any).label ??
        (value as any).name ??
        (value as any).text ??
        value;
      return <div className="text-zinc-800 font-semibold">{toText(main)}</div>;
    }

    return <div className="text-zinc-800 font-semibold">{toText(value)}</div>;
  };

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/80 px-4 py-3 ring-1 ring-zinc-200 hover:ring-violet-200 hover:shadow-sm transition">
      <div
        className="grid place-items-center h-9 w-9 rounded-xl bg-gradient-to-br from-violet-100 to-fuchsia-100 ring-1 ring-violet-200/50
                   text-[18px] leading-none font-normal select-none text-violet-700"
        aria-hidden="true"
      >
        {isReactNodeIcon(iconRaw) ? iconRaw : <span>{String(iconRaw)}</span>}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold tracking-wide text-zinc-400">{label}</div>
        <div className="mt-0.5">{renderValue()}</div>
      </div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="grid place-items-center h-32 rounded-2xl bg-white/70 ring-1 ring-zinc-200 text-zinc-500 text-sm">
      {text}
    </div>
  );
}

/* ───── 추천 카드: 다양한 백엔드 스키마를 유연하게 파싱 ───── */
function getTitleFromReco(r: any) {
  if (!r) return "추천 지역";
  if (typeof r === "string") return r;

  const title =
    (r.city && r.country && `${r.city}, ${r.country}`) ||
    r.city ||
    r.destination ||
    r.name ||
    r.title ||
    r.place ||
    r.region ||
    r.area ||
    r.location ||
    r.country;

  return title || "추천 지역";
}
function getSummaryFromReco(r: any) {
  return r?.summary ?? r?.description ?? r?.reason ?? null;
}
function getTagsFromReco(r: any): string[] {
  const arr = r?.highlights ?? r?.tags ?? r?.reasons ?? r?.keywords ?? [];
  return Array.isArray(arr) ? arr.filter(Boolean) : [];
}
function getCreatedAtFromReco(r: any) {
  return r?.createdAt ?? r?.timestamp ?? r?.date ?? null;
}
function DefaultRecommendation({ data }: { data: any }) {
  const isArr = Array.isArray(data);
  const first = isArr ? data[0] : data;

  const title = getTitleFromReco(first);
  const summary = getSummaryFromReco(first);
  const tags = getTagsFromReco(first);
  const createdAt = getCreatedAtFromReco(first);

  return (
    <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-4 sm:p-5 shadow-sm">
      <div className="flex items-center gap-2 text-zinc-700 font-semibold">
        <MapPin className="h-4 w-4 text-violet-600" />
        {title}
      </div>

      {summary && (
        <p className="mt-2 text-sm text-zinc-600 leading-6 whitespace-pre-line">
          {summary}
        </p>
      )}

      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.slice(0, 6).map((t, i) => (
            <Chip key={`${t}-${i}`} text={t} />
          ))}
        </div>
      )}

      {createdAt && (
        <div className="mt-3 inline-flex items-center gap-1 text-xs text-zinc-400">
          <CalendarClock className="h-3.5 w-3.5" />
          {new Date(createdAt).toLocaleString()}
        </div>
      )}

      {isArr && data.length > 1 && (
        <div className="mt-4 grid gap-1.5">
          {data.slice(1, 4).map((r: any, i: number) => (
            <div key={i} className="text-sm text-zinc-600">
              • {getTitleFromReco(r)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { HistorySection };
export default HistorySection;
