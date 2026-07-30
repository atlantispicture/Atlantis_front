import { useFrame, useThree } from '@react-three/fiber'
import { geoContains } from 'd3-geo'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { unitToLngLat } from '@/lib/geo'
import type { CountryMeta } from '@/lib/useCountries'
import { useRegions } from '@/lib/useRegions'
import { useVisitStore } from '@/store/useVisitStore'
import Atmosphere from './Atmosphere'
import CountryMeshes from './CountryMeshes'
import PlaceCallouts from './PlaceCallouts'
import RegionMeshes from './RegionMeshes'
import WorldLines from './WorldLines'
import WorldBorders from './WorldBorders'

const DIST_DEFAULT = 3
const DIST_COUNTRY = 1.85
const DIST_REGION = 1.45 // 행정구역(도/현/주) 선택 시
const DIST_CITY = 1.28 // 도시 선택 시 — 가장 깊이
const DIST_MIN = 1.25 // 작은 나라도 들여다볼 수 있게 조금 더 가깝게
const DIST_MAX = 5
const ZOOM_STEP = 1.12 // 휠 한 칸당 배율 (클수록 빠름)
// 화면 폭 전체를 한 번 쓸면 이만큼(라디안) 돈다 ≈ 195°.
// 픽셀당 고정값이 아니라 '화면 비율' 기준이라 폰이든 데스크톱이든 감각이 같다.
const SWIPE_TURN = 3.4
const REF_WIDTH = 1280 // 폭을 못 읽을 때의 대체값
// 확대 상태의 감도를 추가로 눌러주는 지수. 1이면 물리적으로 정확한 값 그대로,
// 클수록 확대했을 때만 더 둔해진다 (기본 거리에서는 영향 없음).
const ZOOM_DAMP = 1.4
const INERTIA_DECAY = 3.4 // 관성 감쇠 (클수록 빨리 멈춤)
const INERTIA_MIN = 0.02 // 이보다 느려지면 멈춘 것으로 본다
const PITCH_LIMIT = 1.4 // 극점 뒤집힘 방지
const IDLE_MS = 2500 // 이 시간 무입력이면 자동 회전 재개
const IDLE_SPEED = 0.035
const AXIS_Y = new THREE.Vector3(0, 1, 0)
const AXIS_X = new THREE.Vector3(1, 0, 0)
const _pick = new THREE.Vector3() // 픽킹 재사용 임시 벡터

const DEG2RAD = Math.PI / 180

/**
 * 나라 중심(lng,lat)을 정면(+Z, 카메라 쪽)으로 가져오는 yaw/pitch.
 *
 * 회전 합성은 q = Rx(pitch)·Ry(yaw) — 지구를 '자기 축으로 경도만큼 돌린 뒤',
 * 세계 X축으로 '위도만큼 기울인다'. 이 순서에서는 북극이 항상 화면 위를 향해
 * 롤(roll)이 원천적으로 생기지 않는다.
 *
 * lngLatToVector3 규약(theta = lng + 180)에서 정확해는:
 *   yaw = 90° - theta = -90° - lng,   pitch = lat
 */
function yawPitchToFront(lng: number, lat: number): { yaw: number; pitch: number } {
  return {
    yaw: (-90 - lng) * DEG2RAD,
    pitch: lat * DEG2RAD,
  }
}

/** target 을 cur 에서 ±π 이내 최단 경로로 맞춘다 (한 바퀴 도는 것 방지). */
function shortestAngle(cur: number, target: number): number {
  let t = target
  while (t - cur > Math.PI) t -= Math.PI * 2
  while (t - cur < -Math.PI) t += Math.PI * 2
  return t
}

