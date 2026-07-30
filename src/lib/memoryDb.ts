import type { Season } from './season'

/**
 * 추억(사진·영상) 로컬 저장소.
 *
 * Phase 0 은 서버 인증이 없어 브라우저에 직접 담는다. 원본 파일은 Blob 으로
 * IndexedDB 에 넣고(용량이 커 localStorage 로는 불가), 화면에는 썸네일만 띄운다.
 * Phase 4 에서 서버 동기화로 교체할 때 이 모듈만 갈아끼우면 되도록
 * 바깥에는 Blob 이 아니라 순수 데이터/URL 만 노출한다.
 */

const DB_NAME = 'atlantis'
const DB_VERSION = 1
const STORE = 'memories'

export interface MemoryRecord {
  id: string
  /** 지역 코드 (행정구역 ISO 3166-2 또는 '{ISO3}:city:{이름}'). 나라 전체면 null */
  regionCode: string | null
  countryCode: string
  /** 표시용 장소 이름 (지역명 또는 나라명) — 목록에서 코드 대신 보여준다 */
  placeName: string
  kind: 'photo' | 'video'
  mime: string
  fileName: string
  /** 촬영 일시 (EXIF 우선, 없으면 파일 수정시각) */
  capturedAt: number
  capturedSource: 'exif' | 'file'
  season: Season
  createdAt: number
  /** 서버에 올렸으면 서버가 부여한 id — 같은 사진이 서버에서 또 내려오는 걸 막는다 */
  serverId?: string
  file: Blob
  thumb: Blob | null
}

/** 화면에서 쓰는 형태 — Blob 대신 objectURL */
export interface MemoryView extends Omit<MemoryRecord, 'file' | 'thumb'> {
  thumbUrl: string | null
  fileUrl: string
  /** 서버에만 있는 항목 — 원본은 열 때 받아야 한다 (fileUrl 이 서버 경로) */
  remote?: boolean
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('byCountry', 'countryCode')
        store.createIndex('byRegion', 'regionCode')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = run(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export const putMemory = (rec: MemoryRecord) => tx('readwrite', (s) => s.put(rec))

export const deleteMemory = (id: string) => tx('readwrite', (s) => s.delete(id))

export const allMemories = () => tx<MemoryRecord[]>('readonly', (s) => s.getAll())

/** 나라 단위로 모아 읽는다 (지역별 분류는 호출부에서). */
export const memoriesOfCountry = (countryCode: string) =>
  tx<MemoryRecord[]>('readonly', (s) => s.index('byCountry').getAll(countryCode))

/** Blob → objectURL 로 바꿔 화면용 형태로. 해제는 revokeMemoryUrls 로. */
export function toView(rec: MemoryRecord): MemoryView {
  const { file, thumb, ...rest } = rec
  return {
    ...rest,
    fileUrl: URL.createObjectURL(file),
    thumbUrl: thumb ? URL.createObjectURL(thumb) : null,
  }
}

export function revokeMemoryUrls(v: MemoryView) {
  URL.revokeObjectURL(v.fileUrl)
  if (v.thumbUrl) URL.revokeObjectURL(v.thumbUrl)
}

/**
 * 썸네일 생성 — 목록에 원본(수 MB)을 그대로 띄우면 메모리가 터진다.
 * 사진은 canvas 로, 영상은 첫 프레임을 잡아 줄인다.
 */
export async function makeThumbnail(file: File, max = 320): Promise<Blob | null> {
  try {
    const bitmapSource = file.type.startsWith('video/')
      ? await firstVideoFrame(file)
      : await createImageBitmap(file)
    if (!bitmapSource) return null

    const { width, height } = bitmapSource
    const scale = Math.min(1, max / Math.max(width, height))
    const w = Math.round(width * scale)
    const h = Math.round(height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')?.drawImage(bitmapSource, 0, 0, w, h)
    if ('close' in bitmapSource) bitmapSource.close()

    return await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8),
    )
  } catch {
    return null // 썸네일 실패해도 업로드 자체는 살린다
  }
}

/** 영상 첫 프레임을 ImageBitmap 으로 */
function firstVideoFrame(file: File): Promise<ImageBitmap | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'

    const cleanup = () => URL.revokeObjectURL(url)
    const fail = () => {
      cleanup()
      resolve(null)
    }

    video.onloadeddata = async () => {
      try {
        // 0초는 검은 화면인 경우가 많아 살짝 뒤로
        video.currentTime = Math.min(0.1, video.duration || 0)
        await new Promise((r) => (video.onseeked = r))
        const bmp = await createImageBitmap(video)
        cleanup()
        resolve(bmp)
      } catch {
        fail()
      }
    }
    video.onerror = fail
    video.src = url
  })
}
