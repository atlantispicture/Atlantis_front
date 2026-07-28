import { geoBounds } from 'd3-geo'
import { useMemo } from 'react'
import * as THREE from 'three'
import { buildCountryGeometry, toPolygons } from '@/lib/countryMesh'
import type { CountryMeta } from '@/lib/useCountries'
import { useMemoryStore } from '@/store/useMemoryStore'
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

// 라인아트: 바다도 육지도 흰색, 구분은 검은 경계선(WorldBorders)이 맡는다.
// 색은 '다녀온 곳'에만 쓰여 신호가 된다.
const COLOR_LAND = new THREE.Color('#ffffff') // 미방문 육지 (바다와 같은 흰색)
const COLOR_VISITED = new THREE.Color('#d8d8dc') // 방문 (아주 옅은 회색 — 채워진 느낌만)
const COLOR_HOVER = new THREE.Color('#ececef') // 호버
const COLOR_SELECTED = new THREE.Color('#dcdce0') // 선택

interface Props {
  countries: CountryMeta[]
  /** 호버 중인 나라 코드 — 픽킹은 GlobeScene 바다 구가 전담(geoContains)해서 내려준다. */
  hoveredCode: string | null
  /**
   * 이 나라는 그리지 않는다. 지역 블록(admin-1, 10m)으로 대체된 나라용 —
   * 국가 경계는 110m 저해상도라 그대로 두면 해안선이 어긋나 검은 테두리가 삐져나온다.
   */
  hiddenCode?: string | null
}

/** 채색 메시는 순수 렌더용 — 레이캐스트(픽킹) 대상에서 제외한다. */
const IGNORE_RAYCAST = () => {}

/**
 * 국가별 채색 메시. GeoJSON → BufferGeometry 는 최초 1회만 굽고,
 * 색상만 상태에 따라 바꾼다 (매 프레임 재계산 금지 — 기획서 §3.1).
 */
export default function CountryMeshes({ countries, hoveredCode, hiddenCode }: Props) {
  const visits = useVisitStore((s) => s.visits)
  const selectedCode = useVisitStore((s) => s.selected?.code)
  // 나라에 직접 붙은 추억(지역 미지정)의 계절색
  const memoryItems = useMemoryStore((s) => s.items)
  const customColors = useMemoryStore((s) => s.customColors)
  const colorOf = useMemoryStore((s) => s.colorOf)

  const tinted = useMemo(() => {
    const map = new Map<string, THREE.Color>()
    for (const c of countries) {
      const t = colorOf(c.code)
      if (t) map.set(c.code, new THREE.Color(t.color))
    }
    return map
  }, [countries, memoryItems, customColors, colorOf])

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
        if (meta.code === hiddenCode) return null // 지역 블록이 대신 그린다

        const isVisited = !!visits[meta.code]?.visited
        const isSelected = selectedCode === meta.code
        const isHover = hoveredCode === meta.code
        const tint = tinted.get(meta.code)
        const color = isSelected
          ? COLOR_SELECTED
          : isHover
            ? COLOR_HOVER
            : (tint ?? (isVisited ? COLOR_VISITED : COLOR_LAND))

        return (
          <mesh key={meta.code} geometry={geometry} raycast={IGNORE_RAYCAST}>
            {/* 바다와 완전히 같은 톤이 되도록 조명을 받지 않는 재질을 쓴다.
                (standard 재질은 빛을 받아 같은 #ffffff 라도 미묘하게 달라진다) */}
            <meshBasicMaterial
              color={color}
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
