import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import Loader from './components/Loader'
import Navigator from './components/Navigator'
import Onboarding from './components/Onboarding'
import SearchBox from './components/SearchBox'
import GlobeScene from './globe/GlobeScene'
import CountryMap from './map/CountryMap'
import { useCountries } from './lib/useCountries'
import { useVisitStore } from './store/useVisitStore'

export default function App() {
  const { status, list } = useCountries()
  const visitedCount = useVisitStore((s) => s.visitedCount())
  const total = list.length || 195

  return (
    <div className="app-root">
      <Canvas camera={{ position: [0, 0, 3], fov: 45, near: 0.1, far: 100 }} gl={{ antialias: true }}>
        <Suspense fallback={null}>
          <color attach="background" args={['#ffffff']} />
          {/* 흰 배경 + 검은 대륙: 음영이 지면 지저분해져 거의 평면광으로 둔다 */}
          <ambientLight intensity={1.6} />
          <directionalLight position={[5, 3, 5]} intensity={0.25} />
          <GlobeScene countries={status === 'ready' ? list : []} />
        </Suspense>
      </Canvas>

      <CountryMap />

      <SearchBox />

      <Navigator />

      <Loader />

      <Onboarding />

      {/* 좌하단 HUD */}
      <div className="hud">
        <span className="hud__title">Atlas</span>
        <span className="hud__hint">드래그 회전 · 휠 줌 · 나라 탭</span>
      </div>

      {/* 우상단 수집 현황 */}
      <div className="stats">
        <span className="stats__num">{visitedCount}</span>
        <span className="stats__den">/ {total}</span>
        <span className="stats__label">방문</span>
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
