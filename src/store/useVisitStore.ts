import { create } from 'zustand'
import type { CountryCode, RegionCode, RegionVisit, Visit } from '@/types'

export interface SelectedCountry {
  code: CountryCode
  name: string
  centroid: [number, number] // [lng, lat]
}

export interface SelectedRegion {
  code: RegionCode
  name: string
  countryCode: CountryCode
  centroid: [number, number] // [lng, lat]
  /** 도시를 고른 경우 — 행정구역보다 더 깊이 줌인한다. */
  kind: 'region' | 'city'
}

interface VisitState {
  /** 화면 단계: 지구본 홈 ↔ 나라 상세(모핑 도착) */
  phase: 'globe' | 'country'
  /** 선택(포커스)된 나라 */
  selected: SelectedCountry | null
  /** 나라 안에서 선택된 행정구역/도시 (없으면 나라 전체) */
  selectedRegion: SelectedRegion | null
  /** countryCode → Visit */
  visits: Record<CountryCode, Visit>
  /** regionCode → RegionVisit */
  regionVisits: Record<RegionCode, RegionVisit>

  select: (c: SelectedCountry) => void
  selectRegion: (r: SelectedRegion | null) => void
  back: () => void
  toggleVisited: (code: CountryCode) => void
  isVisited: (code: CountryCode) => boolean
  visitedCount: () => number

  toggleRegionVisited: (r: SelectedRegion) => void
  isRegionVisited: (code: RegionCode) => boolean
  /** 해당 나라에서 방문 표시한 지역 수 */
  regionVisitedCount: (countryCode: CountryCode) => number
}

/**
 * Phase 0: 메모리 상태만. Phase 2에서 SQLite 미러링,
 * Phase 4에서 서버 동기화(sync_status)로 확장.
 */
export const useVisitStore = create<VisitState>((set, get) => ({
  phase: 'globe',
  selected: null,
  selectedRegion: null,
  visits: {},
  regionVisits: {},

  // 나라를 바꾸면 이전 나라의 지역 선택은 의미가 없으므로 함께 비운다.
  select: (c) => set({ selected: c, selectedRegion: null, phase: 'country' }),

  selectRegion: (r) => set({ selectedRegion: r }),

  back: () => set({ phase: 'globe', selectedRegion: null }),

  toggleVisited: (code) =>
    set((state) => {
      const prev = state.visits[code]
      const next: Visit = {
        countryCode: code,
        visited: !prev?.visited,
        visitedYm: prev?.visitedYm,
        companions: prev?.companions,
        note: prev?.note,
        color: prev?.color,
        scope: prev?.scope ?? 'private',
        updatedAt: Date.now(),
      }
      return { visits: { ...state.visits, [code]: next } }
    }),

  isVisited: (code) => !!get().visits[code]?.visited,

  visitedCount: () => Object.values(get().visits).filter((v) => v.visited).length,

  toggleRegionVisited: (r) =>
    set((state) => {
      const prev = state.regionVisits[r.code]
      const nowVisited = !prev?.visited
      const next: RegionVisit = {
        regionCode: r.code,
        countryCode: r.countryCode,
        visited: nowVisited,
        visitedYm: prev?.visitedYm,
        note: prev?.note,
        scope: prev?.scope ?? 'private',
        updatedAt: Date.now(),
      }

      // 지역을 방문 표시하면 그 나라도 자동으로 방문 처리 (하위가 상위를 함의).
      // 기존 메타(시기·동행·색)는 보존하고 visited 만 올린다.
      let visits = state.visits
      const country = visits[r.countryCode]
      if (nowVisited && !country?.visited) {
        visits = {
          ...visits,
          [r.countryCode]: country
            ? { ...country, visited: true, updatedAt: Date.now() }
            : {
                countryCode: r.countryCode,
                visited: true,
                scope: 'private',
                updatedAt: Date.now(),
              },
        }
      }

      return { regionVisits: { ...state.regionVisits, [r.code]: next }, visits }
    }),

  isRegionVisited: (code) => !!get().regionVisits[code]?.visited,

  regionVisitedCount: (countryCode) =>
    Object.values(get().regionVisits).filter((r) => r.visited && r.countryCode === countryCode)
      .length,
}))
