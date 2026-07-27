import { useEffect, useMemo, useRef, useState } from 'react'

export interface ComboOption {
  value: string
  label: string
  /** 라벨 외 추가 검색어 (영문명·코드 등) */
  keywords?: string
  /** 묶음 제목 — 연속된 같은 group 끼리 헤더를 얹는다 */
  group?: string
  /** 방문 표시 등 앞에 붙는 체크 */
  marked?: boolean
}

interface Props {
  value: string
  options: ComboOption[]
  placeholder: string
  ariaLabel: string
  disabled?: boolean
  emptyText?: string
  onChange: (value: string) => void
}

/**
 * 입력 가능한 드롭다운(콤보박스).
 * 항목이 100개를 넘는 경우가 있어(카자흐스탄 지역 113개) 네이티브 <select> 대신
 * 타이핑으로 걸러 쓰는 목록을 직접 그린다.
 */
export default function Combo({
  value,
  options,
  placeholder,
  ariaLabel,
  disabled,
  emptyText = '결과 없음',
  onChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selectedLabel = options.find((o) => o.value === value)?.label ?? ''

  // 열려서 타이핑 중일 때만 query 를 보여주고, 평소엔 선택된 라벨을 보여준다.
  const shown = open ? query : selectedLabel

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!open || !q) return options
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || (o.keywords ?? '').toLowerCase().includes(q),
    )
  }, [options, query, open])

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  // 활성 항목을 보이는 영역으로 스크롤
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  const pick = (opt: ComboOption | undefined) => {
    if (!opt) return
    onChange(opt.value)
    close()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return setOpen(true)
      const dir = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => Math.min(Math.max(i + dir, 0), filtered.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (open) pick(filtered[active])
      else setOpen(true)
    } else if (e.key === 'Escape') {
      close()
    }
  }

  let lastGroup: string | undefined

  return (
    <div className="combo" ref={rootRef}>
      <input
        className="combo__input"
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={shown}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          if (!open) setOpen(true)
        }}
        onFocus={() => {
          setOpen(true)
          setActive(Math.max(0, filtered.findIndex((o) => o.value === value)))
        }}
        onKeyDown={onKeyDown}
      />

      {value && !disabled && (
        <button
          className="combo__clear"
          onClick={() => {
            onChange('')
            close()
          }}
          aria-label={`${ariaLabel} 지우기`}
          tabIndex={-1}
        >
          ✕
        </button>
      )}

      {open && (
        <ul className="combo__list" ref={listRef} role="listbox">
          {filtered.length === 0 && <li className="combo__empty">{emptyText}</li>}
          {filtered.map((o, i) => {
            const header = o.group && o.group !== lastGroup ? o.group : null
            lastGroup = o.group
            return (
              <li key={o.value}>
                {header && <div className="combo__group">{header}</div>}
                <div
                  role="option"
                  aria-selected={o.value === value}
                  data-active={i === active}
                  className={`combo__item ${i === active ? 'combo__item--active' : ''}`}
                  onPointerEnter={() => setActive(i)}
                  // pointerdown 으로 처리 — input 의 blur 보다 먼저 걸리게
                  onPointerDown={(e) => {
                    e.preventDefault()
                    pick(o)
                  }}
                >
                  {o.marked && <span className="combo__check">✓</span>}
                  <span className="combo__label">{o.label}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
