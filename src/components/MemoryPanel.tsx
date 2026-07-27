import { useEffect, useRef, useState } from 'react'
import { SEASONS, SEASON_KEYS, seasonLabel, type Season } from '@/lib/season'
import { useMemoryStore } from '@/store/useMemoryStore'
import { useVisitStore } from '@/store/useVisitStore'

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

/**
 * 추억 패널 — 나라 상세 시트 안에 들어간다.
 * 지역이 선택돼 있으면 그 지역에, 아니면 나라 전체에 추억을 붙인다.
 */
export default function MemoryPanel() {
  const selected = useVisitStore((s) => s.selected)
  const selectedRegion = useVisitStore((s) => s.selectedRegion)

  const items = useMemoryStore((s) => s.items)
  const uploading = useMemoryStore((s) => s.uploading)
  const add = useMemoryStore((s) => s.add)
  const remove = useMemoryStore((s) => s.remove)
  const customColors = useMemoryStore((s) => s.customColors)
  const setCustomColor = useMemoryStore((s) => s.setCustomColor)
  const load = useMemoryStore((s) => s.load)

  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    load()
  }, [load])

  if (!selected) return null

  // 추억이 붙는 대상 — 지역이 열려 있으면 지역, 아니면 나라
  const key = selectedRegion?.code ?? selected.code
  const targetName = selectedRegion?.name ?? selected.name
  const mine = items.filter((i) => (i.regionCode ?? i.countryCode) === key)

  const custom = customColors[key]
  // 색 우선순위: 직접 지정 > 계절 자동
  const auto = useMemoryStore.getState().colorOf(key)
  const shownColor = custom ?? (auto?.source === 'season' ? auto.color : null)

  const onFiles = (files: FileList | null) => {
    if (!files?.length) return
    add(files, {
      countryCode: selected.code,
      regionCode: selectedRegion?.code ?? null,
    })
  }

  return (
    <section className="mem">
      <div className="mem__head">
        <h3>추억</h3>
        <span className="mem__target">{targetName}</span>
      </div>

      <div
        className={`mem__drop ${dragOver ? 'mem__drop--over' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          onFiles(e.dataTransfer.files)
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(e) => {
            onFiles(e.target.files)
            e.target.value = '' // 같은 파일 다시 올릴 수 있게
          }}
        />
        {uploading > 0 ? (
          <span className="mem__hint">올리는 중… {uploading}</span>
        ) : (
          <>
            <span className="mem__hint">사진·영상 끌어다 놓기</span>
            <span className="mem__sub">또는 눌러서 선택 · 촬영일로 계절이 정해져요</span>
          </>
        )}
      </div>

      {/* 색 지정 — 계절 자동을 덮어쓴다 */}
      <div className="mem__colors">
        <span className="mem__colors-label">
          색
          {custom ? (
            <em> 직접 지정</em>
          ) : auto?.source === 'season' ? (
            <em> 계절 자동</em>
          ) : (
            <em> 없음</em>
          )}
        </span>

        <div className="mem__swatches">
          {SEASON_KEYS.map((s: Season) => (
            <button
              key={s}
              className={`sw ${custom === SEASONS[s].color ? 'sw--on' : ''}`}
              style={{ background: SEASONS[s].color }}
              title={`${seasonLabel(s)} 색으로 지정`}
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
            <button className="mem__reset" onClick={() => setCustomColor(key, null)}>
              자동으로
            </button>
          )}
        </div>
      </div>

      {mine.length === 0 ? (
        <p className="sheet__empty">아직 추억이 없어요. 사진이나 영상을 올려보세요.</p>
      ) : (
        <ul className="mem__grid">
          {mine
            .slice()
            .sort((a, b) => b.capturedAt - a.capturedAt)
            .map((m) => (
              <li key={m.id} className="mem__item">
                <a href={m.fileUrl} target="_blank" rel="noreferrer">
                  {m.thumbUrl ? (
                    <img src={m.thumbUrl} alt={m.fileName} loading="lazy" />
                  ) : (
                    <div className="mem__noimg">{m.kind === 'video' ? '영상' : '사진'}</div>
                  )}
                </a>
                {m.kind === 'video' && <span className="mem__play">▶</span>}

                {/* 촬영 시각 워터마크 */}
                <span className="mem__stamp" style={{ background: SEASONS[m.season].color }}>
                  {fmtDate(m.capturedAt)}
                  {m.capturedSource === 'file' && <i title="EXIF 없음 — 파일 시각">*</i>}
                </span>

                <button className="mem__del" onClick={() => remove(m.id)} title="삭제">
                  ✕
                </button>
              </li>
            ))}
        </ul>
      )}
    </section>
  )
}
