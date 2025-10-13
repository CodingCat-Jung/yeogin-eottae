// app/components/MapView.tsx
import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Place, DayPath, Bounds } from "@/types/map";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string;

type Props = {
  places?: Place[];
  paths?: DayPath[];
  center?: [number, number];          // [lng, lat]
  zoom?: number;
  selectedPlaceId?: string | null;
  onBoundsChange?: (b: Bounds) => void;
  onMarkerClick?: (placeId: string) => void;
};

export default function MapView({
                                  places = [],
                                  paths = [],
                                  center = [0, 20],
                                  zoom = 2,
                                  selectedPlaceId = null,
                                  onBoundsChange,
                                  onMarkerClick,
                                }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Record<string, mapboxgl.Marker>>({});
  const loadedRef = useRef(false);

  // 1) 맵 초기화
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center,
      zoom,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.on("load", () => {
      loadedRef.current = true;

      // 초기 bounds 콜백
      const b = map.getBounds();
      if (!b) return;
      onBoundsChange?.({
        sw: [b.getSouthWest().lat, b.getSouthWest().lng],
        ne: [b.getNorthEast().lat, b.getNorthEast().lng],
      });
    });

    map.on("moveend", () => {
      const b = map.getBounds();
      if (!b) return;
      onBoundsChange?.({
        sw: [b.getSouthWest().lat, b.getSouthWest().lng],
        ne: [b.getNorthEast().lat, b.getNorthEast().lng],
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) 마커 렌더/업데이트
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // 기존 마커 제거
    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};

    places.forEach((p) => {
      const el = document.createElement("div");
      el.className =
        "rounded-full bg-white shadow ring-1 ring-black/10 px-2 py-1 text-sm";
      el.textContent = "📍";

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([p.lng, p.lat])
        .setPopup(new mapboxgl.Popup({ offset: 10 }).setText(p.name))
        .addTo(map);

      el.addEventListener("click", () => onMarkerClick?.(p.id));
      markersRef.current[p.id] = marker;
    });

    // Fit bounds
    if (places.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      places.forEach((p) => bounds.extend([p.lng, p.lat]));
      map.fitBounds(bounds, { padding: 40, duration: 0 });
    }
  }, [places, onMarkerClick]);

  // 3) 선택 마커 강조(팝업 오픈)
  useEffect(() => {
    // 모두 닫고 선택만 열기 (원하면 토글로 바꿔도 됨)
    Object.values(markersRef.current).forEach((m) => m.getPopup()?.remove());
    const marker = selectedPlaceId ? markersRef.current[selectedPlaceId] : null;
    marker?.togglePopup();
  }, [selectedPlaceId]);

  // 4) 경로(폴리라인) 레이어
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;

    // 기존 레이어/소스 제거
    const layers = map.getStyle()?.layers || [];
    layers
      .map((l) => l.id)
      .filter((id) => id.startsWith("day-path-"))
      .forEach((layerId) => {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      });

    Object.keys(map.getStyle()?.sources || {})
      .filter((id) => id.startsWith("day-src-"))
      .forEach((srcId) => {
        if (map.getSource(srcId)) map.removeSource(srcId);
      });

    // 새로 추가
    paths.forEach((p) => {
      const srcId = `day-src-${p.day}`;
      const layerId = `day-path-${p.day}`;

      map.addSource(srcId, {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates: p.coords },
          properties: {},
        },
      });

      map.addLayer({
        id: layerId,
        type: "line",
        source: srcId,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-width": 4,
          "line-color": ["case", ["==", p.day % 2, 0], "#6C3DF4", "#00A8E8"],
          "line-opacity": 0.9,
        },
      });
    });
  }, [paths]);

  return (
    <div
      ref={containerRef}
      className="w-full h-[60vh] rounded-2xl shadow-lg"
      aria-label="mapbox-map"
    />
  );
}
