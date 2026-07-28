import { create } from 'zustand'
import {
  allMemories,
  deleteMemory,
  makeThumbnail,
  putMemory,
  revokeMemoryUrls,
  toView,
  type MemoryRecord,
  type MemoryView,
} from '@/lib/memoryDb'
import { readCapturedAt } from '@/lib/exif'
import { dominantSeason, seasonColor, seasonOf, type Season } from '@/lib/season'

/** 지역 색은 '사용자 지정'이 '계절 자동'을 이긴다. */
export type ColorSource = 'custom' | 'season' | 'none'

interface MemoryState {
  /** 전체 추억 (지역/나라 무관) — 지구본 채색에 다 필요하다 */
  items: MemoryView[]
  loaded: boolean
  uploading: number
  /** regionCode(또는 countryCode) → 직접 지정한 색 */
  customColors: Record<string, string>

  load: () => Promise<void>
  add: (
    files: FileList | File[],
    target: { countryCode: string; regionCode: string | null; placeName: string },
  ) => Promise<void>
  remove: (id: string) => Promise<void>
  setCustomColor: (key: string, color: string | null) => void

  /** 해당 키(지역 또는 나라)의 추억들 */
  itemsOf: (key: string) => MemoryView[]
  /** 지구본에 칠할 색 — 없으면 null (흑백 유지) */
  colorOf: (key: string) => { color: string; source: ColorSource } | null
}

const CUSTOM_KEY = 'atlantis.customColors'

const loadCustom = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  items: [],
  loaded: false,
  uploading: 0,
  customColors: loadCustom(),

  load: async () => {
    if (get().loaded) return
    const recs = await allMemories()
    set({ items: recs.map(toView), loaded: true })
  },

  add: async (files, target) => {
    const list = Array.from(files)
    if (list.length === 0) return
    set((s) => ({ uploading: s.uploading + list.length }))

    for (const file of list) {
      try {
        const isVideo = file.type.startsWith('video/')
        const { at, source } = await readCapturedAt(file)
        const thumb = await makeThumbnail(file)

        const rec: MemoryRecord = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          regionCode: target.regionCode,
          countryCode: target.countryCode,
          placeName: target.placeName,
          kind: isVideo ? 'video' : 'photo',
          mime: file.type,
          fileName: file.name,
          capturedAt: at.getTime(),
          capturedSource: source,
          season: seasonOf(at),
          createdAt: Date.now(),
          file,
          thumb,
        }
        await putMemory(rec)
        set((s) => ({ items: [...s.items, toView(rec)] }))
      } finally {
        set((s) => ({ uploading: s.uploading - 1 }))
      }
    }
  },

  remove: async (id) => {
    await deleteMemory(id)
    set((s) => {
      const gone = s.items.find((i) => i.id === id)
      if (gone) revokeMemoryUrls(gone) // objectURL 누수 방지
      return { items: s.items.filter((i) => i.id !== id) }
    })
  },

  setCustomColor: (key, color) =>
    set((s) => {
      const next = { ...s.customColors }
      if (color) next[key] = color
      else delete next[key]
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(next))
      return { customColors: next }
    }),

  itemsOf: (key) =>
    get().items.filter((i) => (i.regionCode ?? i.countryCode) === key),

  colorOf: (key) => {
    const custom = get().customColors[key]
    if (custom) return { color: custom, source: 'custom' }

    const mine = get().itemsOf(key)
    const season = dominantSeason(
      mine.map((i) => ({ season: i.season as Season, capturedAt: i.capturedAt })),
    )
    return season ? { color: seasonColor(season), source: 'season' } : null
  },
}))
