import { geoCentroid } from 'd3-geo'
import { useEffect, useState } from 'react'
import type { CountryCode } from '@/types'

export interface CountryFeature {
  type: 'Feature'
  properties: Record<string, unknown>
  geometry: { type: string; coordinates: unknown }
}

export interface CountryMeta {
  code: CountryCode
  name: string // 한국어 우선
  nameEn: string // 검색 보조용 영문
  centroid: [number, number] // [lng, lat]
  feature: CountryFeature
}

export type LoadStatus = 'loading' | 'ready' | 'missing' | 'error'

export interface CountriesData {
  status: LoadStatus
  list: CountryMeta[]
  byCode: Map<CountryCode, CountryMeta>
  features: CountryFeature[]
}

const EMPTY: CountriesData = {
  status: 'loading',
  list: [],
  byCode: new Map(),
  features: [],
}

// 모듈 레벨 캐시 — 여러 컴포넌트가 같은 데이터를 공유하고 한 번만 로드.
let cache: CountriesData | null = null
let inflight: Promise<CountriesData> | null = null

const GEO_URL = '/geo/countries-110m.geojson'

/** Natural Earth 속성에서 alpha-3 코드/이름을 견고하게 뽑아낸다. */
function extractCode(props: Record<string, unknown>): string | null {
  const candidates = ['ISO_A3_EH', 'ISO_A3', 'ADM0_A3', 'SOV_A3']
  for (const key of candidates) {
    const val = props[key]
    if (typeof val === 'string' && val !== '-99' && val.length === 3) return val
  }
  return null
}

function pickString(props: Record<string, unknown>, keys: string[], fallback: string): string {
  for (const k of keys) {
    const v = props[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  return fallback
}

async function load(): Promise<CountriesData> {
  let res: Response
  try {
    res = await fetch(GEO_URL)
  } catch {
    return { ...EMPTY, status: 'error' }
  }
  if (res.status === 404) return { ...EMPTY, status: 'missing' }
  if (!res.ok) return { ...EMPTY, status: 'error' }

  const geojson = (await res.json()) as { features: CountryFeature[] }
  const list: CountryMeta[] = []
  const byCode = new Map<CountryCode, CountryMeta>()
  const features: CountryFeature[] = []

  for (const feature of geojson.features) {
    const code = extractCode(feature.properties)
    if (!code) continue
    // 남극은 프로토타입에서 제외 (탭 대상 아님)
    if (code === 'ATA') continue

    const centroid = geoCentroid(feature as never) as [number, number]
    const meta: CountryMeta = {
      code,
      name: pickString(feature.properties, ['NAME_KO', 'ADMIN', 'NAME'], '알 수 없음'),
      nameEn: pickString(feature.properties, ['NAME_EN', 'ADMIN', 'NAME'], code),
      centroid,
      feature,
    }
    list.push(meta)
    byCode.set(code, meta)
    features.push(feature)
  }

  return { status: 'ready', list, byCode, features }
}

export function useCountries(): CountriesData {
  const [data, setData] = useState<CountriesData>(cache ?? EMPTY)

  useEffect(() => {
    if (cache) return
    if (!inflight) inflight = load().then((d) => (cache = d))
    let alive = true
    inflight.then((d) => alive && setData(d))
    return () => {
      alive = false
    }
  }, [])

  return data
}
