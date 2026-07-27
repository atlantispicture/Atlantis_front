import { useMemo, useState } from 'react'
import { markOnboardingDone, onboardingDone, prefetchCountries } from '@/lib/geoCache'
import { useCountries, type CountryMeta } from '@/lib/useCountries'

/** 처음 고르기 쉽도록 앞에 띄우는 추천 목록 (한국 기준 인기 여행지) */
const SUGGESTED = [
  'JPN', 'CHN', 'VNM', 'THA', 'USA', 'PHL', 'TWN', 'SGP',
  'IDN', 'MYS', 'AUS', 'FRA', 'ITA', 'ESP', 'GBR', 'DEU',
]

/** 여행 스타일 — 나중에 추천·정렬에 쓰려고 받아 둔다 */
const STYLES = [
  { id: 'city', label: '도시 여행' },
  { id: 'nature', label: '자연·휴양' },
  { id: 'food', label: '미식' },
  { id: 'culture', label: '역사·문화' },
]

const TRIP_FREQ = ['연 1회 이하', '연 2~3회', '연 4회 이상']

const TOTAL_STEPS = 2

/**
 * 첫 실행 온보딩 — 자주 가는 나라를 고르면 그 나라 지역 데이터를 미리 받아둔다.
 *
 * 전체(21.4MB)를 다 받기엔 대부분 평생 안 열어보고, 나라마다 물어보기엔
 * 중앙값이 35KB라 묻는 게 더 성가시다. 그래서 '고른 것만 미리, 나머지는 조용히'.
 */
