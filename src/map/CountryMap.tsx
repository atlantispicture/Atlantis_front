import { geoAzimuthalEquidistant, geoPath } from 'd3-geo'
import { useMemo } from 'react'
import MemoryPanel from '@/components/MemoryPanel'
import { useCountries } from '@/lib/useCountries'
import { useVisitStore } from '@/store/useVisitStore'

const W = 320
const H = 240

/**
 * 나라 상세 — 지구본에서 "간이 모핑"으로 도착하는 화면.
 * 선택 나라 중심의 정거방위도법(azimuthal equidistant) 평면 지도를 SVG로 그린다.
 */
export default function CountryMap() {
  const phase = useVisitStore((s) => s.phase)
  const selected = useVisitStore((s) => s.selected)
  const selectedRegion = useVisitStore((s) => s.selectedRegion)
  const back = useVisitStore((s) => s.back)
  const isVisited = useVisitStore((s) => (selected ? !!s.visits[selected.code]?.visited : false))
  const toggleVisited = useVisitStore((s) => s.toggleVisited)
  const regionVisited = useVisitStore((s) =>
    selectedRegion ? !!s.regionVisits[selectedRegion.code]?.visited : false,
  )
  const toggleRegionVisited = useVisitStore((s) => s.toggleRegionVisited)
  const regionCount = useVisitStore((s) => (selected ? s.regionVisitedCount(selected.code) : 0))
  const selectRegion = useVisitStore((s) => s.selectRegion)

  const { byCode, features } = useCountries()

  const selectedFeature = selected ? byCode.get(selected.code)?.feature : undefined

  // 선택 나라 중심 투영 + 화면에 맞춤
  const paths = useMemo(() => {
    if (!selected || !selectedFeature) return null
    const projection = geoAzimuthalEquidistant()
      .rotate([-selected.centroid[0], -selected.centroid[1]])
      .fitExtent(
        [
          [16, 16],
          [W - 16, H - 16],
        ],
        selectedFeature as never,
      )
    const path = geoPath(projection)
    return {
      selected: path(selectedFeature as never) ?? '',
      context: features.map((f) => path(f as never) ?? ''),
    }
  }, [selected, selectedFeature, features])

  const open = phase === 'country' && !!selected

  return (
    <aside className={`sheet ${open ? 'sheet--open' : ''}`} aria-hidden={!open}>
      {selected && (
        <>
          <header className="sheet__head">
            <button className="sheet__back" onClick={back} aria-label="지구본으로">
              ← 지구본
            </button>
            <div className="sheet__title">
              <h2>{selected.name}</h2>
              <span className="sheet__code">{selected.code}</span>
              {regionCount > 0 && <span className="sheet__badge">지역 {regionCount}</span>}
            </div>

            {/* 지역이 선택되면 한 단계 아래를 표시 — 다시 누르면 나라 전체로 */}
            {selectedRegion && (
              <button
                className="sheet__region"
                onClick={() => selectRegion(null)}
                title="나라 전체 보기"
              >
                <span className="sheet__region-name">{selectedRegion.name}</span>
                <span className="sheet__region-kind">
                  {selectedRegion.kind === 'city' ? '도시' : '행정구역'}
                </span>
                <span className="sheet__region-clear">✕</span>
              </button>
            )}
          </header>

          <div className="sheet__map">
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%">
              <rect width={W} height={H} fill="#f4f4f6" rx={12} />
              {paths?.context.map((d, i) => (
                <path key={i} d={d} fill="#c9c9cf" stroke="#f4f4f6" strokeWidth={0.4} />
              ))}
              {paths && (
                <path
                  d={paths.selected}
                  fill={isVisited ? '#0d0d0f' : '#4a4d52'}
                  stroke="#ffffff"
                  strokeWidth={0.8}
                />
              )}
            </svg>
          </div>

          {/* 지역이 선택돼 있으면 지역을, 아니면 나라를 토글한다 */}
          {selectedRegion ? (
            <button
              className={`toggle ${regionVisited ? 'toggle--on' : ''}`}
              onClick={() => toggleRegionVisited(selectedRegion)}
            >
              {regionVisited
                ? `✓ ${selectedRegion.name} 가봤어요`
                : `${selectedRegion.name} 가봤어요 표시하기`}
            </button>
          ) : (
            <button
              className={`toggle ${isVisited ? 'toggle--on' : ''}`}
              onClick={() => toggleVisited(selected.code)}
            >
              {isVisited ? '✓ 가봤어요' : '가봤어요 표시하기'}
            </button>
          )}

          <MemoryPanel />
        </>
      )}
    </aside>
  )
}
