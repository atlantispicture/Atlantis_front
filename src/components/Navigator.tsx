import { useEffect, useMemo, useState } from 'react'
import { CONTINENTS, continentOf } from '@/data/continents'
import { useCountries } from '@/lib/useCountries'
import { useRegions } from '@/lib/useRegions'
import { useVisitStore, type SelectedRegion } from '@/store/useVisitStore'
import Combo, { type ComboOption } from './Combo'
import SearchBox from './SearchBox'

/** 도시는 ISO 코드가 없으므로 나라코드+이름으로 방문 기록용 안정 키를 만든다. */
export const cityCode = (countryCode: string, cityName: string) =>
  `${countryCode}:city:${cityName}`

/**
 * 대륙 → 나라 → 지역 3단 내비게이션.
 * 지역 목록이 100개를 넘는 나라가 있어 세 칸 모두 '입력해서 걸러 쓰는' 콤보박스다.
 * 예: 아시아 → 일본 → 오사카부 / 오사카시
 */
export default function Navigator() {
  const { list, status } = useCountries()
  const selected = useVisitStore((s) => s.selected)
  const selectedRegion = useVisitStore((s) => s.selectedRegion)
  const select = useVisitStore((s) => s.select)
  const selectRegion = useVisitStore((s) => s.selectRegion)
  const isVisited = useVisitStore((s) => s.isVisited)
  const isRegionVisited = useVisitStore((s) => s.isRegionVisited)

  // 대륙은 독립 상태 — 대륙만 고르고 나라는 아직 안 고른 단계가 있어야 한다.
  const [continent, setContinent] = useState<string | null>(null)
  // 기본은 접힘 — 지구본을 가리지 않게
  const [expanded, setExpanded] = useState(false)

  // 검색·지구본 클릭으로 나라가 정해지면 대륙 칸도 따라 맞춘다.
  useEffect(() => {
    if (selected) setContinent(continentOf(list, selected.code))
  }, [selected, list])

  // 나라가 선택된 뒤에만 지역 데이터를 받아온다 (지연 로딩).
  const { regions, cities, status: regionStatus } = useRegions(selected?.code)

  const continentOptions: ComboOption[] = useMemo(
    () => CONTINENTS.map((c) => ({ value: c.key, label: c.label, keywords: c.key })),
    [],
  )

  const countryOptions: ComboOption[] = useMemo(
    () =>
      (continent ? list.filter((c) => c.continent === continent) : list)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
        .map((c) => ({
          value: c.code,
          label: c.name,
          keywords: `${c.nameEn} ${c.code}`,
          marked: isVisited(c.code),
        })),
    [list, continent, isVisited],
  )

  // 행정구역·도시를 한 목록에 묶되 group 으로 구분. 값은 목록 위치로 만들어
  // 동명 항목(카자흐스탄 '알마티' 주/시)이 섞여도 모호하지 않게 한다.
  const regionOptions: ComboOption[] = useMemo(() => {
    const out: ComboOption[] = regions.map((r, i) => ({
      value: `region:${i}`,
      label: r.name,
      keywords: `${r.nameEn} ${r.code}`,
      group: '행정구역',
      marked: isRegionVisited(r.code),
    }))
    for (const [i, c] of cities.entries()) {
      out.push({
        value: `city:${i}`,
        label: c.name,
        keywords: c.nameEn,
        group: '도시',
        marked: selected ? isRegionVisited(cityCode(selected.code, c.name)) : false,
      })
    }
    return out
  }, [regions, cities, selected, isRegionVisited])

  const onContinent = (value: string) => {
    // 대륙만 바꾼 단계에서는 나라를 자동 선택하지 않는다 (지구본이 멋대로 날아가지 않게).
    setContinent(value || null)
    useVisitStore.setState({ selected: null, selectedRegion: null, phase: 'globe' })
  }

  const onCountry = (code: string) => {
    if (!code) {
      useVisitStore.setState({ selected: null, selectedRegion: null, phase: 'globe' })
      return
    }
    const c = list.find((x) => x.code === code)
    if (c) select({ code: c.code, name: c.name, centroid: c.centroid })
  }

  const onRegion = (value: string) => {
    if (!value || !selected) return selectRegion(null)
    const [kind, idx] = value.split(':')
    const i = Number(idx)

    if (kind === 'region') {
      const r = regions[i]
      if (!r) return
      selectRegion({
        code: r.code,
        name: r.name,
        countryCode: selected.code,
        centroid: [r.lng, r.lat],
        kind: 'region',
      } satisfies SelectedRegion)
    } else {
      const city = cities[i]
      if (!city) return
      selectRegion({
        code: cityCode(selected.code, city.name),
        name: city.name,
        countryCode: selected.code,
        centroid: [city.lng, city.lat],
        kind: 'city',
      } satisfies SelectedRegion)
    }
  }

  if (status !== 'ready') return null

  // 접힌 상태에서 무엇이 걸려 있는지 한눈에 (아이콘 옆 요약)
  const summary = selectedRegion?.name ?? selected?.name ?? continentLabelOf(continent)

  // 현재 선택을 목록 위치로 되짚어 콤보 값과 맞춘다.
  const regionValue = !selectedRegion
    ? ''
    : selectedRegion.kind === 'region'
      ? indexOrEmpty('region', regions.findIndex((r) => r.code === selectedRegion.code))
      : indexOrEmpty('city', cities.findIndex((c) => c.name === selectedRegion.name))

  // 접힘: 작은 필터 아이콘 / 펼침: 대륙 › 나라 › 지역
  if (!expanded) {
    return (
      <button
        className={`navfab ${summary ? 'navfab--on' : ''}`}
        onClick={() => setExpanded(true)}
        aria-label="지역 필터 열기"
        aria-expanded={false}
      >
        <FilterIcon />
        {summary && <span className="navfab__label">{summary}</span>}
      </button>
    )
  }

  return (
    <div className="nav">
      {/* 1행: 접기 + 검색 — 검색도 '어디를 볼까'라는 같은 맥락이라 함께 둔다 */}
      <div className="nav__row">
        <button
          className="nav__collapse"
          onClick={() => setExpanded(false)}
          aria-label="필터 접기"
        >
          <FilterIcon />
        </button>
        <SearchBox />
      </div>

      {/* 2행: 대륙 › 나라 › 지역 */}
      <div className="nav__row">
        <Combo
          ariaLabel="대륙 선택"
          placeholder="대륙"
          value={continent ?? ''}
          options={continentOptions}
          onChange={onContinent}
        />

        <span className="nav__sep">›</span>

        <Combo
          ariaLabel="나라 선택"
          placeholder="나라"
          value={selected?.code ?? ''}
          options={countryOptions}
          onChange={onCountry}
        />

        <span className="nav__sep">›</span>

        <Combo
          ariaLabel="지역 선택"
          placeholder={
            !selected ? '지역' : regionStatus === 'loading' ? '불러오는 중…' : '지역'
          }
          value={regionValue}
          options={regionOptions}
          disabled={!selected || regionStatus === 'loading'}
          emptyText={regionStatus === 'missing' ? '지역 데이터 없음' : '결과 없음'}
          onChange={onRegion}
        />
      </div>
    </div>
  )
}

/** findIndex 결과가 -1(못 찾음)이면 빈 값으로 — 첫 항목이 잘못 선택되지 않게. */
const indexOrEmpty = (kind: string, i: number) => (i < 0 ? '' : `${kind}:${i}`)

/** 대륙 원본 key → 한국어 라벨 (아무것도 안 골랐으면 빈 값) */
const continentLabelOf = (key: string | null) =>
  key ? (CONTINENTS.find((c) => c.key === key)?.label ?? '') : ''

/** 필터(슬라이더) 아이콘 — 아이콘 라이브러리 없이 인라인 SVG */
function FilterIcon() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none">
        <line x1="3" y1="6" x2="17" y2="6" />
        <line x1="3" y1="10" x2="17" y2="10" />
        <line x1="3" y1="14" x2="17" y2="14" />
      </g>
      <g fill="currentColor">
        <circle cx="13" cy="6" r="2.2" />
        <circle cx="7" cy="10" r="2.2" />
        <circle cx="11" cy="14" r="2.2" />
      </g>
    </svg>
  )
}
