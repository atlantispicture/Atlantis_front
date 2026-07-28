import { useEffect, useMemo, useState } from 'react'
import type { MemoryView } from '@/lib/memoryDb'
import { SEASONS, seasonLabel } from '@/lib/season'
import { useCountries } from '@/lib/useCountries'
import { useMemoryStore } from '@/store/useMemoryStore'
import { useVisitStore } from '@/store/useVisitStore'
import MemoryViewer from './MemoryViewer'

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })

interface RegionNode {
  key: string // regionCode 또는 나라코드(지역 미지정)
  name: string
  isCountryLevel: boolean
  memories: MemoryView[]
}

interface CountryNode {
  code: string
  name: string
  regions: RegionNode[]
  memoryCount: number
  latest: number
}

/**
 * 가본 곳 트리 — 나라가 큰 선택지, 열면 그 안에서 간 지역이 펼쳐진다.
 *
 * 이전 평면 목록은 나라와 지역이 같은 층에 섞여 있어 '어느 나라의 어디'인지
 * 읽기 어려웠다. 나라 > 지역 > 사진의 3단으로 계층을 드러낸다.
 */
export default function VisitTree() {
  const [open, setOpen] = useState(false)
  const [openCountries, setOpenCountries] = useState<Set<string>>(new Set())
  const [openRegions, setOpenRegions] = useState<Set<string>>(new Set())
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

  /** 방문 기록 + 추억을 나라 > 지역으로 묶는다 */
  const tree = useMemo<CountryNode[]>(() => {
    const countries = new Map<string, CountryNode>()

    const ensureCountry = (code: string): CountryNode => {
      let c = countries.get(code)
      if (!c) {
        c = { code, name: countryName(code), regions: [], memoryCount: 0, latest: 0 }
        countries.set(code, c)
      }
      return c
    }
    const ensureRegion = (
      country: CountryNode,
      key: string,
      name: string,
      isCountryLevel: boolean,
    ): RegionNode => {
      let r = country.regions.find((x) => x.key === key)
      if (!r) {
        r = { key, name, isCountryLevel, memories: [] }
        country.regions.push(r)
      }
      return r
    }

    for (const v of Object.values(visits)) if (v.visited) ensureCountry(v.countryCode)

    for (const rv of Object.values(regionVisits)) {
      if (!rv.visited) continue
      const c = ensureCountry(rv.countryCode)
      ensureRegion(c, rv.regionCode, rv.regionName || rv.regionCode, false)
    }

    // 사진만 올리고 방문 표시를 안 한 곳도 포함 — 올렸다면 다녀온 것이다
    for (const m of items) {
      const c = ensureCountry(m.countryCode)
      const key = m.regionCode ?? m.countryCode
      const r = ensureRegion(c, key, m.placeName || key, !m.regionCode)
      r.memories.push(m)
      c.memoryCount++
      c.latest = Math.max(c.latest, m.capturedAt)
    }

    for (const c of countries.values()) {
      for (const r of c.regions) r.memories.sort((a, b) => b.capturedAt - a.capturedAt)
      // 사진 있는 지역 먼저, 그다음 이름순
      c.regions.sort(
        (a, b) => b.memories.length - a.memories.length || a.name.localeCompare(b.name, 'ko'),
      )
    }

    return [...countries.values()].sort(
      (a, b) => b.memoryCount - a.memoryCount || b.latest - a.latest,
    )
  }, [visits, regionVisits, items, countryName])

  const viewerNode = useMemo(() => {
    if (!viewer) return null
    for (const c of tree) {
      const r = c.regions.find((x) => x.key === viewer.key)
      if (r) return r
    }
    return null
  }, [viewer, tree])

  const toggle = (set: Set<string>, key: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set)
    next.has(key) ? next.delete(key) : next.add(key)
    apply(next)
  }

  const goCountry = (code: string) => {
    const c = list.find((x) => x.code === code)
    if (!c) return
    select({ code: c.code, name: c.name, centroid: c.centroid })
    setOpen(false)
  }

  const totalPlaces = tree.reduce((n, c) => n + c.regions.length, 0)

  return (
    <>
      <button className="vl__toggle" onClick={() => setOpen(!open)}>
        가본 곳 <b>{tree.length}</b>
        {items.length > 0 && <span className="vl__toggle-sub">사진·영상 {items.length}</span>}
      </button>

      {open && (
        <aside className="tree">
          <header className="tree__head">
            <h2>
              가본 곳
              <span className="tree__sum">
                나라 {tree.length} · 지역 {totalPlaces}
              </span>
            </h2>
            <button className="tree__close" onClick={() => setOpen(false)} aria-label="닫기">
              ✕
            </button>
          </header>

          {tree.length === 0 ? (
            <p className="tree__empty">
              아직 기록이 없어요.
              <br />
              지구본에서 나라를 눌러 «가봤어요»를 표시하거나 사진을 올려보세요.
            </p>
          ) : (
            <ul className="tree__list">
              {tree.map((c) => {
                const isOpen = openCountries.has(c.code)
                return (
                  <li key={c.code} className="tree__country">
                    <div className="tree__row">
                      <button
                        className="tree__caret"
                        onClick={() => toggle(openCountries, c.code, setOpenCountries)}
                        aria-expanded={isOpen}
                        aria-label={isOpen ? '접기' : '펼치기'}
                      >
                        {isOpen ? '▾' : '▸'}
                      </button>
                      <button className="tree__label" onClick={() => goCountry(c.code)}>
                        <span className="tree__name">{c.name}</span>
                        <span className="tree__meta">
                          지역 {c.regions.length}
                          {c.memoryCount > 0 && ` · 사진 ${c.memoryCount}`}
                        </span>
                      </button>
                    </div>

                    {isOpen && (
                      <ul className="tree__regions">
                        {c.regions.length === 0 && (
                          <li className="tree__none">기록한 지역이 없어요</li>
                        )}
                        {c.regions.map((r) => {
                          const rOpen = openRegions.has(r.key)
                          return (
                            <li key={r.key}>
                              <div className="tree__row tree__row--sub">
                                <button
                                  className="tree__caret"
                                  onClick={() => toggle(openRegions, r.key, setOpenRegions)}
                                  disabled={r.memories.length === 0}
                                  aria-expanded={rOpen}
                                >
                                  {r.memories.length === 0 ? '·' : rOpen ? '▾' : '▸'}
                                </button>
                                <button
                                  className="tree__label"
                                  onClick={() => {
                                    goCountry(c.code)
                                    // 나라 전체에 붙은 추억이면 지역 선택을 비운다
                                    if (r.isCountryLevel) selectRegion(null)
                                  }}
                                >
                                  <span className="tree__name tree__name--sub">{r.name}</span>
                                  {r.memories.length > 0 && (
                                    <span className="tree__meta">{r.memories.length}</span>
                                  )}
                                </button>
                              </div>

                              {rOpen && r.memories.length > 0 && (
                                <ul className="tree__grid">
                                  {r.memories.map((m, i) => (
                                    <li key={m.id}>
                                      <button
                                        onClick={() => setViewer({ key: r.key, index: i })}
                                        title={fmtDate(m.capturedAt)}
                                      >
                                        {m.thumbUrl ? (
                                          <img src={m.thumbUrl} alt={m.fileName} loading="lazy" />
                                        ) : (
                                          <span className="tree__noimg">
                                            {m.kind === 'video' ? '영상' : '사진'}
                                          </span>
                                        )}
                                        {m.kind === 'video' && <span className="tree__play">▶</span>}
                                        <span
                                          className="tree__stamp"
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
                  </li>
                )
              })}
            </ul>
          )}
        </aside>
      )}

      {viewerNode && viewer && (
        <MemoryViewer
          items={viewerNode.memories}
          index={viewer.index}
          place={viewerNode.name}
          onIndex={(i) => setViewer((v) => (v ? { ...v, index: i } : null))}
          onClose={() => setViewer(null)}
          onDelete={remove}
        />
      )}
    </>
  )
}
