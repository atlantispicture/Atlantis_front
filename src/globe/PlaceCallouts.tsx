import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { lngLatToVector3 } from '@/lib/geo'
import type { MemoryView } from '@/lib/memoryDb'
import { useRegions } from '@/lib/useRegions'
import { useMemoryStore } from '@/store/useMemoryStore'
import { useVisitStore } from '@/store/useVisitStore'

const ANCHOR_R = 1.01 // 지표면 쪽 선 시작점
const TIP_R = 1.22 // 카드가 붙는 바깥쪽 끝점 (너무 멀면 지구본에서 떠 보인다)
const FACING_MIN = 0.15 // 이보다 옆/뒤를 보면 숨긴다 (지구 반대편)

const _v = new THREE.Vector3()
const _cam = new THREE.Vector3()

export interface Marker {
  key: string
  name: string
  lng: number
  lat: number
  count: number
  cover: MemoryView | null
}

/** 지표면 → 바깥으로 뻗는 지시선 + 그 끝의 사진 카드 하나 */
function Callout({ marker, onOpen }: { marker: Marker; onOpen: (key: string) => void }) {
  const groupRef = useRef<THREE.Group>(null)
  const { camera } = useThree()
  const [visible, setVisible] = useState(true)
  const visRef = useRef(true)

  const { anchor, tip, lineGeom } = useMemo(() => {
    const a = lngLatToVector3(marker.lng, marker.lat, ANCHOR_R)
    const t = lngLatToVector3(marker.lng, marker.lat, TIP_R)
    const g = new THREE.BufferGeometry()
    g.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([...a.toArray(), ...t.toArray()], 3),
    )
    return { anchor: a, tip: t, lineGeom: g }
  }, [marker.lng, marker.lat])

  // 지구 반대편으로 넘어가면 카드가 뒤에서 비쳐 보이므로 감춘다.
  useFrame(() => {
    const g = groupRef.current
    if (!g) return
    _v.copy(anchor)
    g.localToWorld(_v).normalize()
    _cam.copy(camera.position).normalize()
    const facing = _v.dot(_cam) > FACING_MIN
    if (facing !== visRef.current) {
      visRef.current = facing
      setVisible(facing)
    }
  })

  return (
    <group ref={groupRef}>
      <lineSegments geometry={lineGeom} visible={visible} raycast={() => {}}>
        <lineBasicMaterial color="#111114" transparent opacity={0.55} />
      </lineSegments>

      {/* distanceFactor 를 주면 3D 거리에 비례해 커진다 — 라벨은 줌과 무관하게
          같은 크기여야 읽기 좋으므로 화면 고정 크기로 둔다. */}
      {visible && (
        <Html position={tip} center zIndexRange={[10, 0]}>
          <button
            className="callout"
            // 카드 위에서 시작한 조작이 지구본 회전·선택으로 이어지지 않게 막는다
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onOpen(marker.key)
            }}
          >
            {marker.cover?.thumbUrl ? (
              <img src={marker.cover.thumbUrl} alt="" className="callout__img" />
            ) : (
              <span className="callout__img callout__img--none">📷</span>
            )}
            <span className="callout__body">
              <span className="callout__name">{marker.name}</span>
              <span className="callout__count">사진 {marker.count}</span>
            </span>
          </button>
        </Html>
      )}
    </group>
  )
}

/**
 * 선택한 나라 안에서 '추억이 있는 곳'을 지구본 위에 표시한다.
 * 색만으로는 "여기 갔었지"가 바로 안 읽혀서, 대표 사진과 장수를 지시선으로 붙였다.
 */
export default function PlaceCallouts() {
  const selected = useVisitStore((s) => s.selected)
  const selectRegion = useVisitStore((s) => s.selectRegion)
  const items = useMemoryStore((s) => s.items)
  const { regions, cities } = useRegions(selected?.code)

  const markers = useMemo<Marker[]>(() => {
    if (!selected) return []

    // 좌표를 찾기 위한 색인
    const regionBy = new Map(regions.map((r) => [r.code, r]))
    const cityBy = new Map(cities.map((c) => [c.name, c]))

    const grouped = new Map<string, MemoryView[]>()
    for (const m of items) {
      if (m.countryCode !== selected.code) continue
      const key = m.regionCode ?? m.countryCode
      const arr = grouped.get(key)
      if (arr) arr.push(m)
      else grouped.set(key, [m])
    }

    const out: Marker[] = []
    for (const [key, list] of grouped) {
      list.sort((a, b) => b.capturedAt - a.capturedAt)
      const cover = list[0] ?? null

      let lng: number | undefined
      let lat: number | undefined
      let name = cover?.placeName || key

      const region = regionBy.get(key)
      if (region) {
        lng = region.lng
        lat = region.lat
        name = region.name
      } else if (key.includes(':city:')) {
        const city = cityBy.get(key.split(':city:')[1])
        if (city) {
          lng = city.lng
          lat = city.lat
          name = city.name
        }
      } else if (key === selected.code) {
        ;[lng, lat] = selected.centroid
        name = selected.name
      }

      // 좌표를 못 찾으면 지구본에 찍을 수 없다 (데이터 미로딩 등)
      if (lng == null || lat == null) continue
      out.push({ key, name, lng, lat, count: list.length, cover })
    }

    // 사진 많은 곳을 우선 — 너무 많으면 화면이 지저분해진다
    return out.sort((a, b) => b.count - a.count).slice(0, 8)
  }, [selected, items, regions, cities])

  if (!selected || markers.length === 0) return null

  const open = (key: string) => {
    const region = regions.find((r) => r.code === key)
    if (region) {
      selectRegion({
        code: region.code,
        name: region.name,
        countryCode: selected.code,
        centroid: [region.lng, region.lat],
        kind: 'region',
      })
      return
    }
    const cityName = key.includes(':city:') ? key.split(':city:')[1] : null
    const city = cityName ? cities.find((c) => c.name === cityName) : null
    if (city) {
      selectRegion({
        code: key,
        name: city.name,
        countryCode: selected.code,
        centroid: [city.lng, city.lat],
        kind: 'city',
      })
      return
    }
    selectRegion(null) // 나라 단위 추억
  }

  return (
    <group>
      {markers.map((m) => (
        <Callout key={m.key} marker={m} onOpen={open} />
      ))}
    </group>
  )
}
