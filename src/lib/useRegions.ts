import { useEffect, useState } from 'react'
import { cacheRegion, cachedRegion } from './geoCache'
import type { CountryCode, RegionCode } from '@/types'

/** 행정구역 (admin-1) — 오사카부, 강원도 등. 경계 폴리곤 보유. */
export interface Region {
  code: RegionCode // ISO 3166-2 (예: "JP-27")
  name: string // 한국어
  nameEn: string
  lng: number
  lat: number
  geometry: { type: string; coordinates: unknown }
}

/** 도시 (populated place) — 오사카시, 교토시 등. 점 데이터. */
export interface City {
  name: string // 한국어
  nameEn: string
  lng: number
  lat: number
  pop: number
  /** 소속 행정구역 영문명 — Region.nameEn 과 매칭해 계층을 잇는다. */
  adm1: string | null
}

export interface RegionData {
  status: 'idle' | 'loading' | 'ready' | 'missing' | 'error'
  regions: Region[]
  cities: City[]
}

const EMPTY: RegionData = { status: 'idle', regions: [], cities: [] }

// 나라별 캐시 — 같은 나라를 다시 열어도 재요청하지 않는다.
const cache = new Map<CountryCode, RegionData>()
const inflight = new Map<CountryCode, Promise<RegionData>>()

async function load(code: CountryCode): Promise<RegionData> {
  let res: Response
  try {
    // 영구 캐시(Cache Storage) 우선 — 두 번째부터는 네트워크를 타지 않는다.
    const hit = await cachedRegion(code)
    if (hit) {
      const data = (await hit.json()) as { regions: Region[]; cities: City[] }
      return { status: 'ready', regions: data.regions ?? [], cities: data.cities ?? [] }
    }
    res = await fetch(`/geo/regions/${code}.json`)
  } catch {
    return { ...EMPTY, status: 'error' }
  }
  // 행정구역 데이터가 없는 나라(서사하라·팔레스타인 등)도 정상 상황으로 다룬다.
  if (res.status === 404) return { ...EMPTY, status: 'missing' }
  if (!res.ok) return { ...EMPTY, status: 'error' }

  // 개발 서버(Vite)는 없는 파일에 404 대신 index.html 을 200 으로 돌려준다.
  // 그대로 json() 을 부르면 예외가 나고 상태가 'loading' 에 영원히 갇힌다.
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('json')) return { ...EMPTY, status: 'missing' }

  try {
    // 다음 실행에서도 쓰도록 사본을 캐시에 넣는다 (본문은 한 번만 읽을 수 있어 clone).
    void cacheRegion(code, res.clone())
    const data = (await res.json()) as { regions: Region[]; cities: City[] }
    return { status: 'ready', regions: data.regions ?? [], cities: data.cities ?? [] }
  } catch {
    return { ...EMPTY, status: 'error' }
  }
}

/**
 * 선택한 나라의 행정구역·도시를 지연 로딩한다.
 * 전체 admin-1 원본은 40MB라 통째로 못 받고, 나라 단위(평균 86KB)로 쪼갠 파일을 쓴다.
 */
export function useRegions(countryCode: CountryCode | null | undefined): RegionData {
  const [data, setData] = useState<RegionData>(() =>
    countryCode ? (cache.get(countryCode) ?? EMPTY) : EMPTY,
  )

  useEffect(() => {
    if (!countryCode) {
      setData(EMPTY)
      return
    }
    const cached = cache.get(countryCode)
    if (cached) {
      setData(cached)
      return
    }

    setData({ ...EMPTY, status: 'loading' })
    let pending = inflight.get(countryCode)
    if (!pending) {
      pending = load(countryCode)
        // 예상 못 한 예외로 상태가 'loading' 에 갇히지 않도록 마지막 방어선
        .catch(() => ({ ...EMPTY, status: 'error' }) as RegionData)
        .then((d) => {
          cache.set(countryCode, d)
          inflight.delete(countryCode)
          return d
        })
      inflight.set(countryCode, pending)
    }

    let alive = true
    pending.then((d) => alive && setData(d))
    return () => {
      alive = false
    }
  }, [countryCode])

  return data
}
