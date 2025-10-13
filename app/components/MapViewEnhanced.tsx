// app/components/MapViewEnhanced.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

type Place = { id: string; name: string; lat: number; lng: number; category?: string };
type DayPath = { dateOffset?: number; stops?: Array<{ lat: number; lng: number }> };

const DAY_COLORS = ["#6C3DF4", "#3B82F6", "#06B6D4", "#10B981", "#F59E0B"]; // 1~5일차

export default function MapViewEnhanced({
                                          city,
                                          country,
                                          allPlaces = [],
                                          days = [],
                                        }: {
  city: string;
  country: string;
  allPlaces?: Place[];
  days?: DayPath[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [activeDay, setActiveDay] = useState<number | "all">("all");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const places = useMemo(
    () =>
      allPlaces.map((p, i) => ({
        ...p,
        idx: i + 1,
        dayIdx:
          days.findIndex((d) =>
            (d.stops || []).some((s) => s.lat === p.lat && s.lng === p.lng)
          ) + 1, // 없으면 0
      })),
    [allPlaces, days]
  );

  useEffect(() => {
    if (!ref.current) return;
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string;

    const map = new mapboxgl.Map({
      container: ref.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [127, 37],
      zoom: 4,
    });
    mapRef.current = map;

    const onLoaded = async () => {
      // 마커 생성
      places.forEach((p) => {
        const el = document.createElement("div");
        el.className = "marker-dot";
        el.style.cssText = `
          background:${DAY_COLORS[(Math.max(1, p.dayIdx) - 1) % DAY_COLORS.length]};
          color:#fff;width:26px;height:26px;border-radius:50%;
          display:flex;align-items:center;justify-content:center;font-weight:700;
          box-shadow:0 6px 18px rgba(0,0,0,.2);font-size:12px;border:2px solid #fff;
          opacity:1; transition:transform .15s, opacity .15s;
          cursor:pointer;
        `;
        el.textContent = String(p.idx);
        el.addEventListener("mouseenter", () => (el.style.transform = "scale(1.1)"));
        el.addEventListener("mouseleave", () => (el.style.transform = "scale(1.0)"));
        el.addEventListener("click", () => {
          setSelectedIdx(p.idx);
          new mapboxgl.Popup({ offset: 12 })
            .setLngLat([p.lng, p.lat])
            .setHTML(`<strong>${p.idx}. ${p.name}</strong>`)
            .addTo(map);
          map.easeTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 13) });
        });

        (el as any).__dayIdx = p.dayIdx || 0; // 필터용
        (el as any).__idx = p.idx;

        new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat([p.lng, p.lat])
          .addTo(map);
      });

      // 경로(일자별 라인)
      days.forEach((d, i) => {
        const coords = (d.stops || []).map((s) => [s.lng, s.lat]) as [number, number][];
        if (coords.length < 2) return;
        const srcId = `route-${i}`;
        map.addSource(srcId, {
          type: "geojson",
          data: { type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: {} },
        });
        map.addLayer({
          id: `${srcId}-line`,
          type: "line",
          source: srcId,
          paint: { "line-width": 4, "line-color": DAY_COLORS[i % DAY_COLORS.length], "line-opacity": 0.9 },
          layout: { "line-join": "round", "line-cap": "round" },
        });
      });

      // 화면 맞추기
      const b = new mapboxgl.LngLatBounds();
      let has = false;
      places.forEach((p) => { b.extend([p.lng, p.lat]); has = true; });
      days.forEach((d) => (d.stops || []).forEach((s) => { b.extend([s.lng, s.lat]); has = true; }));
      if (has) map.fitBounds(b, { padding: 60 });
    };

    if (map.loaded()) onLoaded();
    else map.once("load", onLoaded);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [places, days]);

  // 필터 적용: 마커 DOM 투명도 조절 + 라인 레이어 가시성
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // 마커
    const els = document.querySelectorAll<HTMLDivElement>(".marker-dot");
    els.forEach((el) => {
      const dayIdx = (el as any).__dayIdx as number;
      const visible = activeDay === "all" || dayIdx === activeDay;
      el.style.opacity = visible ? "1" : "0.25";
    });
    // 라인
    days.forEach((_, i) => {
      const id = `route-${i}-line`;
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", activeDay === "all" || i + 1 === activeDay ? "visible" : "none");
      }
    });
  }, [activeDay, days]);

  // 선택 항목 강조
  useEffect(() => {
    const els = document.querySelectorAll<HTMLDivElement>(".marker-dot");
    els.forEach((el) => {
      const idx = (el as any).__idx as number;
      el.style.transform = idx === selectedIdx ? "scale(1.2)" : "scale(1.0)";
      el.style.zIndex = idx === selectedIdx ? "2" : "1";
    });
  }, [selectedIdx]);

  // 리스트 데이터(필터 반영)
  const visibleList = useMemo(
    () => places.filter((p) => activeDay === "all" || p.dayIdx === activeDay),
    [places, activeDay]
  );

  const fitAll = () => {
    const map = mapRef.current;
    if (!map) return;
    const b = new mapboxgl.LngLatBounds();
    let has = false;
    visibleList.forEach((p) => { b.extend([p.lng, p.lat]); has = true; });
    if (has) map.fitBounds(b, { padding: 60 });
  };

  return (
    <div className="mt-5 w-full">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">{city}{country ? `, ${country}` : ""}</span>
        <div className="flex gap-1">
          <button onClick={() => setActiveDay("all")} className={`px-2.5 py-1 text-xs rounded-full border ${activeDay==="all"?"bg-violet-600 text-white border-violet-600":"text-violet-700 border-violet-300"}`}>전체</button>
          {days.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveDay(i + 1)}
              className={`px-2.5 py-1 text-xs rounded-full border`}
              style={{
                background: activeDay === i + 1 ? DAY_COLORS[i % DAY_COLORS.length] : "white",
                color: activeDay === i + 1 ? "#fff" : "#4c1d95",
                borderColor: "#d6bcfa",
              }}
            >
              {i + 1}일차
            </button>
          ))}
        </div>
        <button onClick={fitAll} className="ml-auto px-2.5 py-1 text-xs rounded-md border border-violet-300 text-violet-700">전체보기</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-3">
        <div className="h-72 w-full rounded-2xl overflow-hidden shadow-inner border border-violet-100">
          <div ref={ref} className="h-full w-full" />
        </div>

        {/* 사이드 리스트 */}
        <div className="h-72 overflow-auto rounded-2xl border border-violet-100 bg-white p-3">
          <div className="text-xs text-gray-500 mb-2">지도 포인트</div>
          <ol className="space-y-1">
            {visibleList.map((p) => (
              <li key={p.id || p.idx}
                  className={`flex items-start gap-2 p-2 rounded-md cursor-pointer hover:bg-violet-50 ${selectedIdx===p.idx?"bg-violet-50":""}`}
                  onMouseEnter={() => setSelectedIdx(p.idx)}
                  onMouseLeave={() => setSelectedIdx(null)}
                  onClick={() => {
                    setSelectedIdx(p.idx);
                    mapRef.current?.easeTo({ center: [p.lng, p.lat], zoom: 14 });
                  }}>
                <span
                  className="flex-shrink-0 w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center"
                  style={{ background: DAY_COLORS[(Math.max(1, p.dayIdx) - 1) % DAY_COLORS.length] }}
                >
                  {p.idx}
                </span>
                <div className="text-sm leading-snug">
                  <div className="font-medium text-gray-800">{p.name}</div>
                  {p.category ? <div className="text-[11px] text-gray-500">{p.category}</div> : null}
                </div>
              </li>
            ))}
            {visibleList.length === 0 && (
              <div className="text-xs text-gray-500">표시할 포인트가 없습니다.</div>
            )}
          </ol>
        </div>
      </div>
    </div>
  );
}
