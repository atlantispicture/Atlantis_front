import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import Loader from './components/Loader'
import Navigator from './components/Navigator'
import Onboarding from './components/Onboarding'
import TopBar from './components/TopBar'
import VisitTree from './components/VisitTree'
import GlobeScene from './globe/GlobeScene'
import PlaceBubble from './components/PlaceBubble'
import { useCountries } from './lib/useCountries'
import { useVisitStore } from './store/useVisitStore'

export default function App() {
  const { status, list } = useCountries()
  // 수집 현황은 TopBar 가 표시한다

  // 말풍선이 떠 있으면 화면 아래 요소들을 비켜준다.
  // CSS :has() 로도 되지만 동적으로 붙는 요소에선 스타일 재계산이 누락되는
  // 브라우저가 있어, 클래스로 직접 표시한다.
  const bubbleOpen = useVisitStore((s) => s.phase === 'country' && !!s.selected)

  return (
    <div className={`app-root ${bubbleOpen ? 'app-root--bubble' : ''}`}>
      <Canvas camera={{ position: [0, 0, 3], fov: 45, near: 0.1, far: 100 }} gl={{ antialias: true }}>
        <Suspense fallback={null}>
          <color attach="background" args={['#ffffff']} />
          {/* 라인아트라 모든 면이 무광(meshBasicMaterial)이다 — 조명은 쓰지 않는다.
              음영이 지면 바다와 육지의 흰색이 어긋나 보인다. */}
          <GlobeScene countries={status === 'ready' ? list : []} />
        </Suspense>
      </Canvas>

      <PlaceBubble />

      {/* 검색은 Navigator(필터) 안으로 들어갔다 — 같은 '어디를 볼까' 맥락 */}
      <Navigator />

      <Loader />

      <Onboarding />

      <VisitTree />

      <TopBar />

      {/* 좌하단 HUD */}
      <div className="hud">
        <span className="hud__title">Atlas</span>
        <span className="hud__hint">드래그 회전 · 휠 줌 · 나라 탭</span>
      </div>


      {/* 데이터 로딩 상태 안내 */}
      {status !== 'ready' && (
        <div className="banner">
          {status === 'loading' && '국가 데이터 불러오는 중…'}
          {status === 'missing' && (
            <>
              국가 데이터가 없어요. 터미널에서 <code>npm run fetch-data</code> 실행 후 새로고침하세요.
            </>
          )}
          {status === 'error' && '국가 데이터 로드 실패 — 콘솔을 확인하세요.'}
        </div>
      )}
    </div>
  )
}
