import { geoAzimuthalEquidistant, geoPath } from 'd3-geo'
import { useMemo } from 'react'
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
  const back = useVisitStore((s) => s.back)
  const isVisited = useVisitStore((s) => (selected ? !!s.visits[selected.code]?.visited : false))
  const toggleVisited = useVisitStore((s) => s.toggleVisited)

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
            </div>
          </header>

          <div className="sheet__map">
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%">
              <rect width={W} height={H} fill="#0b1220" rx={12} />
              {paths?.context.map((d, i) => (
                <path key={i} d={d} fill="#1e293b" stroke="#0b1220" strokeWidth={0.4} />
              ))}
              {paths && (
                <path
                  d={paths.selected}
                  fill={isVisited ? '#f6ad55' : '#38a169'}
                  stroke="#f8fafc"
                  strokeWidth={0.8}
                />
              )}
            </svg>
          </div>

          <button
            className={`toggle ${isVisited ? 'toggle--on' : ''}`}
            onClick={() => toggleVisited(selected.code)}
          >
            {isVisited ? '✓ 가봤어요' : '가봤어요 표시하기'}
          </button>

          <section className="sheet__memories">
            <h3>추억</h3>
            <p className="sheet__empty">
              사진·메모·날짜를 붙일 수 있어요. (Phase 3에서 구현)
            </p>
          </section>
        </>
      )}
    </aside>
  )
}
