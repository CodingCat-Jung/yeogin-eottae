// app/store/travelStore.ts

import { create } from 'zustand';

// 타입 정의
export type TravelMateType = '혼자' | '친구' | '연인' | '가족';
export type TransportType = 'public' | 'car';
export type ContinentType = 'asia' | 'europe' | 'america' | 'africa' | 'oceania' | 'anywhere';
export type ClimateType = 'warm' | 'fresh' | 'snowy';
export type DensityType = 'relaxed' | 'moderate' | 'active';

interface TravelState {
  nickname: string;
  travelWith: TravelMateType | null;
  actType: string[];
  schedule: string;
  budget: string;
  transport: TransportType;
  continent: ContinentType;
  climate: ClimateType;
  density: DensityType;

  // Setter
  setNickname: (name: string) => void;
  setTravelWith: (type: TravelMateType) => void;
  setActType: (styles: string[]) => void;
  setSchedule: (value: string) => void;
  setBudget: (value: string) => void;
  setTransport: (value: TransportType) => void;
  setContinent: (value: ContinentType) => void;
  setClimate: (value: ClimateType) => void;
  setDensity: (value: DensityType) => void;

  // Reset 함수들
  reset: () => void;
  resetExceptNickname: () => void;
  resetAll: () => void;
}

// nickname은 초기화 시 예외 처리
const rawName = localStorage.getItem('nickname');
const initName = rawName && rawName !== 'undefined' ? rawName : '';

export const useTravelStore = create<TravelState>((set) => ({
  nickname: initName,
  travelWith: (localStorage.getItem('travelWith') as TravelMateType) || null,
  actType: (() => {
    try {
      return JSON.parse(localStorage.getItem('actType') || '[]');
    } catch {
      return [];
    }
  })(),
  schedule: localStorage.getItem('schedule') || '',
  budget: localStorage.getItem('budget') || '',
  transport: (localStorage.getItem('transport') as TransportType) || 'public',
  continent: (localStorage.getItem('continent') as ContinentType) || 'anywhere',
  climate: (localStorage.getItem('climate') as ClimateType) || 'warm',
  density: (localStorage.getItem('density') as DensityType) || 'moderate',

  // Setter 구현
  setNickname: (name) => {
    const safe = name.trim();
    if (safe) {
      localStorage.setItem('nickname', safe);
    } else {
      localStorage.removeItem('nickname');
    }
    set({ nickname: safe });
  },
  setTravelWith: (type) => {
    localStorage.setItem('travelWith', type);
    set({ travelWith: type });
  },
  setActType: (styles) => {
    localStorage.setItem('actType', JSON.stringify(styles));
    set({ actType: styles });
  },
  setSchedule: (value) => {
    localStorage.setItem('schedule', value);
    set({ schedule: value });
  },
  setBudget: (value) => {
    localStorage.setItem('budget', value);
    set({ budget: value });
  },
  setTransport: (value) => {
    localStorage.setItem('transport', value);
    set({ transport: value });
  },
  setContinent: (value) => {
    localStorage.setItem('continent', value);
    set({ continent: value });
  },
  setClimate: (value) => {
    localStorage.setItem('climate', value);
    set({ climate: value });
  },
  setDensity: (value) => {
    localStorage.setItem('density', value);
    set({ density: value });
  },

  // 모든 데이터 초기화
  reset: () => {
    localStorage.removeItem('nickname');
    localStorage.removeItem('travelWith');
    localStorage.removeItem('actType');
    localStorage.removeItem('schedule');
    localStorage.removeItem('budget');
    localStorage.removeItem('transport');
    localStorage.removeItem('continent');
    localStorage.removeItem('climate');
    localStorage.removeItem('density');

    set({
      nickname: '',
      travelWith: null,
      actType: [],
      schedule: '',
      budget: '',
      transport: 'public',
      continent: 'anywhere',
      climate: 'warm',
      density: 'moderate',
    });
  },

  // 닉네임만 유지한 채 초기화
  resetExceptNickname: () => {
    localStorage.removeItem('travelWith');
    localStorage.removeItem('actType');
    localStorage.removeItem('schedule');
    localStorage.removeItem('budget');
    localStorage.removeItem('transport');
    localStorage.removeItem('continent');
    localStorage.removeItem('climate');
    localStorage.removeItem('density');

    set((state) => ({
      nickname: state.nickname, // 유지
      travelWith: null,
      actType: [],
      schedule: '',
      budget: '',
      transport: 'public',
      continent: 'anywhere',
      climate: 'warm',
      density: 'moderate',
    }));
  },

  // 모든 것 완전 초기화 (로컬스토리지 전체 삭제)
  resetAll: () => {
    localStorage.clear();
    set({
      nickname: '',
      travelWith: null,
      actType: [],
      schedule: '',
      budget: '',
      transport: 'public',
      continent: 'anywhere',
      climate: 'warm',
      density: 'moderate',
    });
  },
}));
