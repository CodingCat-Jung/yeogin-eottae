// src/utils/surveyDraft.ts
export const SURVEY_KEYS = [
  "travelWith", "actType", "schedule", "budget", "transport",
  "continent", "climate", "density",
  "depart_window", "return_window",
  // 선택적으로 쓰는 값들
  "originAirport", "departDate", "returnDate",
];

const store = sessionStorage; // ← A안: sessionStorage 사용 (원하면 localStorage로 교체)

export const surveyDraft = {
  get(key: string) {
    return store.getItem(key) ?? "";
  },
  set(key: string, value: string) {
    store.setItem(key, value);
  },
  remove(key: string) {
    store.removeItem(key);
  },
  clear() {
    SURVEY_KEYS.forEach((k) => {
      store.removeItem(k);
      localStorage.removeItem(k); // 과거에 localStorage로 저장한 잔여분도 함께 제거
    });
  },
};
