import { useCallback, useEffect, useRef, useState } from 'react'
import type { MemoryView } from '@/lib/memoryDb'
import { loadOriginal } from '@/lib/memorySync'
import { SEASONS, seasonLabel } from '@/lib/season'

const fmtFull = (ms: number) =>
  new Date(ms).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

interface Props {
  items: MemoryView[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
  onDelete?: (id: string) => void
  /** 어디서 찍은 것인지 (나라/지역 이름) */
  place?: string
}

/**
 * 사진·영상 뷰어. 목록에서 하나를 누르면 전체 화면으로 띄운다.
 * ← → 로 이동, Esc 로 닫기.
 */
export default function MemoryViewer({
  items,
  index,
  onIndex,
  onClose,
  onDelete,
  place,
}: Props) {
  const item = items[index]

  // 스와이프 — 모바일에서 좌우 버튼만으로는 사진 넘기기가 불편하다
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const stripRef = useRef<HTMLUListElement>(null)
  // 이동 거리는 ref 가 정답 — state 만 쓰면 pointerup 이 갱신 전 값을 본다.
  // state 는 화면(transform) 표시에만 쓴다.
  const dragXRef = useRef(0)
  const [dragX, setDragX] = useState(0)
  // 서버 항목의 원본 objectURL 캐시 (id → url)
  const [resolved, setResolved] = useState<Record<string, string>>({})
  const SWIPE_MIN = 60 // 이보다 적게 밀면 제자리로 되돌린다

  const go = useCallback(
    (delta: number) => {
      if (items.length === 0) return
      // 끝에서 반대편으로 순환
      onIndex((index + delta + items.length) % items.length)
    },
    [index, items.length, onIndex],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  // 삭제 등으로 목록이 줄면 인덱스를 범위 안으로 되돌린다 (마지막 장을 지우면 닫는다).
  useEffect(() => {
    if (items.length === 0) onClose()
    else if (index > items.length - 1) onIndex(items.length - 1)
  }, [items.length, index, onClose, onIndex])

  /**
   * 서버에만 있는 항목은 원본을 인증 요청으로 받아야 한다 (<img src> 는 헤더를 못 싣는다).
   * 목록을 열 때 미리 받으면 수십 MB 를 낭비하므로, 실제로 볼 때 한 번만 받아 캐시한다.
   */
  useEffect(() => {
    if (!item?.remote) return
    if (resolved[item.id]) return
    let alive = true
    loadOriginal(item.fileUrl).then((url) => {
      if (alive && url) setResolved((m) => ({ ...m, [item.id]: url }))
    })
    return () => {
      alive = false
    }
  }, [item, resolved])

  // 현재 사진의 썸네일이 필름스트립 밖으로 나가지 않게 따라 스크롤
  useEffect(() => {
    stripRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [index])

  if (!item) return null

  // 로컬 항목은 fileUrl 이 이미 objectURL, 서버 항목은 받아온 것을 쓴다
  const src = item.remote ? resolved[item.id] : item.fileUrl

  return (
    <div className="viewer" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="viewer__stage"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          if (item.kind === 'video') return // 영상은 컨트롤 조작을 방해하지 않는다
          dragStart.current = { x: e.clientX, y: e.clientY }
          dragXRef.current = 0
        }}
        onPointerMove={(e) => {
          if (!dragStart.current) return
          const dx = e.clientX - dragStart.current.x
          // 세로로 더 많이 움직이면 스크롤 의도로 보고 무시
          if (Math.abs(e.clientY - dragStart.current.y) > Math.abs(dx)) return
          dragXRef.current = dx
          setDragX(dx)
        }}
        onPointerUp={() => {
          const dx = dragXRef.current
          if (Math.abs(dx) > SWIPE_MIN) go(dx < 0 ? 1 : -1)
          dragStart.current = null
          dragXRef.current = 0
          setDragX(0)
        }}
        onPointerCancel={() => {
          dragStart.current = null
          dragXRef.current = 0
          setDragX(0)
        }}
      >
        {item.kind === 'video' ? (
          // key 를 줘야 항목이 바뀔 때 이전 영상이 계속 재생되지 않는다
          <video key={item.id} src={src} controls autoPlay className="viewer__media" />
        ) : !src ? (
          <div className="viewer__loading">불러오는 중…</div>
        ) : (
          <img
            key={item.id}
            src={src}
            alt={item.fileName}
            className="viewer__media"
            draggable={false}
            style={{
              transform: `translateX(${dragX}px)`,
              transition: dragX ? 'none' : 'transform 0.22s cubic-bezier(0.22,1,0.36,1)',
            }}
          />
        )}
      </div>

      {/* 상단 정보 */}
      <div className="viewer__bar viewer__bar--top" onClick={(e) => e.stopPropagation()}>
        <div className="viewer__meta">
          <span className="viewer__date">{fmtFull(item.capturedAt)}</span>
          <span className="viewer__sub">
            {place && <span>{place} · </span>}
            <span
              className="viewer__season"
              style={{ background: SEASONS[item.season].color }}
            >
              {seasonLabel(item.season)}
            </span>
            {item.capturedSource === 'file' && (
              <span className="viewer__warn" title="EXIF 촬영정보가 없어 파일 시각으로 표시">
                촬영일 추정
              </span>
            )}
          </span>
        </div>

        <div className="viewer__tools">
          {onDelete && (
            // 인덱스 보정은 위 effect 가 목록 변화를 보고 처리한다
            <button className="viewer__btn" onClick={() => onDelete(item.id)}>
              삭제
            </button>
          )}
          <button className="viewer__btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
      </div>

      {/* 좌우 이동 */}
      {items.length > 1 && (
        <>
          <button
            className="viewer__nav viewer__nav--prev"
            onClick={(e) => {
              e.stopPropagation()
              go(-1)
            }}
            aria-label="이전"
          >
            ‹
          </button>
          <button
            className="viewer__nav viewer__nav--next"
            onClick={(e) => {
              e.stopPropagation()
              go(1)
            }}
            aria-label="다음"
          >
            ›
          </button>
          {/* 필름스트립 — 몇 장이 있고 지금 어디인지 한눈에 */}
          <div className="viewer__strip" onClick={(e) => e.stopPropagation()}>
            <div className="viewer__count">
              {index + 1} / {items.length}
            </div>
            <ul className="viewer__thumbs" ref={stripRef}>
              {items.map((m, i) => (
                <li key={m.id}>
                  <button
                    className={`viewer__thumb ${i === index ? 'viewer__thumb--on' : ''}`}
                    data-active={i === index}
                    onClick={() => onIndex(i)}
                    aria-label={`${i + 1}번째 사진`}
                  >
                    {m.thumbUrl ? (
                      <img src={m.thumbUrl} alt="" />
                    ) : (
                      <span className="viewer__thumb-none">
                        {m.kind === 'video' ? '▶' : '—'}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
