export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

/**
 * 계절 팔레트.
 * 바탕이 흑백이라 색은 '의미 있는 신호'다 — 채도를 낮게 잡아 흰 배경에서도
 * 눈을 찌르지 않으면서 서로는 뚜렷이 구분되게 했다.
 */
export const SEASONS: Record<Season, { label: string; color: string }> = {
  spring: { label: '봄', color: '#e6789f' }, // 벚꽃 핑크
  summer: { label: '여름', color: '#3fa66b' }, // 신록
  autumn: { label: '가을', color: '#d1803a' }, // 단풍
  winter: { label: '겨울', color: '#4a80c4' }, // 겨울 하늘
}

export const SEASON_KEYS = Object.keys(SEASONS) as Season[]

/**
 * 월(1~12) → 계절. 3-5 봄 / 6-8 여름 / 9-11 가을 / 12-2 겨울.
 * 남반구는 계절이 반대지만 프로토타입에서는 북반구 기준으로 둔다.
 */
export function seasonOfMonth(month: number): Season {
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'autumn'
  return 'winter'
}

export const seasonOf = (date: Date): Season => seasonOfMonth(date.getMonth() + 1)

export const seasonColor = (s: Season): string => SEASONS[s].color

export const seasonLabel = (s: Season): string => SEASONS[s].label

/**
 * 여러 추억이 섞인 지역의 대표 계절 — 가장 많이 찍힌 계절.
 * 동수면 최근 것을 우선한다 (마지막 여행의 인상이 남게).
 */
export function dominantSeason(
  items: { season: Season; capturedAt: number }[],
): Season | null {
  if (items.length === 0) return null

  const count = new Map<Season, { n: number; latest: number }>()
  for (const it of items) {
    const cur = count.get(it.season) ?? { n: 0, latest: 0 }
    count.set(it.season, {
      n: cur.n + 1,
      latest: Math.max(cur.latest, it.capturedAt),
    })
  }

  let best: Season | null = null
  let bestVal = { n: -1, latest: -1 }
  for (const [season, v] of count) {
    if (v.n > bestVal.n || (v.n === bestVal.n && v.latest > bestVal.latest)) {
      best = season
      bestVal = v
    }
  }
  return best
}
