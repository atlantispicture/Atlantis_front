import type { CountryMeta } from '@/lib/useCountries'
import type { CountryCode } from '@/types'

/**
 * Natural Earth 의 CONTINENT 값 → 한국어 라벨.
 * key 는 원본 문자열 그대로 써서 데이터와 그대로 맞물리게 한다.
 */
export const CONTINENTS: { key: string; label: string }[] = [
  { key: 'Asia', label: '아시아' },
  { key: 'Europe', label: '유럽' },
  { key: 'North America', label: '북아메리카' },
  { key: 'South America', label: '남아메리카' },
  { key: 'Africa', label: '아프리카' },
  { key: 'Oceania', label: '오세아니아' },
]

const LABELS = new Map(CONTINENTS.map((c) => [c.key, c.label]))

export const continentLabel = (key: string | null | undefined): string =>
  (key && LABELS.get(key)) || '기타'

/** 나라 코드로 소속 대륙(원본 key)을 찾는다. */
export function continentOf(list: CountryMeta[], code: CountryCode): string | null {
  return list.find((c) => c.code === code)?.continent ?? null
}
