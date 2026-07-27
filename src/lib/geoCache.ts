import type { CountryCode } from '@/types'

/**
 * 지역 데이터 영구 캐시.
 *
 * 나라별 파일은 한 번 받으면 바뀌지 않으므로 Cache Storage 에 넣어 두고
 * 다음 실행부터는 네트워크를 타지 않는다(오프라인에서도 열린다).
 * 메모리 캐시(useRegions)는 세션 한정이라 이 계층이 따로 필요하다.
 */

const CACHE_NAME = 'atlantis-geo-v1'
const PREFETCHED_KEY = 'atlantis.prefetched'

export const regionUrl = (code: CountryCode) => `/geo/regions/${code}.json`

/** 셀룰러에서 미리 경고할 만큼 큰 나라 (1MB 초과) */
export const HEAVY_COUNTRIES = new Set(['RUS', 'CAN'])

const supported = () => typeof caches !== 'undefined'

/** 캐시에 있으면 Response 를, 없으면 null. */
export async function cachedRegion(code: CountryCode): Promise<Response | null> {
  if (!supported()) return null
  try {
    const cache = await caches.open(CACHE_NAME)
    return (await cache.match(regionUrl(code))) ?? null
  } catch {
    return null
  }
}

/** 받아온 응답을 캐시에 넣는다 (실패해도 무시 — 캐시는 부가 기능). */
export async function cacheRegion(code: CountryCode, res: Response): Promise<void> {
  if (!supported()) return
  try {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(regionUrl(code), res)
  } catch {
    /* 용량 초과 등 — 무시하고 다음에 다시 받는다 */
  }
}

/** 이미 캐시된 나라 코드들 */
export async function cachedCountries(): Promise<Set<CountryCode>> {
  if (!supported()) return new Set()
  try {
    const cache = await caches.open(CACHE_NAME)
    const keys = await cache.keys()
    const out = new Set<CountryCode>()
    for (const req of keys) {
      const m = req.url.match(/\/geo\/regions\/([A-Z]{3})\.json$/i)
      if (m) out.add(m[1].toUpperCase())
    }
    return out
  } catch {
    return new Set()
  }
}

/**
 * 나라 하나를 받아서 캐시에 넣는다. 이미 있으면 건너뛴다.
 * 반환값은 '실제로 새로 받았는지'.
 */
export async function prefetchCountry(code: CountryCode): Promise<boolean> {
  if (await cachedRegion(code)) return false
  try {
    const res = await fetch(regionUrl(code))
    // 없는 나라에 개발 서버가 HTML 을 200 으로 주는 경우를 걸러낸다
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return false
    await cacheRegion(code, res.clone())
    return true
  } catch {
    return false
  }
}

/** 여러 나라를 순서대로 받으며 진행률을 알린다. */
export async function prefetchCountries(
  codes: CountryCode[],
  onProgress?: (done: number, total: number, code: CountryCode) => void,
): Promise<void> {
  for (let i = 0; i < codes.length; i++) {
    await prefetchCountry(codes[i])
    onProgress?.(i + 1, codes.length, codes[i])
  }
}

/** 온보딩을 마쳤는지 (설문 재노출 방지) */
export const onboardingDone = (): boolean => localStorage.getItem(PREFETCHED_KEY) != null

export const markOnboardingDone = (codes: CountryCode[]) =>
  localStorage.setItem(PREFETCHED_KEY, JSON.stringify(codes))

export const frequentCountries = (): CountryCode[] => {
  try {
    return JSON.parse(localStorage.getItem(PREFETCHED_KEY) ?? '[]')
  } catch {
    return []
  }
}
