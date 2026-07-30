import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { lngLatToUnit } from '@/lib/geo'

const RADIUS = 1.0045 // 나라 채색 메시(1.004) 바로 위, 지역 경계선(1.007) 아래
const SRC = '/geo/admin1-lines.json'

interface LinesFile {
  tolerance: number
  /** [lng,lat,lng,lat,...] 로 평탄화된 선들 */
  rings: number[][]
}

// 한 번 만들면 계속 쓴다 (나라를 오가도 다시 굽지 않게)
let cached: THREE.BufferGeometry | null = null
let inflight: Promise<THREE.BufferGeometry | null> | null = null

/** 평탄화된 링들을 LineSegments 용 정점 배열 하나로 합친다 */
function buildGeometry(file: LinesFile): THREE.BufferGeometry {
  // 링마다 (점 수 - 1)개의 선분, 선분당 정점 2개
  let segments = 0
  for (const r of file.rings) segments += r.length / 2 - 1

  const pos = new Float32Array(segments * 2 * 3)
  const v = new THREE.Vector3()
  let o = 0

  for (const ring of file.rings) {
    const n = ring.length / 2
    for (let i = 0; i < n - 1; i++) {
      // 선분의 시작점과 끝점을 차례로 넣는다
      for (const k of [i, i + 1]) {
        lngLatToUnit(ring[k * 2], ring[k * 2 + 1], v).multiplyScalar(RADIUS)
        pos[o++] = v.x
        pos[o++] = v.y
        pos[o++] = v.z
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  return geo
}

async function load(): Promise<THREE.BufferGeometry | null> {
  try {
    const res = await fetch(SRC)
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null
    return buildGeometry((await res.json()) as LinesFile)
  } catch {
    return null
  }
}

/**
 * 전 세계 행정구역 경계선.
 *
 * 나라를 열지 않아도 지구본이 지역 단위로 나뉘어 보이게 한다.
 * 10m 원본은 130만 점이라 통째로 못 올리므로, 지구본 축척에서 1픽셀도 안 되는
 * 굴곡을 걷어낸 단순화본(0.2°, 15.7만 점)을 쓴다. 나라를 열면 그 나라만
 * RegionMeshes 가 10m 원본으로 다시 그린다.
 */
export default function WorldLines() {
  const [geom, setGeom] = useState<THREE.BufferGeometry | null>(cached)

  useEffect(() => {
    if (cached) return
    let alive = true
    if (!inflight) inflight = load().then((g) => (cached = g))
    inflight.then((g) => alive && setGeom(g))
    return () => {
      alive = false
    }
  }, [])

  if (!geom) return null

  return (
    <lineSegments geometry={geom} raycast={() => {}}>
      <lineBasicMaterial color="#111114" transparent opacity={0.5} />
    </lineSegments>
  )
}