export default function GlobeScene({ countries }: { countries: CountryMeta[] }) {
  const { camera, gl } = useThree()
  const groupRef = useRef<THREE.Group>(null)

  // 회전 상태 (yaw/pitch 스칼라 — 롤 없음)
  const yaw = useRef(0)
  const pitch = useRef(0)
  const targetYaw = useRef(0)
  const targetPitch = useRef(0)
  const targetDist = useRef(DIST_DEFAULT)

  const pointerDown = useRef(false)
  const dragging = useRef(false)
  const last = useRef({ x: 0, y: 0 })
  const lastInteract = useRef(0)

  // 멀티터치 추적 (핀치 줌) + 관성
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchStart = useRef<{ dist: number; dist0: number } | null>(null)
  const velYaw = useRef(0)
  const velPitch = useRef(0)
  const lastMoveAt = useRef(0)

  const select = useVisitStore((s) => s.select)
  const selectRegion = useVisitStore((s) => s.selectRegion)
  const selected = useVisitStore((s) => s.selected)
  const selectedRegion = useVisitStore((s) => s.selectedRegion)
  const phase = useVisitStore((s) => s.phase)

  // 호버 대상 코드 — 나라 단계면 나라 코드, 나라를 연 상태면 지역 코드
  const [hovered, setHovered] = useState<string | null>(null)

  // 나라를 열면 그 나라의 행정구역을 받아와 블록으로 쪼개 그린다.
  const { regions } = useRegions(selected?.code)

  // 나라 상세 단계에서만 지역 블록으로 대체 — 지구본으로 나오면 원래 나라 덩어리로.
  const showRegions = phase === 'country' && !!selected && regions.length > 0

  const markInteract = () => (lastInteract.current = performance.now())

  /** 커서가 맞은 구 표면 지점(월드) → 지구 로컬 위경도. */
  const toLngLat = (worldPoint: THREE.Vector3): [number, number] | null => {
    const g = groupRef.current
    if (!g) return null
    g.worldToLocal(_pick.copy(worldPoint)).normalize()
    return unitToLngLat(_pick)
  }

  /**
   * 위경도 → geoContains 로 나라 판정.
   * 평면 삼각형 메시가 아니라 '구면 정확 판정'이라 이웃 나라 오선택이 없다.
   */
  const countryAt = (lngLat: [number, number]): CountryMeta | null =>
    countries.find((c) => geoContains(c.feature as never, lngLat)) ?? null

  /** 열려 있는 나라 안에서의 행정구역 판정. */
  const regionAt = (lngLat: [number, number]) =>
    regions.find((r) => geoContains(r.geometry as never, lngLat)) ?? null

  /** 해당 좌표가 특정 나라 안인지 — '나라 안쪽 클릭'과 '다른 나라 클릭'을 가른다. */
  const geoContainsCountry = (code: string, lngLat: [number, number]) => {
    const c = countries.find((x) => x.code === code)
    return !!c && geoContains(c.feature as never, lngLat)
  }

  // 선택/단계 변화 → 카메라·회전 목표 갱신.
  // 지역(행정구역/도시)이 선택되면 그쪽으로 더 깊이 들어간다.
  useEffect(() => {
    if (phase !== 'country' || !selected) {
      targetDist.current = DIST_DEFAULT
      return
    }
    const target = selectedRegion ?? selected
    const { yaw: ty, pitch: tp } = yawPitchToFront(target.centroid[0], target.centroid[1])
    targetYaw.current = shortestAngle(yaw.current, ty)
    targetPitch.current = tp
    targetDist.current = !selectedRegion
      ? DIST_COUNTRY
      : selectedRegion.kind === 'city'
        ? DIST_CITY
        : DIST_REGION
    markInteract()
  }, [phase, selected, selectedRegion])

  // 드래그 회전(관성 포함) + 핀치/휠 줌
  useEffect(() => {
    const el = gl.domElement

    /**
     * 감도 = 화면 폭 비율 × 줌 보정.
     *
     * 확대하면 지구가 화면에서 커지므로, 같은 픽셀 이동이 더 작은 각도에 해당해야
     * 손가락 아래의 지점이 그대로 따라온다. 화면상 반지름은 asin(1/d) 에 비례하니
     * 라디안/픽셀은 그 역수에 비례한다. 기본 거리(3)에서 1이 되도록 정규화한다.
     */
    const sensitivity = () => {
      const base = SWIPE_TURN / (el.clientWidth || REF_WIDTH)
      const d = THREE.MathUtils.clamp(camera.position.z, DIST_MIN, DIST_MAX)
      const zoom = Math.asin(1 / DIST_DEFAULT) / Math.asin(1 / d)
      // 물리적으로 정확한 값(zoom)만으로는 확대 상태가 아직 예민하게 느껴져
      // 지수를 얹어 더 눌러준다. 기본 거리에서는 zoom=1 이라 영향이 없다.
      return base * Math.pow(zoom, ZOOM_DAMP)
    }

    /** 두 손가락 사이 거리 — 핀치 줌 판정용 */
    const pinchDistance = () => {
      const pts = [...pointers.current.values()]
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
    }

    const onDown = (e: PointerEvent) => {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      // 캡처해 두면 손가락이 캔버스 밖으로 나가도 추적이 끊기지 않는다
      el.setPointerCapture?.(e.pointerId)

      if (pointers.current.size === 2) {
        pinchStart.current = { dist: pinchDistance(), dist0: targetDist.current }
      }
      pointerDown.current = true
      dragging.current = false
      velYaw.current = 0
      velPitch.current = 0
      last.current = { x: e.clientX, y: e.clientY }
      markInteract()
    }

    const onMove = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

      // 두 손가락 → 핀치 줌 (모바일엔 휠이 없다)
      if (pointers.current.size >= 2 && pinchStart.current) {
        const ratio = pinchStart.current.dist / Math.max(pinchDistance(), 1)
        targetDist.current = THREE.MathUtils.clamp(
          pinchStart.current.dist0 * ratio,
          DIST_MIN,
          DIST_MAX,
        )
        dragging.current = true // 핀치 후 탭으로 오인해 선택되지 않게
        markInteract()
        return
      }

      const dx = e.clientX - last.current.x
      const dy = e.clientY - last.current.y
      if (Math.abs(dx) + Math.abs(dy) > 3) dragging.current = true
      last.current = { x: e.clientX, y: e.clientY }

      const s = sensitivity()
      targetYaw.current += dx * s
      targetPitch.current = THREE.MathUtils.clamp(
        targetPitch.current + dy * s,
        -PITCH_LIMIT,
        PITCH_LIMIT,
      )

      // 손을 뗀 뒤 이어서 굴러가도록 속도를 기억한다 (초당 라디안)
      const now = performance.now()
      const dt = Math.max(now - lastMoveAt.current, 1) / 1000
      lastMoveAt.current = now
      velYaw.current = (dx * s) / dt
      velPitch.current = (dy * s) / dt

      markInteract()
    }

    const onUp = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId)
      el.releasePointerCapture?.(e.pointerId)
      if (pointers.current.size < 2) pinchStart.current = null
      if (pointers.current.size === 0) {
        pointerDown.current = false
        // 마지막 움직임이 오래됐으면 관성을 주지 않는다 (멈춘 채 떼는 경우)
        if (performance.now() - lastMoveAt.current > 90) {
          velYaw.current = 0
          velPitch.current = 0
        }
      } else {
        // 한 손가락만 남으면 그 지점부터 다시 시작 (튐 방지)
        const rest = [...pointers.current.values()][0]
        last.current = { x: rest.x, y: rest.y }
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      // deltaMode 정규화: 0=픽셀, 1=줄, 2=페이지 — 휠/트랙패드마다 단위가 달라서 맞춰준다.
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1
      const steps = THREE.MathUtils.clamp((e.deltaY * unit) / 100, -3, 3) // 한 번에 과도한 점프 방지
      // 배율(지수) 줌 — 가깝든 멀든 '한 칸'의 체감이 같다.
      targetDist.current = THREE.MathUtils.clamp(
        targetDist.current * Math.pow(ZOOM_STEP, steps),
        DIST_MIN,
        DIST_MAX,
      )
      markInteract()
    }

    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    // 브라우저가 제스처를 가로채면(스크롤 전환 등) pointercancel 이 온다 — 같이 정리한다
    window.addEventListener('pointercancel', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      el.removeEventListener('wheel', onWheel)
    }
  }, [gl, camera])

  useFrame((_, delta) => {
    const g = groupRef.current
    if (!g) return

    // 손을 뗀 뒤 이어서 굴러가는 관성 — 모바일 플릭 조작의 핵심
    const spinning = Math.abs(velYaw.current) > INERTIA_MIN || Math.abs(velPitch.current) > INERTIA_MIN
    if (!pointerDown.current && spinning) {
      targetYaw.current += velYaw.current * delta
      targetPitch.current = THREE.MathUtils.clamp(
        targetPitch.current + velPitch.current * delta,
        -PITCH_LIMIT,
        PITCH_LIMIT,
      )
      // 프레임률과 무관한 지수 감쇠
      const decay = Math.exp(-INERTIA_DECAY * delta)
      velYaw.current *= decay
      velPitch.current *= decay
      markInteract() // 관성이 도는 동안엔 자동 자전이 끼어들지 않게
    } else if (spinning === false && velYaw.current !== 0) {
      velYaw.current = 0
      velPitch.current = 0
    }

    // 홈에서 일정 시간 무입력이면 천천히 자전
    if (phase === 'globe' && performance.now() - lastInteract.current > IDLE_MS) {
      targetYaw.current += IDLE_SPEED * delta
    }

    // 프레임률 독립 감쇠
    yaw.current = THREE.MathUtils.damp(yaw.current, targetYaw.current, 7, delta)
    pitch.current = THREE.MathUtils.damp(pitch.current, targetPitch.current, 7, delta)

    // Rx(pitch)·Ry(yaw) — 자기 축으로 경도 회전 후 위도만큼 기울임.
    // 이 순서라야 북극이 항상 화면 위를 향해 롤(기울어짐)이 생기지 않는다.
    const qYaw = new THREE.Quaternion().setFromAxisAngle(AXIS_Y, yaw.current)
    const qPitch = new THREE.Quaternion().setFromAxisAngle(AXIS_X, pitch.current)
    g.quaternion.copy(qPitch).multiply(qYaw)

    camera.position.z = THREE.MathUtils.damp(camera.position.z, targetDist.current, 6, delta)
    camera.lookAt(0, 0, 0)
  })

  return (
    <group ref={groupRef}>
      {/* 바다 구 (반지름 0.997 — 채색 메시 1.004 아래). 픽킹 전담. */}
      <mesh
        onClick={(e) => {
          e.stopPropagation()
          if (dragging.current) return // 드래그였으면 선택 안 함
          const lngLat = toLngLat(e.point)
          if (!lngLat) return

          // 나라를 이미 연 상태에서 그 나라 안을 누르면 '지역'을 고른다.
          if (showRegions && geoContainsCountry(selected!.code, lngLat)) {
            const r = regionAt(lngLat)
            if (r) {
              selectRegion({
                code: r.code,
                name: r.name,
                countryCode: selected.code,
                centroid: [r.lng, r.lat],
                kind: 'region',
              })
            }
            return
          }

          const meta = countryAt(lngLat)
          if (meta) select({ code: meta.code, name: meta.name, centroid: meta.centroid })
        }}
        onPointerMove={(e) => {
          if (pointerDown.current) return // 회전 중엔 호버 갱신 안 함
          const lngLat = toLngLat(e.point)
          if (!lngLat) return
          // 나라를 연 상태면 지역 단위로, 아니면 나라 단위로 호버
          const code =
            showRegions && geoContainsCountry(selected!.code, lngLat)
              ? (regionAt(lngLat)?.code ?? null)
              : (countryAt(lngLat)?.code ?? null)
          setHovered(code)
          document.body.style.cursor = code ? 'pointer' : 'auto'
        }}
        onPointerOut={() => {
          setHovered(null)
          document.body.style.cursor = 'auto'
        }}
      >
        <sphereGeometry args={[0.997, 96, 96]} />
        {/* 순백 바다 — 뒷면이 비치면 선이 겹쳐 지저분해지므로 불투명 */}
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      <CountryMeshes
        countries={countries}
        hoveredCode={hovered}
        hiddenCode={showRegions ? selected!.code : null}
      />

      {/* 전 세계 지역 경계선 — 처음부터 나라가 지역 단위로 나뉘어 보이게 한다.
          나라를 열면 그 나라는 고해상도 블록이 대신 그리므로 잠시 감춘다. */}
      <WorldBorders visible={!showRegions} />

      {/* 전 세계 지역 경계선 — 나라를 열지 않아도 지구본이 나뉘어 보이게 */}
      <WorldLines />

      {/* 나라를 연 동안에만 행정구역 블록으로 대체한다 */}
      {showRegions && <RegionMeshes regions={regions} hoveredCode={hovered} />}

      {/* 추억이 있는 곳에 지시선 + 대표 사진 카드 */}
      {phase === 'country' && <PlaceCallouts />}
      <Atmosphere />
    </group>
  )
}
