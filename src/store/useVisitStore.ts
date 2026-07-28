import { create } from 'zustand'
import * as api from '@/lib/api'
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

  /** 서버에 저장된 방문 기록을 받아와 로컬에 반영한다 (로그인 직후) */
  pullFromServer: () => Promise<void>
}

/**
 * 로컬 우선(local-first) 저장.
 * 화면은 즉시 바꾸고 서버 반영은 뒤에서 처리한다 — 서버가 꺼져 있어도 앱은 돌아야 한다.
 * 서버가 돌려준 값이 로컬과 다르면(다른 기기에서 이미 바꾼 경우) 서버 쪽을 정답으로 삼는다.
 */
function pushVisit(code: CountryCode, expected: boolean) {
  if (!api.isLoggedIn()) return
  api
    .toggleVisit(code)
    .then((res) => {
      if (res.visited !== expected) {
        useVisitStore.setState((s) => ({
          visits: { ...s.visits, [code]: { ...s.visits[code], visited: res.visited } },
        }))
      }
    })
    .catch(() => {
      /* 오프라인 등 — 로컬 값은 유지한다 */
    })
}

function pushRegionVisit(r: SelectedRegion, expected: boolean) {
  if (!api.isLoggedIn()) return
  api
    .toggleRegionVisit(r.code, {
      countryCode: r.countryCode,
      regionName: r.name,
      kind: r.kind === 'city' ? 'CITY' : 'REGION',
    })
    .then((res) => {
      if (res.visited !== expected) {
        useVisitStore.setState((s) => ({
          regionVisits: {
            ...s.regionVisits,
            [r.code]: { ...s.regionVisits[r.code], visited: res.visited },
          },
        }))
      }
    })
    .catch(() => {})
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
      const nowVisited = !prev?.visited
      pushVisit(code, nowVisited)
      const next: Visit = {
        countryCode: code,
        visited: nowVisited,
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
      pushRegionVisit(r, nowVisited)
      const next: RegionVisit = {
        regionCode: r.code,
        regionName: r.name,
        countryCode: r.countryCode,
        kind: r.kind,
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

  pullFromServer: async () => {
    if (!api.isLoggedIn()) return
    try {
      const [visits, regions] = await Promise.all([api.listVisits(), api.listRegionVisits()])

      const nextVisits: Record<CountryCode, Visit> = {}
      for (const v of visits) {
        nextVisits[v.countryCode] = {
          countryCode: v.countryCode,
          visited: v.visited,
          visitedYm: v.visitedYm ?? undefined,
          companions: v.companions ?? undefined,
          note: v.note ?? undefined,
          color: v.color ?? undefined,
          scope: 'private',
          updatedAt: Date.now(),
        }
      }

      const nextRegions: Record<RegionCode, RegionVisit> = {}
      for (const r of regions) {
        nextRegions[r.regionCode] = {
          regionCode: r.regionCode,
          regionName: r.regionName,
          countryCode: r.countryCode,
          kind: r.kind === 'CITY' ? 'city' : 'region',
          visited: r.visited,
          visitedYm: r.visitedYm ?? undefined,
          note: r.note ?? undefined,
          scope: 'private',
          updatedAt: Date.now(),
        }
      }

      // 서버를 정답으로 삼는다 — 여러 기기에서 쓰면 로컬 병합은 충돌이 복잡해진다.
      set({ visits: nextVisits, regionVisits: nextRegions })
    } catch {
      /* 서버가 없으면 로컬 상태 그대로 */
    }
  },
}))
