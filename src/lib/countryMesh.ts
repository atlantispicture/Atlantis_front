import earcut from 'earcut'
import * as THREE from 'three'
import { lngLatToUnit } from './geo'

type Ring = number[][] // [[lng,lat], ...]
type PolygonCoords = Ring[] // [outer, hole1, ...]

/**
 * 국가 폴리곤(GeoJSON) → 구면 위 채색 메시용 BufferGeometry.
 *
 * 방식:
 *  1) 각 폴리곤을 lng/lat 평면에서 earcut 으로 삼각분할
 *  2) 삼각형을 midpoint 로 subdiv 번 세분화 (평면에서)
 *  3) 모든 정점을 구면(radius)에 투영 — 세분화 덕에 큰 나라도 표면에 밀착
 *
 * radius 를 1보다 살짝 크게 줘서 바다 구(=1) 위에 뜨게 하고,
 * material 의 polygonOffset 으로 z-fighting 을 막는다.
 */
export function buildCountryGeometry(
  polygons: PolygonCoords[],
  radius = 1.002,
  subdiv = 1,
): THREE.BufferGeometry {
  const positions: number[] = []
  const v = new THREE.Vector3()

  for (const poly of polygons) {
    const { vertices, holes } = flatten(poly)
    const tris = earcut(vertices, holes, 2) // 인덱스 (3개씩 삼각형)

    for (let i = 0; i < tris.length; i += 3) {
      const a = tris[i] * 2
      const b = tris[i + 1] * 2
      const c = tris[i + 2] * 2
      emitTriangle(
        positions,
        v,
        radius,
        subdiv,
        vertices[a], vertices[a + 1],
        vertices[b], vertices[b + 1],
        vertices[c], vertices[c + 1],
      )
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.computeVertexNormals()
  return geo
}

/** GeoJSON ring 배열 → earcut 입력 형태 (flat vertices + hole 인덱스) */
function flatten(poly: PolygonCoords): { vertices: number[]; holes: number[] } {
  const vertices: number[] = []
  const holes: number[] = []
  poly.forEach((ring, ringIdx) => {
    if (ringIdx > 0) holes.push(vertices.length / 2)
    for (const [lng, lat] of ring) vertices.push(lng, lat)
  })
  return { vertices, holes }
}

/** lng/lat 삼각형을 세분화하며 구면에 투영해 positions 에 push */
function emitTriangle(
  out: number[],
  v: THREE.Vector3,
  radius: number,
  subdiv: number,
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
) {
  if (subdiv <= 0) {
    push(out, v, radius, ax, ay)
    push(out, v, radius, bx, by)
    push(out, v, radius, cx, cy)
    return
  }
  // 4분할: 각 변의 중점으로 나눔
  const abx = (ax + bx) / 2, aby = (ay + by) / 2
  const bcx = (bx + cx) / 2, bcy = (by + cy) / 2
  const cax = (cx + ax) / 2, cay = (cy + ay) / 2
  emitTriangle(out, v, radius, subdiv - 1, ax, ay, abx, aby, cax, cay)
  emitTriangle(out, v, radius, subdiv - 1, abx, aby, bx, by, bcx, bcy)
  emitTriangle(out, v, radius, subdiv - 1, cax, cay, bcx, bcy, cx, cy)
  emitTriangle(out, v, radius, subdiv - 1, abx, aby, bcx, bcy, cax, cay)
}

function push(out: number[], v: THREE.Vector3, radius: number, lng: number, lat: number) {
  lngLatToUnit(lng, lat, v).multiplyScalar(radius)
  out.push(v.x, v.y, v.z)
}

/** Feature.geometry(Polygon|MultiPolygon) → PolygonCoords[] 로 정규화 */
export function toPolygons(geometry: {
  type: string
  coordinates: unknown
}): PolygonCoords[] {
  if (geometry.type === 'Polygon') {
    return [geometry.coordinates as PolygonCoords]
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates as PolygonCoords[]
  }
  return []
}
