import * as api from './api'
import type { MemoryRecord } from './memoryDb'
import { seasonOfMonth, type Season } from './season'

/**
 * 추억 서버 동기화.
 *
 * 로컬(IndexedDB)이 1차 저장소이고 서버가 백업·공유 경로다. 서버가 없거나
 * 로그인 전이면 아무것도 하지 않고 조용히 로컬 모드로 남는다.
 *
 * 미디어는 인증이 필요한 엔드포인트라 <img src> 로 직접 못 불러온다
 * (헤더를 실을 수 없다). blob 으로 받아 objectURL 로 바꿔 쓴다.
 */

const SEASON_MAP: Record<string, Season> = {
  SPRING: 'spring',
  SUMMER: 'summer',
  AUTUMN: 'autumn',
  WINTER: 'winter',
}

/** 로컬 레코드를 서버에 올린다. 성공하면 서버가 부여한 id. */
export async function pushMemory(rec: MemoryRecord): Promise<string | null> {
  if (!api.isLoggedIn()) return null
  try {
    const res = await api.createMemory(
      {
        countryCode: rec.countryCode,
        regionCode: rec.regionCode,
        regionKind: rec.regionCode
          ? rec.regionCode.includes(':city:')
            ? 'CITY'
            : 'REGION'
          : null,
        takenAt: new Date(rec.capturedAt).toISOString(),
        capturedSource: rec.capturedSource === 'exif' ? 'EXIF' : 'FILE',
      },
      [new File([rec.file], rec.fileName, { type: rec.mime })],
      [rec.thumb],
    )
    return res.id
  } catch {
    return null // 오프라인 등 — 로컬 기록은 그대로 남는다
  }
}

/** 인증 헤더를 실어 미디어를 받아 objectURL 로 바꾼다. */
async function fetchAsUrl(path: string): Promise<string | null> {
  const token = api.getToken()
  if (!token) return null
  try {
    const base = import.meta.env.VITE_API_BASE ?? 'http://localhost:8082'
    const res = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    return URL.createObjectURL(await res.blob())
  } catch {
    return null
  }
}

export interface PulledMemory {
  id: string
  regionCode: string | null
  countryCode: string
  placeName: string
  kind: 'photo' | 'video'
  mime: string
  fileName: string
  capturedAt: number
  capturedSource: 'exif' | 'file'
  season: Season
  createdAt: number
  thumbUrl: string | null
  fileUrl: string
  /** 서버에서 온 항목 — 로컬 삭제와 구분한다 */
  remote: true
}

/**
 * 서버의 추억을 받아온다.
 * 썸네일만 미리 받고 원본은 뷰어에서 열 때 받도록 지연시킨다 — 목록을 열자마자
 * 원본 수십 MB 를 내려받으면 안 된다.
 */
export async function pullMemories(): Promise<PulledMemory[]> {
  if (!api.isLoggedIn()) return []
  let list: api.MemoryDto[]
  try {
    list = await api.listMemories({})
  } catch {
    return []
  }

  const out: PulledMemory[] = []
  for (const m of list) {
    const media = m.media[0]
    if (!media) continue // 미디어 없는 추억은 화면에 띄울 게 없다

    const thumbUrl = media.thumbUrl ? await fetchAsUrl(media.thumbUrl) : null
    const takenAt = m.takenAt ? Date.parse(m.takenAt) : Date.now()

    out.push({
      id: m.id,
      regionCode: m.regionCode,
      countryCode: m.countryCode,
      placeName: m.city ?? m.regionCode ?? m.countryCode,
      kind: media.mediaType === 'VIDEO' ? 'video' : 'photo',
      mime: media.mime ?? 'image/jpeg',
      fileName: `${m.id}`,
      capturedAt: takenAt,
      capturedSource: m.capturedSource === 'EXIF' ? 'exif' : 'file',
      season: (m.season && SEASON_MAP[m.season]) || seasonOfMonth(new Date(takenAt).getMonth() + 1),
      createdAt: takenAt,
      thumbUrl,
      // 원본은 실제로 열 때 받는다 (아래 loadOriginal)
      fileUrl: media.url,
      remote: true,
    })
  }
  return out
}

/** 뷰어에서 원본을 열 때 호출 — 서버 경로를 objectURL 로 바꿔준다. */
export const loadOriginal = (path: string) => fetchAsUrl(path)

export const deleteRemote = async (id: string): Promise<boolean> => {
  if (!api.isLoggedIn()) return false
  try {
    await api.deleteMemory(id)
    return true
  } catch {
    return false
  }
}
