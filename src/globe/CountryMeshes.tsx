import { geoBounds } from 'd3-geo'
import { useMemo, useState, type MutableRefObject } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { buildCountryGeometry, toPolygons } from '@/lib/countryMesh'
import type { CountryMeta } from '@/lib/useCountries'
import { useVisitStore } from '@/store/useVisitStore'

const COUNTRY_RADIUS = 1.004

/** 나라가 클수록(각폭이 넓을수록) 삼각형을 더 잘게 나눠 구 표면에 밀착시킨다. */
function subdivFor(feature: CountryMeta['feature']): number {
  const [[minLng, minLat], [maxLng, maxLat]] = geoBounds(feature as never)
  const span = Math.max(Math.abs(maxLng - minLng), Math.abs(maxLat - minLat))
  if (span > 30) return 4
  if (span > 15) return 3
  if (span > 6) return 2
  return 1
}

const COLOR_LAND = new THREE.Color('#2f855a') // 미방문 육지 (초록)
const COLOR_VISITED = new THREE.Color('#f6ad55') // 방문 (따뜻한 포인트)
const COLOR_HOVER = new THREE.Color('#68d391') // 호버 강조
const COLOR_SELECTED = new THREE.Color('#f6e05e') // 선택 강조

interface Props {
  countries: CountryMeta[]
  /** 드래그 중 클릭 무시용 — 부모(드래그 핸들러)가 갱신 */
  draggingRef: MutableRefObject<boolean>
  onPick: (meta: CountryMeta) => void
}

/**
 * 국가별 채색 메시. GeoJSON → BufferGeometry 는 최초 1회만 굽고,
 * 색상만 상태에 따라 바꾼다 (매 프레임 재계산 금지 — 기획서 §3.1).
 */
export default function CountryMeshes({ countries, draggingRef, onPick }: Props) {
  const visits = useVisitStore((s) => s.visits)
  const selectedCode = useVisitStore((s) => s.selected?.code)
  const [hovered, setHovered] = useState<string | null>(null)

  // 지오메트리 캐시 (데이터가 바뀔 때만 재생성)
  const geometries = useMemo(() => {
    return countries.map((c) => ({
      meta: c,
      geometry: buildCountryGeometry(
        toPolygons(c.feature.geometry),
        COUNTRY_RADIUS,
        subdivFor(c.feature),
      ),
    }))
  }, [countries])

  return (
    <group>
      {geometries.map(({ meta, geometry }) => {
        const isVisited = !!visits[meta.code]?.visited
        const isSelected = selectedCode === meta.code
        const isHover = hovered === meta.code
        const color = isSelected
          ? COLOR_SELECTED
          : isHover
            ? COLOR_HOVER
            : isVisited
              ? COLOR_VISITED
              : COLOR_LAND

        return (
          <mesh
            key={meta.code}
            geometry={geometry}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation()
              if (draggingRef.current) return // 드래그였으면 선택 안 함
              onPick(meta)
            }}
            onPointerOver={(e) => {
              e.stopPropagation()
              setHovered(meta.code)
              document.body.style.cursor = 'pointer'
            }}
            onPointerOut={() => {
              setHovered((h) => (h === meta.code ? null : h))
              document.body.style.cursor = 'auto'
            }}
          >
            <meshStandardMaterial
              color={color}
              roughness={0.85}
              metalness={0}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
            />
          </mesh>
        )
      })}
    </group>
  )
}
