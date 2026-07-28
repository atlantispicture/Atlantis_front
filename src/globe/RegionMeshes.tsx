import { geoBounds } from 'd3-geo'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { buildCountryGeometry, buildOutlineGeometry, toPolygons } from '@/lib/countryMesh'
import type { Region } from '@/lib/useRegions'
import { useMemoryStore } from '@/store/useMemoryStore'
import { useUiStore } from '@/store/useUiStore'
import { useVisitStore } from '@/store/useVisitStore'

interface Baked {
  region: Region
  fill: THREE.BufferGeometry
  outline: THREE.BufferGeometry
}

const FILL_RADIUS = 1.0055 // 나라 메시(1.004) 위
const LINE_RADIUS = 1.007 // 채움 위에 경계선

// 라인아트 톤에 맞춘다 — 면은 흰색, 구분은 검은 경계선이 맡는다.
const COLOR_REGION = new THREE.Color('#ffffff') // 미방문 지역
const COLOR_VISITED = new THREE.Color('#d8d8dc') // 방문한 지역 (옅게 채워짐)
const COLOR_HOVER = new THREE.Color('#ececef')
const COLOR_SELECTED = new THREE.Color('#dcdce0')

/**
 * 지역은 나라보다 작아 세분화가 덜 필요하다.
 * 세분화 한 단계당 삼각형이 4배로 늘어 굽는 시간이 그만큼 길어지므로,
 * 구면에 밀착돼 보이는 최소치만 준다 (한 변이 몇 도 수준이면 1로 충분).
 */
function subdivFor(geometry: Region['geometry']): number {
  const [[minLng, minLat], [maxLng, maxLat]] = geoBounds(geometry as never)
  const span = Math.max(Math.abs(maxLng - minLng), Math.abs(maxLat - minLat))
  if (span > 20) return 2
  return 1
}

const IGNORE_RAYCAST = () => {}

interface Props {
  regions: Region[]
  /** 호버 중인 지역 코드 — 픽킹은 GlobeScene 이 전담해 내려준다. */
  hoveredCode: string | null
}

/**
 * 선택된 나라의 행정구역(admin-1) 블록.
 * 나라가 통짜 실루엣으로만 보이지 않도록, 열었을 때 도/현/주 단위로 쪼개 보여준다.
 */
export default function RegionMeshes({ regions, hoveredCode }: Props) {
  const regionVisits = useVisitStore((s) => s.regionVisits)
  const selectedCode = useVisitStore((s) => s.selectedRegion?.code)
  // 추억이 있는 지역은 계절색(또는 지정색)으로 — 흑백 바탕에서 색이 곧 신호다.
  const memoryItems = useMemoryStore((s) => s.items)
  const customColors = useMemoryStore((s) => s.customColors)
  const colorOf = useMemoryStore((s) => s.colorOf)

  const tinted = useMemo(() => {
    const map = new Map<string, THREE.Color>()
    for (const r of regions) {
      const c = colorOf(r.code)
      if (c) map.set(r.code, new THREE.Color(c.color))
    }
    return map
  }, [regions, memoryItems, customColors, colorOf])

  /**
   * 지오메트리는 나라가 바뀔 때만 굽는다 (색만 상태에 따라 교체).
   *
   * 굽는 데 큰 나라 기준 50~100ms 가 걸려 메인 스레드가 멈춘다. 렌더 중에 바로
   * 계산하면 그 사이 스피너가 그려지지 못하므로, 한 프레임 뒤로 미뤄
   * '로딩 표시 → 굽기 → 표시' 순서가 되게 한다.
   */
  const [baked, setBaked] = useState<Baked[]>([])
  const setRegionBaking = useUiStore((s) => s.setRegionBaking)

  useEffect(() => {
    if (regions.length === 0) {
      setBaked([])
      return
    }

    let alive = true
    setBaked([]) // 이전 나라의 블록을 즉시 치운다
    setRegionBaking(true)

    // rAF 두 번 — 스피너가 실제로 화면에 찍힌 뒤에 굽기 시작
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!alive) return
        const out = regions.map((r) => {
          const polys = toPolygons(r.geometry as { type: string; coordinates: unknown })
          return {
            region: r,
            fill: buildCountryGeometry(polys, FILL_RADIUS, subdivFor(r.geometry)),
            outline: buildOutlineGeometry(polys, LINE_RADIUS),
          }
        })
        if (!alive) {
          out.forEach((b) => (b.fill.dispose(), b.outline.dispose()))
          return
        }
        setBaked(out)
        setRegionBaking(false)
      }),
    )

    return () => {
      alive = false
      cancelAnimationFrame(id)
      setRegionBaking(false)
    }
  }, [regions, setRegionBaking])

  // 나라를 벗어날 때 GPU 버퍼를 반납한다 (누적되면 메모리가 샌다)
  useEffect(
    () => () => baked.forEach((b) => (b.fill.dispose(), b.outline.dispose())),
    [baked],
  )

  return (
    <group>
      {baked.map(({ region, fill, outline }) => {
        const isVisited = !!regionVisits[region.code]?.visited
        const isSelected = selectedCode === region.code
        const isHover = hoveredCode === region.code
        const tint = tinted.get(region.code)

        // 선택·호버는 즉각 반응해야 하므로 색보다 우선.
        // 그 외에는 추억의 계절색이 있으면 그것을, 없으면 흑백 위계를 따른다.
        const color = isSelected
          ? COLOR_SELECTED
          : isHover
            ? COLOR_HOVER
            : (tint ??
              (isVisited ? COLOR_VISITED : COLOR_REGION))

        return (
          <group key={region.code}>
            <mesh geometry={fill} raycast={IGNORE_RAYCAST}>
              {/* CountryMeshes 와 같은 무광 재질 — 바다와 톤이 어긋나지 않게 */}
              <meshBasicMaterial
                color={color}
                polygonOffset
                polygonOffsetFactor={-2}
                polygonOffsetUnits={-2}
              />
            </mesh>
            {/* 경계선 — 블록이 나뉘어 보이게 하는 핵심 */}
            <lineSegments geometry={outline} raycast={IGNORE_RAYCAST}>
              <lineBasicMaterial color="#111114" transparent opacity={0.85} />
            </lineSegments>
          </group>
        )
      })}
    </group>
  )
}
