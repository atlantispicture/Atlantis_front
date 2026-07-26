import { create } from 'zustand'
import type { CountryCode, Visit } from '@/types'

export interface SelectedCountry {
  code: CountryCode
  name: string
  centroid: [number, number] // [lng, lat]
}

interface VisitState {
  /** 화면 단계: 지구본 홈 ↔ 나라 상세(모핑 도착) */
  phase: 'globe' | 'country'
  /** 선택(포커스)된 나라 */
  selected: SelectedCountry | null
  /** countryCode → Visit */
  visits: Record<CountryCode, Visit>

  select: (c: SelectedCountry) => void
  back: () => void
  toggleVisited: (code: CountryCode) => void
  isVisited: (code: CountryCode) => boolean
  visitedCount: () => number
}

/**
 * Phase 0: 메모리 상태만. Phase 2에서 SQLite 미러링,
 * Phase 4에서 서버 동기화(sync_status)로 확장.
 */
export const useVisitStore = create<VisitState>((set, get) => ({
  phase: 'globe',
  selected: null,
  visits: {},

  select: (c) => set({ selected: c, phase: 'country' }),

  back: () => set({ phase: 'globe' }),

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
}))
