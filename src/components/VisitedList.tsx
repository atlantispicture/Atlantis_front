import { useEffect, useMemo, useState } from 'react'
import type { MemoryView } from '@/lib/memoryDb'
import { SEASONS, seasonLabel } from '@/lib/season'
import { useCountries } from '@/lib/useCountries'
import { useMemoryStore } from '@/store/useMemoryStore'
import { useVisitStore } from '@/store/useVisitStore'
import MemoryViewer from './MemoryViewer'

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })

interface PlaceRow {
  key: string // regionCode 또는 countryCode
  name: string
  countryCode: string
  countryName: string
  isRegion: boolean
  memories: MemoryView[]
  /** 가장 최근 촬영일 — 정렬 기준 */
  latest: number
}

/**
 * 가본 곳 목록 — 방문 표시한 나라·지역을 모아 보여주고,
 * 각 장소에서 찍은 사진·영상을 날짜와 함께 펼쳐 본다.
 *
 * 베타: 구조와 동작 확인용. 디자인은 이후에 교체한다.
 */
export default function VisitedList() {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  // 목록 자체가 아니라 '어느 장소의 몇 번째'만 들고 있는다.
  // 스냅샷을 들면 삭제 후에도 지워진 항목이 남는다.
  const [viewer, setViewer] = useState<{ key: string; index: number } | null>(null)

  const { list } = useCountries()
  const visits = useVisitStore((s) => s.visits)
  const regionVisits = useVisitStore((s) => s.regionVisits)
  const select = useVisitStore((s) => s.select)
  const selectRegion = useVisitStore((s) => s.selectRegion)

  const items = useMemoryStore((s) => s.items)
  const remove = useMemoryStore((s) => s.remove)
  const load = useMemoryStore((s) => s.load)

  useEffect(() => {
    load()
  }, [load])

  const countryName = useMemo(() => {
    const m = new Map(list.map((c) => [c.code, c.name]))
    return (code: string) => m.get(code) ?? code
  }, [list])

  /**
   * 방문 기록과 추억을 장소 단위로 합친다.
   * 추억만 있고 방문 표시가 없는 곳도 목록에 넣는다 — 사진을 올렸다면 간 곳이다.
   */
  const rows = useMemo<PlaceRow[]>(() => {
    const map = new Map<string, PlaceRow>()

    const ensure = (
      key: string,
      name: string,
      countryCode: string,
      isRegion: boolean,
    ): PlaceRow => {
      let row = map.get(key)
      if (!row) {
        row = {
          key,
          name,
          countryCode,
          countryName: countryName(countryCode),
          isRegion,
          memories: [],
          latest: 0,
        }
        map.set(key, row)
      }
      return row
    }

    for (const v of Object.values(visits)) {
      if (v.visited) ensure(v.countryCode, countryName(v.countryCode), v.countryCode, false)
    }
    for (const r of Object.values(regionVisits)) {
      if (r.visited) ensure(r.regionCode, r.regionName || r.regionCode, r.countryCode, true)
    }
    for (const m of items) {
      const key = m.regionCode ?? m.countryCode
      const row = ensure(key, m.placeName || key, m.countryCode, !!m.regionCode)
      row.memories.push(m)
      row.latest = Math.max(row.latest, m.capturedAt)
    }

    for (const row of map.values()) row.memories.sort((a, b) => b.capturedAt - a.capturedAt)

    // 추억이 있는 곳을 먼저, 그 안에서는 최근 순
    return [...map.values()].sort(
      (a, b) => b.memories.length - a.memories.length || b.latest - a.latest,
    )
  }, [visits, regionVisits, items, countryName])

  // 뷰어가 볼 장소 — rows 가 다시 계산되면 목록도 자동으로 최신이 된다
  const viewerRow = viewer ? (rows.find((r) => r.key === viewer.key) ?? null) : null

  const totalMemories = items.length
  const placeCount = rows.length

  const goTo = (row: PlaceRow) => {
    const country = list.find((c) => c.code === row.countryCode)
    if (!country) return
    select({ code: country.code, name: country.name, centroid: country.centroid })
    if (!row.isRegion) selectRegion(null)
    setOpen(false)
  }

  return (
    <>
      <button className="vl__toggle" onClick={() => setOpen(!open)}>
        가본 곳 <b>{placeCount}</b>
        {totalMemories > 0 && <span className="vl__toggle-sub">사진·영상 {totalMemories}</span>}
      </button>

      {open && (
        <aside className="vl">
          <header className="vl__head">
            <h2>가본 곳</h2>
            <button className="vl__close" onClick={() => setOpen(false)} aria-label="닫기">
              ✕
            </button>
          </header>

          {rows.length === 0 ? (
            <p className="vl__empty">
              아직 기록이 없어요.
              <br />
              지구본에서 나라를 눌러 «가봤어요»를 표시하거나 사진을 올려보세요.
            </p>
          ) : (
            <ul className="vl__list">
              {rows.map((row) => {
                const isOpen = expanded === row.key
                return (
                  <li key={row.key} className="vl__item">
                    <div className="vl__row">
                      <button className="vl__name" onClick={() => goTo(row)} title="지구본에서 보기">
                        <span className="vl__title">{row.name}</span>
                        {row.isRegion && <span className="vl__country">{row.countryName}</span>}
                      </button>

                      <button
                        className="vl__count"
                        onClick={() => setExpanded(isOpen ? null : row.key)}
                        disabled={row.memories.length === 0}
                      >
                        {row.memories.length > 0 ? (
                          <>
                            {row.memories.length}
                            <i>{isOpen ? '▴' : '▾'}</i>
                          </>
                        ) : (
                          <span className="vl__none">기록 없음</span>
                        )}
                      </button>
                    </div>

                    {isOpen && row.memories.length > 0 && (
                      <ul className="vl__grid">
                        {row.memories.map((m, i) => (
                          <li key={m.id} className="vl__cell">
                            <button onClick={() => setViewer({ key: row.key, index: i })}>
                              {m.thumbUrl ? (
                                <img src={m.thumbUrl} alt={m.fileName} loading="lazy" />
                              ) : (
                                <div className="vl__noimg">
                                  {m.kind === 'video' ? '영상' : '사진'}
                                </div>
                              )}
                              {m.kind === 'video' && <span className="vl__play">▶</span>}
                              <span
                                className="vl__stamp"
                                style={{ background: SEASONS[m.season].color }}
                                title={seasonLabel(m.season)}
                              >
                                {fmtDate(m.capturedAt)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </aside>
      )}

      {viewerRow && viewer && (
        <MemoryViewer
          items={viewerRow.memories}
          index={viewer.index}
          place={viewerRow.name}
          // 함수형 갱신 — 오래된 상태를 덮어쓰지 않게
          onIndex={(i) => setViewer((v) => (v ? { ...v, index: i } : null))}
          onClose={() => setViewer(null)}
          onDelete={remove}
        />
      )}
    </>
  )
}
