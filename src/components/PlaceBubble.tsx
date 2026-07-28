import { useEffect, useRef, useState } from 'react'
import type { MemoryView } from '@/lib/memoryDb'
import { SEASONS, SEASON_KEYS, seasonLabel, type Season } from '@/lib/season'
import { useMemoryStore } from '@/store/useMemoryStore'
import { useVisitStore } from '@/store/useVisitStore'
import MemoryViewer from './MemoryViewer'

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })

/**
 * 선택한 장소의 말풍선.
 *
 * 기존 전체 시트는 모바일에서 화면을 다 덮어 지구본이 안 보였다.
 * 대신 화면 아래쪽에 작은 말풍선을 띄워 '어디를 골랐고, 거기 사진이 몇 장인지'만
 * 보여주고, 사진은 눌렀을 때 뷰어로 크게 연다.
 */
export default function PlaceBubble() {
  const phase = useVisitStore((s) => s.phase)
  const selected = useVisitStore((s) => s.selected)
  const selectedRegion = useVisitStore((s) => s.selectedRegion)
  const back = useVisitStore((s) => s.back)
  const selectRegion = useVisitStore((s) => s.selectRegion)

  const isVisited = useVisitStore((s) => (selected ? !!s.visits[selected.code]?.visited : false))
  const toggleVisited = useVisitStore((s) => s.toggleVisited)
  const regionVisited = useVisitStore((s) =>
    selectedRegion ? !!s.regionVisits[selectedRegion.code]?.visited : false,
  )
  const toggleRegionVisited = useVisitStore((s) => s.toggleRegionVisited)

  const items = useMemoryStore((s) => s.items)
  const uploading = useMemoryStore((s) => s.uploading)
  const add = useMemoryStore((s) => s.add)
  const remove = useMemoryStore((s) => s.remove)
  const load = useMemoryStore((s) => s.load)
  const customColors = useMemoryStore((s) => s.customColors)
  const setCustomColor = useMemoryStore((s) => s.setCustomColor)

  const inputRef = useRef<HTMLInputElement>(null)
  const [viewIndex, setViewIndex] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    load()
  }, [load])

  // 장소가 바뀌면 펼침 상태를 초기화한다
  useEffect(() => {
    setExpanded(false)
  }, [selected?.code, selectedRegion?.code])

  const open = phase === 'country' && !!selected
  if (!open || !selected) return null

  const key = selectedRegion?.code ?? selected.code
  const name = selectedRegion?.name ?? selected.name
  const mine = items.filter((i) => (i.regionCode ?? i.countryCode) === key)
  const sorted = [...mine].sort((a, b) => b.capturedAt - a.capturedAt)

  const visited = selectedRegion ? regionVisited : isVisited
  const onToggle = () =>
    selectedRegion ? toggleRegionVisited(selectedRegion) : toggleVisited(selected.code)

  // 색: 직접 지정 > 계절 자동 > 없음
  const custom = customColors[key]
  const auto = useMemoryStore.getState().colorOf(key)
  const colorSource = custom ? '직접' : auto?.source === 'season' ? '계절 자동' : '없음'
  const shownColor = custom ?? (auto?.source === 'season' ? auto.color : null)

  const onFiles = (files: FileList | null) => {
    if (!files?.length) return
    add(files, {
      countryCode: selected.code,
      regionCode: selectedRegion?.code ?? null,
      placeName: name,
    })
    setExpanded(true)
  }

  return (
    <>
      <div className="bub">
        <div className="bub__tail" aria-hidden="true" />

        <div className="bub__head">
          <div className="bub__who">
            <span className="bub__name">{name}</span>
            {selectedRegion ? (
              <button
                className="bub__up"
                onClick={() => selectRegion(null)}
                title="나라 전체로"
              >
                {selected.name} ↑
              </button>
            ) : (
              <span className="bub__code">{selected.code}</span>
            )}
          </div>
          <button className="bub__close" onClick={back} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="bub__actions">
          <button className={`bub__visit ${visited ? 'bub__visit--on' : ''}`} onClick={onToggle}>
            {visited ? '✓ 가봤어요' : '가봤어요'}
          </button>

          <button className="bub__add" onClick={() => inputRef.current?.click()}>
            {uploading > 0 ? `올리는 중 ${uploading}` : '＋ 사진·영상'}
          </button>

          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={(e) => {
              onFiles(e.target.files)
              e.target.value = ''
            }}
          />

          {sorted.length > 0 && (
            <button className="bub__more" onClick={() => setExpanded(!expanded)}>
              {sorted.length}장 {expanded ? '▾' : '▸'}
            </button>
          )}
        </div>

        {/* 색 지정 — 계절 자동을 덮어쓴다 */}
        <div className="bub__colors">
          <span className="bub__colors-label">
            색 <em>{colorSource}</em>
          </span>
          <div className="bub__swatches">
            {SEASON_KEYS.map((s: Season) => (
              <button
                key={s}
                className={`sw ${custom === SEASONS[s].color ? 'sw--on' : ''}`}
                style={{ background: SEASONS[s].color }}
                title={`${seasonLabel(s)} 색으로 지정`}
                aria-label={`${seasonLabel(s)} 색`}
                onClick={() => setCustomColor(key, SEASONS[s].color)}
              />
            ))}
            <label className="sw sw--pick" title="직접 고르기">
              <input
                type="color"
                value={shownColor ?? '#888888'}
                onChange={(e) => setCustomColor(key, e.target.value)}
              />
            </label>
            {custom && (
              <button className="bub__reset" onClick={() => setCustomColor(key, null)}>
                자동으로
              </button>
            )}
          </div>
        </div>

        {/* 접혀 있으면 가로 스크롤 한 줄, 펼치면 격자 */}
        {sorted.length > 0 && (
          <ul className={`bub__strip ${expanded ? 'bub__strip--grid' : ''}`}>
            {sorted.map((m, i) => (
              <li key={m.id}>
                <button onClick={() => setViewIndex(i)} title={fmtDate(m.capturedAt)}>
                  {m.thumbUrl ? (
                    <img src={m.thumbUrl} alt={m.fileName} loading="lazy" />
                  ) : (
                    <span className="bub__noimg">{m.kind === 'video' ? '영상' : '사진'}</span>
                  )}
                  {m.kind === 'video' && <span className="bub__play">▶</span>}
                  <span
                    className="bub__stamp"
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
      </div>

      {viewIndex !== null && (
        <MemoryViewer
          items={sorted}
          index={viewIndex}
          place={name}
          onIndex={setViewIndex}
          onClose={() => setViewIndex(null)}
          onDelete={remove}
        />
      )}
    </>
  )
}

export type { MemoryView }
