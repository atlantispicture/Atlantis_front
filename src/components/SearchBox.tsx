import { useMemo, useState } from 'react'
import { useCountries, type CountryMeta } from '@/lib/useCountries'
import { useVisitStore } from '@/store/useVisitStore'

const MAX_RESULTS = 7

export default function SearchBox() {
  const { list, status } = useCountries()
  const select = useVisitStore((s) => s.select)
  const visits = useVisitStore((s) => s.visits)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const results = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return []
    return list
      .filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          c.nameEn.toLowerCase().includes(term) ||
          c.code.toLowerCase().includes(term),
      )
      .slice(0, MAX_RESULTS)
  }, [q, list])

  const choose = (c: CountryMeta) => {
    select({ code: c.code, name: c.name, centroid: c.centroid })
    setQ('')
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!results.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(results[active])
    } else if (e.key === 'Escape') {
      setQ('')
      setOpen(false)
    }
  }

  if (status !== 'ready') return null

  return (
    <div className="search">
      <div className="search__box">
        <span className="search__icon">🔍</span>
        <input
          className="search__input"
          type="text"
          placeholder="나라 검색 (예: 일본, Japan, JPN)"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
      </div>

      {open && results.length > 0 && (
        <ul className="search__list">
          {results.map((c, i) => (
            <li
              key={c.code}
              className={`search__item ${i === active ? 'search__item--active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(c)
              }}
            >
              <span className="search__name">{c.name}</span>
              {visits[c.code]?.visited && <span className="search__badge">방문</span>}
              <span className="search__code">{c.code}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
