import type { Country } from '@/types'

/**
 * 국가 메타(코드/이름/중심좌표) 소스.
 *
 * TODO(Phase 0): Natural Earth 에서 파생한 195개국 데이터를 로드.
 *  - 경계 폴리곤: public/geo/countries-110m.json (topojson, 저해상도)
 *  - 중심좌표: d3-geo geoCentroid 로 계산하거나 사전 계산 테이블
 *
 * 아래는 개발 초기 확인용 소량 시드.
 */
export const COUNTRIES_SEED: Country[] = [
  { code: 'KOR', name: '대한민국', center: [127.77, 35.91] },
  { code: 'JPN', name: '일본', center: [138.25, 36.2] },
  { code: 'USA', name: '미국', center: [-95.71, 37.09] },
  { code: 'FRA', name: '프랑스', center: [2.21, 46.23] },
  { code: 'AUS', name: '호주', center: [133.78, -25.27] },
]
