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
import { deleteRemote, pullMemories, pushMemory } from '@/lib/memorySync'
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
  /** 서버의 추억을 받아 로컬에 없는 것만 합친다 */
  syncFromServer: () => Promise<void>
  add: (
    files: FileList | File[],
    target: {
      countryCode: string
      regionCode: string | null
      placeName: string
      /** 함께 간 사람 (선택) */
      participants?: { userId: string | null; displayName: string }[]
    },
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
    void get().syncFromServer()
  },

  /**
   * 서버에 있고 로컬에 없는 추억을 가져와 합친다 (다른 기기에서 올린 것).
   * 이미 올려본 사진은 serverId 로 걸러 중복을 막는다.
   */
  syncFromServer: async () => {
    const pulled = await pullMemories()
    if (pulled.length === 0) return
    set((s) => {
      const known = new Set(s.items.map((i) => i.serverId).filter(Boolean))
      const fresh = pulled
        .filter((p) => !known.has(p.id))
        .map((p) => ({ ...p, serverId: p.id }) as MemoryView)
      return fresh.length ? { items: [...s.items, ...fresh] } : {}
    })
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
          participants: target.participants ?? [],
          file,
          thumb,
        }
        await putMemory(rec)
        set((s) => ({ items: [...s.items, toView(rec)] }))

        // 서버에도 올린다 (로컬 우선 — 실패해도 화면엔 이미 떠 있다)
        const serverId = await pushMemory(rec)
        if (serverId) {
          await putMemory({ ...rec, serverId })
          set((s) => ({
            items: s.items.map((i) => (i.id === rec.id ? { ...i, serverId } : i)),
          }))
        }
      } finally {
        set((s) => ({ uploading: s.uploading - 1 }))
      }
    }
  },

  remove: async (id) => {
    const gone = get().items.find((i) => i.id === id)
    // 서버에도 있으면 함께 지운다 — 안 그러면 다음 동기화에 되살아난다
    if (gone?.serverId) void deleteRemote(gone.serverId)
    if (!gone?.remote) await deleteMemory(id) // 서버 전용 항목은 로컬 DB에 없다
    set((s) => {
      const target = s.items.find((i) => i.id === id)
      if (target) revokeMemoryUrls(target) // objectURL 누수 방지
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