export default function Onboarding() {
  const { list, status } = useCountries()
  const [open, setOpen] = useState(() => !onboardingDone())
  const [step, setStep] = useState(1)

  const [picked, setPicked] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [style, setStyle] = useState<string>('city')
  const [freq, setFreq] = useState<string>('')
  const [freqOpen, setFreqOpen] = useState(false)
  const [nickname, setNickname] = useState('')

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const byCode = useMemo(() => new Map(list.map((c) => [c.code, c])), [list])

  const suggested = useMemo(
    () => SUGGESTED.map((c) => byCode.get(c)).filter(Boolean) as CountryMeta[],
    [byCode],
  )

  const found = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return list
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.nameEn.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [list, query])

  if (!open || status !== 'ready') return null

  const toggle = (code: string) =>
    setPicked((p) => (p.includes(code) ? p.filter((x) => x !== code) : [...p, code]))

  const finish = async () => {
    if (picked.length > 0) {
      setProgress({ done: 0, total: picked.length })
      await prefetchCountries(picked, (done, total) => setProgress({ done, total }))
    }
    markOnboardingDone(picked)
    setOpen(false)
  }

  const skip = () => {
    markOnboardingDone([])
    setOpen(false)
  }

  const onContinue = () => (step < TOTAL_STEPS ? setStep(step + 1) : finish())

  // 주신 디자인의 스텝 인디케이터 — 5칸을 진행도만큼 채운다
  const filledBars = Math.ceil((step / TOTAL_STEPS) * 5)

  return (
    <div className="onb">
      <div className="onb__card">
        {/* ── 왼쪽: 내용 ── */}
        <div className="onb__main">
          <div className="onb__body">
            <h1 className="onb__title">
              {step === 1 ? '어디를 자주 가시나요?' : '조금만 더 알려주세요'}
            </h1>
            <p className="onb__sub">
              {step === 1
                ? '고른 나라의 지역 데이터를 미리 받아둡니다. 나머지는 누를 때 알아서 받아요.'
                : '여행 스타일에 맞춰 지도와 추천을 다듬는 데 씁니다.'}
            </p>

            <div className="onb__divider" />

            {progress ? (
              <div className="onb__progress">
                <div className="onb__bar">
                  <span style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                </div>
                <span className="onb__count">
                  {progress.done} / {progress.total} 받는 중…
                </span>
              </div>
            ) : step === 1 ? (
              <div className="onb__grow">
                <p className="onb__label">자주 가는 나라</p>

                <input
                  className="onb__search"
                  placeholder="나라 검색 (예: 일본, Japan)"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />

                <div className="onb__chips">
                  {(found.length > 0 ? found : suggested).map((c) => {
                    const active = picked.includes(c.code)
                    return (
                      <button
                        key={c.code}
                        className={`chip ${active ? 'chip--on' : ''}`}
                        onClick={() => toggle(c.code)}
                      >
                        {active && <span className="chip__check">✓</span>}
                        {c.name}
                      </button>
                    )
                  })}
                </div>

                {/* 검색으로 고른 나라가 추천 목록 밖일 수 있어 따로 보여준다 */}
                {picked.some((c) => !SUGGESTED.includes(c)) && (
                  <div className="onb__chips onb__chips--extra">
                    {picked
                      .filter((c) => !SUGGESTED.includes(c))
                      .map((c) => (
                        <button key={c} className="chip chip--on" onClick={() => toggle(c)}>
                          <span className="chip__check">✓</span>
                          {byCode.get(c)?.name ?? c}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="onb__grow">
                <p className="onb__label">여행 스타일</p>
                <div className="onb__chips">
                  {STYLES.map((s) => (
                    <button
                      key={s.id}
                      className={`chip ${style === s.id ? 'chip--on' : ''}`}
                      onClick={() => setStyle(s.id)}
                    >
                      {style === s.id && <span className="chip__check">✓</span>}
                      {s.label}
                    </button>
                  ))}
                </div>

                <div className="onb__row">
                  <div className="onb__field">
                    <label className="onb__label">여행 빈도</label>
                    <div className="onb__selectwrap">
                      <button
                        type="button"
                        className="onb__select"
                        onClick={() => setFreqOpen(!freqOpen)}
                      >
                        <span>{freq || '선택하세요'}</span>
                        <i className={`onb__caret ${freqOpen ? 'onb__caret--up' : ''}`}>▾</i>
                      </button>
                      {freqOpen && (
                        <ul className="onb__options">
                          {TRIP_FREQ.map((o) => (
                            <li key={o}>
                              <button
                                type="button"
                                className="onb__option"
                                onClick={() => {
                                  setFreq(o)
                                  setFreqOpen(false)
                                }}
                              >
                                <span className={freq === o ? 'onb__option--on' : ''}>{o}</span>
                                {freq === o && <i>✓</i>}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="onb__field">
                    <label className="onb__label">닉네임</label>
                    <input
                      className="onb__input"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder="예: 여행하는 재윤"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── 하단: 스텝 + Continue ── */}
          {!progress && (
            <div className="onb__footer">
              <div className="onb__steps">
                <span>
                  STEP {step} / {TOTAL_STEPS}
                </span>
                <div className="onb__bars">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} className={i < filledBars ? 'on' : ''} />
                  ))}
                </div>
              </div>

              <div className="onb__actions">
                <button className="onb__skip" onClick={skip}>
                  건너뛰기
                </button>
                <button className="onb__go" onClick={onContinue}>
                  {step < TOTAL_STEPS
                    ? '다음'
                    : picked.length > 0
                      ? `${picked.length}개 준비하고 시작`
                      : '시작하기'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── 오른쪽: 이미지 자리 (외부 이미지 대신 지구본 모티프) ── */}
        <div className="onb__aside" aria-hidden="true">
          <div className="onb__globe">
            {/* 경위선만으로 지구본을 암시 — 흑백 테마와 맞춘 순수 SVG */}
            <svg viewBox="0 0 200 200" width="100%" height="100%">
              <circle cx="100" cy="100" r="78" className="g-sphere" />
              {[0.25, 0.5, 0.75].map((t, i) => (
                <ellipse key={i} cx="100" cy="100" rx={78 * Math.sin(Math.PI * t)} ry="78" />
              ))}
              {[-52, -26, 0, 26, 52].map((dy, i) => (
                <ellipse key={i} cx="100" cy={100 + dy} rx={Math.sqrt(Math.max(0, 78 * 78 - dy * dy))} ry="7" />
              ))}
            </svg>
          </div>
          <p className="onb__aside-text">
            다녀온 곳이 계절색으로 물듭니다
          </p>
        </div>
      </div>
    </div>
  )
}
