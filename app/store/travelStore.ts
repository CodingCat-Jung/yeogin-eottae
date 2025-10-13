// app/store/travelStore.ts
import { create } from "zustand";

/* ================== 타입 ================== */
export type TravelMateType = "혼자" | "친구" | "연인" | "가족";
export type TransportType  = "public" | "car";
export type ContinentType  = "asia" | "europe" | "america" | "africa" | "oceania" | "anywhere";
export type ClimateType    = "warm" | "fresh" | "snowy";
export type DensityType    = "relaxed" | "moderate" | "active";

// ⏰ step-time 전용(예시)
export type TimeSlot = "dawn" | "morning" | "afternoon" | "evening";

// 시즌 타입(프론트 파생값용, 선택)
export type Season = "SPRING" | "SUMMER" | "FALL" | "WINTER";

interface TravelState {
  nickname: string;
  travelWith: TravelMateType | null;
  actType: string[];
  schedule: string; // ex) "1박2일"
  budget: string;

  transport: TransportType | null;
  continent: ContinentType | null;
  climate: ClimateType | null;
  density: DensityType | null;

  // step-time (없다면 생략 가능)
  departSlot: TimeSlot | null;
  returnSlot: TimeSlot | null;

  // ✅ 월 선택 ("YYYY-MM" | "flexible" | null)
  month: string | null;

  setNickname: (name: string) => void;
  setTravelWith: (type: TravelMateType | null) => void;
  setActType: (styles: string[]) => void;
  setSchedule: (value: string) => void;
  setBudget: (value: string) => void;

  setTransport: (value: TransportType | null) => void;
  setContinent: (value: ContinentType | null) => void;
  setClimate: (value: ClimateType | null) => void;
  setDensity: (value: DensityType | null) => void;

  setDepartSlot: (v: TimeSlot | null) => void;
  setReturnSlot: (v: TimeSlot | null) => void;

  // ✅ 월 setter
  setMonth: (m: string | null) => void;

  reset: () => void;
  resetExceptNickname: () => void;
  resetAll: () => void;
}

/* ================== 로컬스토리지 헬퍼 ================== */
const getJSON = <T,>(k: string, fb: T): T => {
  try {
    const r = localStorage.getItem(k);
    return r ? (JSON.parse(r) as T) : fb;
  } catch {
    return fb;
  }
};

const rawName = localStorage.getItem("nickname");
const initName = rawName && rawName !== "undefined" ? rawName : "";

/* ================== Zustand Store ================== */
export const useTravelStore = create<TravelState>((set) => ({
  nickname: initName,
  travelWith: (localStorage.getItem("travelWith") as TravelMateType) || null,
  actType: getJSON<string[]>("actType", []),
  schedule: localStorage.getItem("schedule") || "",
  budget: localStorage.getItem("budget") || "",

  // ✅ 전부 미선택(null)로 시작
  transport: (localStorage.getItem("transport") as TransportType) || null,
  continent: (localStorage.getItem("continent") as ContinentType) || null,
  climate: (localStorage.getItem("climate") as ClimateType) || null,
  density: (localStorage.getItem("density") as DensityType) || null,

  // ✅ step-time도 미선택(null)
  departSlot: (localStorage.getItem("departSlot") as TimeSlot) || null,
  returnSlot: (localStorage.getItem("returnSlot") as TimeSlot) || null,

  // ✅ 월 초기값
  month: localStorage.getItem("month") || null,

  setNickname: (name) => {
    const safe = name.trim();
    if (safe) localStorage.setItem("nickname", safe);
    else localStorage.removeItem("nickname");
    set({ nickname: safe });
  },

  setTravelWith: (type) => {
    if (type) localStorage.setItem("travelWith", type);
    else localStorage.removeItem("travelWith");
    set({ travelWith: type });
  },

  setActType: (styles) => {
    localStorage.setItem("actType", JSON.stringify(styles));
    set({ actType: styles });
  },

  setSchedule: (value) => {
    if (value) localStorage.setItem("schedule", value);
    else localStorage.removeItem("schedule");
    set({ schedule: value });
  },

  setBudget: (value) => {
    if (value) localStorage.setItem("budget", value);
    else localStorage.removeItem("budget");
    set({ budget: value });
  },

  // ✅ null 허용 세터들
  setTransport: (value) => {
    if (value) localStorage.setItem("transport", value);
    else localStorage.removeItem("transport");
    set({ transport: value });
  },

  setContinent: (value) => {
    if (value) localStorage.setItem("continent", value);
    else localStorage.removeItem("continent");
    set({ continent: value });
  },

  setClimate: (value) => {
    if (value) localStorage.setItem("climate", value);
    else localStorage.removeItem("climate");
    set({ climate: value });
  },

  setDensity: (value) => {
    if (value) localStorage.setItem("density", value);
    else localStorage.removeItem("density");
    set({ density: value });
  },

  setDepartSlot: (v) => {
    if (v) localStorage.setItem("departSlot", v);
    else localStorage.removeItem("departSlot");
    set({ departSlot: v });
  },

  setReturnSlot: (v) => {
    if (v) localStorage.setItem("returnSlot", v);
    else localStorage.removeItem("returnSlot");
    set({ returnSlot: v });
  },

  // ✅ 월 setter
  setMonth: (m) => {
    if (m) localStorage.setItem("month", m);
    else localStorage.removeItem("month");
    set({ month: m });
  },

  // 전체 초기화
  reset: () => {
    [
      "nickname","travelWith","actType","schedule","budget",
      "transport","continent","climate","density",
      "departSlot","returnSlot","month",
    ].forEach((k) => localStorage.removeItem(k));

    set({
      nickname: "",
      travelWith: null,
      actType: [],
      schedule: "",
      budget: "",
      transport: null,
      continent: null,
      climate: null,
      density: null,
      departSlot: null,
      returnSlot: null,
      month: null,
    });
  },

  // 닉네임만 유지하고 나머지 리셋
  resetExceptNickname: () => {
    [
      "travelWith","actType","schedule","budget",
      "transport","continent","climate","density",
      "departSlot","returnSlot","month",
    ].forEach((k) => localStorage.removeItem(k));

    set((state) => ({
      nickname: state.nickname,
      travelWith: null,
      actType: [],
      schedule: "",
      budget: "",
      transport: null,
      continent: null,
      climate: null,
      density: null,
      departSlot: null,
      returnSlot: null,
      month: null,
    }));
  },

  // 모든 것 삭제 (주의: 다른 키도 날아갈 수 있음)
  resetAll: () => {
    localStorage.clear();
    set({
      nickname: "",
      travelWith: null,
      actType: [],
      schedule: "",
      budget: "",
      transport: null,
      continent: null,
      climate: null,
      density: null,
      departSlot: null,
      returnSlot: null,
      month: null,
    });
  },
}));

/* ================== 월 파생 유틸 (요청 바디용) ================== */
// "YYYY-MM" | "MM" | "flexible" | null → 1~12 | null
export const getTravelMonthInt = (monthStr: string | null): number | null => {
  if (!monthStr || monthStr === "flexible") return null;
  const mm = (monthStr.includes("-") ? monthStr.split("-")[1] : monthStr).padStart(2, "0");
  const n = Number(mm);
  return n >= 1 && n <= 12 ? n : null;
};

// 1~12 → 시즌 문자열 | null
export const monthToSeason = (m: number | null): Season | null => {
  if (!m) return null;
  if ([3, 4, 5].includes(m))  return "SPRING";
  if ([6, 7, 8].includes(m))  return "SUMMER";
  if ([9, 10, 11].includes(m))return "FALL";
  return "WINTER"; // 12, 1, 2
};
