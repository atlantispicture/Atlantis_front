import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/store/useAuthStore'
import { useCountries } from '@/lib/useCountries'
import { useSocialStore } from '@/store/useSocialStore'
import { useVisitStore } from '@/store/useVisitStore'
import FriendsModal from './FriendsModal'
import ProfileModal from './ProfileModal'

type Panel = 'menu' | 'login' | null

/**
 * 상단 메뉴바 — 방문 현황과 계정을 한 줄에 모은다.
 *
 * 이전에는 카운터·로그인 배지가 각자 떠 있어 좁은 화면에서 검색창을 덮었다.
 * 메뉴는 눌렀을 때만 펼쳐지는 인라인 방식이라 평소에는 지구본을 가리지 않는다.
 */
export default function TopBar() {
  const { list } = useCountries()
  const visitedCount = useVisitStore((s) => s.visitedCount())
  const total = list.length || 195

  const server = useAuthStore((s) => s.server)
  const handle = useAuthStore((s) => s.handle)
  const loggingIn = useAuthStore((s) => s.loggingIn)
  const error = useAuthStore((s) => s.error)
  const checkServer = useAuthStore((s) => s.checkServer)
  const login = useAuthStore((s) => s.login)
  const logout = useAuthStore((s) => s.logout)
  const resetSocial = useSocialStore((s) => s.reset)

  const [panel, setPanel] = useState<Panel>(null)
  const [modal, setModal] = useState<'profile' | 'friends' | null>(null)
  const [input, setInput] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    checkServer()
  }, [checkServer])

  // 바깥을 누르면 닫는다
  useEffect(() => {
    if (!panel) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPanel(null)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [panel])

  const onAccount = () => {
    if (server === 'offline') return void checkServer()
    setPanel(panel ? null : handle ? 'menu' : 'login')
  }

  const submit = async () => {
    if (!input.trim()) return
    if (await login(input.trim())) {
      setPanel(null)
      setInput('')
    }
  }

  return (
    <div className="top" ref={rootRef}>
      <div className="top__bar">
        {/* 수집 현황 */}
        <div className="top__stat" title="방문한 나라">
          <b>{visitedCount}</b>
          <span>/ {total}</span>
        </div>

        <span className="top__div" />

        {/* 계정 */}
        <button className="top__account" onClick={onAccount}>
          <span className={`top__dot top__dot--${server}`} />
          {server === 'offline' ? '로컬' : (handle ?? '로그인')}
        </button>
      </div>

      {panel === 'login' && (
        <div className="top__panel">
          <p className="top__msg">핸들만 입력하면 계정이 만들어집니다 (개발용)</p>
          <input
            className="top__input"
            placeholder="예: jaeyoon"
            value={input}
            autoFocus
            onChange={(e) => setInput(e.target.value.toLowerCase())}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          {error && <p className="top__err">{error}</p>}
          <button className="top__go" disabled={!input.trim() || loggingIn} onClick={submit}>
            {loggingIn ? '접속 중…' : '시작'}
          </button>
        </div>
      )}

      {panel === 'menu' && (
        <div className="top__panel top__panel--menu">
          <div className="top__who">
            <span className="top__avatar">{handle?.[0]?.toUpperCase()}</span>
            <span className="top__handle">@{handle}</span>
          </div>

          <button
            className="top__item"
            onClick={() => {
              setModal('profile')
              setPanel(null)
            }}
          >
            마이페이지
          </button>
          <button
            className="top__item"
            onClick={() => {
              setModal('friends')
              setPanel(null)
            }}
          >
            친구
          </button>

          <button
            className="top__item top__item--danger"
            onClick={() => {
              logout()
              resetSocial()
              setPanel(null)
            }}
          >
            로그아웃
          </button>
        </div>
      )}

      {modal === 'profile' && <ProfileModal onClose={() => setModal(null)} />}
      {modal === 'friends' && <FriendsModal onClose={() => setModal(null)} />}
    </div>
  )
}
