/** ISO 3166-1 alpha-3 국가 코드 (예: "KOR", "JPN") */
export type CountryCode = string

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
