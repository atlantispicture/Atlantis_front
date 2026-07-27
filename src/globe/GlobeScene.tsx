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
import RegionMeshes from './RegionMeshes'

const DIST_DEFAULT = 3
const DIST_COUNTRY = 1.85
const DIST_REGION = 1.45 // 행정구역(도/현/주) 선택 시
const DIST_CITY = 1.28 // 도시 선택 시 — 가장 깊이
const DIST_MIN = 1.25 // 작은 나라도 들여다볼 수 있게 조금 더 가깝게
const DIST_MAX = 5
const ZOOM_STEP = 1.12 // 휠 한 칸당 배율 (클수록 빠름)
const DRAG_SENS = 0.006
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

  // 드래그 회전 + 휠 줌
  useEffect(() => {
    const el = gl.domElement

    const onDown = (e: PointerEvent) => {
      pointerDown.current = true
      dragging.current = false
      last.current = { x: e.clientX, y: e.clientY }
      markInteract()
    }
    const onMove = (e: PointerEvent) => {
      if (!pointerDown.current) return
      if (useVisitStore.getState().phase === 'country') return // 상세 중엔 회전 잠금
      const dx = e.clientX - last.current.x
      const dy = e.clientY - last.current.y
      if (Math.abs(dx) + Math.abs(dy) > 3) dragging.current = true
      last.current = { x: e.clientX, y: e.clientY }
      targetYaw.current += dx * DRAG_SENS
      targetPitch.current = THREE.MathUtils.clamp(
        targetPitch.current + dy * DRAG_SENS,
        -PITCH_LIMIT,
        PITCH_LIMIT,
      )
      markInteract()
    }
    const onUp = () => {
      pointerDown.current = false
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
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      el.removeEventListener('wheel', onWheel)
    }
  }, [gl])

  useFrame((_, delta) => {
    const g = groupRef.current
    if (!g) return

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
        {/* 흰 바다 — 살짝 투명해 뒷면 대륙이 옅게 비친다 */}
        <meshStandardMaterial
          color="#ffffff"
          roughness={1}
          metalness={0}
          transparent
          opacity={0.88}
        />
      </mesh>

      <CountryMeshes
        countries={countries}
        hoveredCode={hovered}
        hiddenCode={showRegions ? selected!.code : null}
      />

      {/* 나라를 연 동안에만 행정구역 블록으로 대체한다 */}
      {showRegions && <RegionMeshes regions={regions} hoveredCode={hovered} />}
      <Atmosphere />
    </group>
  )
}
