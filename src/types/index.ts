/** ISO 3166-1 alpha-3 국가 코드 (예: "KOR", "JPN") */
export type CountryCode = string

/** ISO 3166-2 행정구역 코드 (예: "JP-27" 오사카부, "KR-11" 서울) — 전역 고유 */
export type RegionCode = string

export type PrivacyScope = 'public' | 'friends' | 'private'

export interface Country {
  code: CountryCode
  name: string
  /** 국가 중심 좌표 [경도, 위도] — 카메라 트위닝 목표점 */
  center: [number, number]
}

export interface Visit {
  countryCode: CountryCode
  visited: boolean
  visitedYm?: string // 'YYYY-MM'
  companions?: string
  note?: string
  color?: string
  scope: PrivacyScope
  updatedAt: number
}

/** 지역(행정구역) 단위 방문 기록 — 나라 방문(Visit)보다 한 단계 아래. */
export interface RegionVisit {
  regionCode: RegionCode
  /** 표시용 이름 — 지오데이터를 다시 받지 않고 목록을 그리기 위해 함께 저장한다 */
  regionName: string
  countryCode: CountryCode
  kind: 'region' | 'city'
  visited: boolean
  visitedYm?: string // 'YYYY-MM'
  note?: string
  scope: PrivacyScope
  updatedAt: number
}

export interface Memory {
  id: string
  visitCountryCode: CountryCode
  takenAt?: number
  caption?: string
  city?: string
  lat?: number
  lng?: number
  mediaUris: string[]
  scope: PrivacyScope
}
