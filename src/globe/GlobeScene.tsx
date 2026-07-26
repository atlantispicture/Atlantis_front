import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { lngLatToVector3 } from '@/lib/geo'
import type { CountryMeta } from '@/lib/useCountries'
import { useVisitStore } from '@/store/useVisitStore'
import Atmosphere from './Atmosphere'
import CountryMeshes from './CountryMeshes'

const DIST_DEFAULT = 3
const DIST_COUNTRY = 1.85
const DIST_MIN = 1.5
const DIST_MAX = 5
const DRAG_SENS = 0.006
const PITCH_LIMIT = 1.4 // 극점 뒤집힘 방지
const IDLE_MS = 2500 // 이 시간 무입력이면 자동 회전 재개
const IDLE_SPEED = 0.035
const AXIS_Y = new THREE.Vector3(0, 1, 0)
const AXIS_X = new THREE.Vector3(1, 0, 0)

/** 나라 중심(lng,lat)을 정면(+Z)으로 가져오는 yaw/pitch */
function yawPitchToFront(lng: number, lat: number): { yaw: number; pitch: number } {
  const p = lngLatToVector3(lng, lat, 1).normalize()
  return {
    pitch: Math.asin(THREE.MathUtils.clamp(p.y, -1, 1)),
    yaw: Math.atan2(-p.x, p.z),
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
  const selected = useVisitStore((s) => s.selected)
  const phase = useVisitStore((s) => s.phase)

  const markInteract = () => (lastInteract.current = performance.now())

  // 선택/단계 변화 → 카메라·회전 목표 갱신
  useEffect(() => {
    if (phase === 'country' && selected) {
      const { yaw: ty, pitch: tp } = yawPitchToFront(selected.centroid[0], selected.centroid[1])
      targetYaw.current = shortestAngle(yaw.current, ty)
      targetPitch.current = tp
      targetDist.current = DIST_COUNTRY
      markInteract()
    } else {
      targetDist.current = DIST_DEFAULT
    }
  }, [phase, selected])

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
      targetDist.current = THREE.MathUtils.clamp(
        targetDist.current + e.deltaY * 0.0015,
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

    // yaw(Y) 다음 pitch(X) — 롤 없는 자연 회전
    const qYaw = new THREE.Quaternion().setFromAxisAngle(AXIS_Y, yaw.current)
    const qPitch = new THREE.Quaternion().setFromAxisAngle(AXIS_X, pitch.current)
    g.quaternion.copy(qYaw).multiply(qPitch)

    camera.position.z = THREE.MathUtils.damp(camera.position.z, targetDist.current, 6, delta)
    camera.lookAt(0, 0, 0)
  })

  return (
    <group ref={groupRef}>
      {/* 바다 구 (반지름 0.997 — 채색 메시 1.004 아래) */}
      <mesh>
        <sphereGeometry args={[0.997, 96, 96]} />
        <meshStandardMaterial color="#0b3d66" roughness={1} metalness={0} />
      </mesh>

      <CountryMeshes countries={countries} draggingRef={dragging} onPick={select} />
      <Atmosphere />
    </group>
  )
}
