import { create } from 'zustand'

interface UiState {
  /** 지역 지오메트리를 굽는 중 — Canvas 안(RegionMeshes)에서 켜고 DOM 스피너가 읽는다 */
  regionBaking: boolean
  setRegionBaking: (v: boolean) => void
}

/**
 * Canvas 내부(three.js)와 DOM 오버레이가 상태를 주고받기 위한 최소 UI 스토어.
 * 렌더 트리가 갈라져 있어 props 로는 못 넘긴다.
 */
export const useUiStore = create<UiState>((set) => ({
  regionBaking: false,
  setRegionBaking: (v) => set({ regionBaking: v }),
}))
