export type Place = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category?: string;
};

export type DayPath = {
  day: number; // 1,2,3...
  coords: [number, number][]; // [lng, lat] 배열
};

export type Bounds = {
  sw: [number, number]; // [lat, lng]
  ne: [number, number]; // [lat, lng]
};
