import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { lngLatToUnit } from '@/lib/geo'

// 흰 육지 메시(1.004) 바로 '위' — 아래에 두면 불투명한 육지에 가려 안 보인다.
const RADIUS = 1.0048

/**
 * 전 세계 행정구역 경계선.
 *
 * 지구본을 처음 열었을 때부터 나라가 지역 단위로 나뉘어 보이게 하는 층이다.
 * 원본(10m, 130만 점)은 통째로 못 올려서, 빌드 단계에서 22km 이하 굴곡을
 * 걷어낸 16만 점짜리 선 데이터를 쓴다. 나라를 열면 그 나라만 10m 원본으로
 * 다시 그리므로(RegionMeshes) 가까이서도 뭉개지지 않는다.
 */
export default function WorldBorders({ visible = true }: { visible?: boolean }) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)

  useEffect(() => {
    let alive = true
    const controller = new AbortController()

    fetch('/geo/admin1-lines.json', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('경계선 데이터 없음'))))
      .then((data: { rings: number[][] }) => {
        if (!alive) return

        // 링 하나를 선분 목록으로 펼친다 (LineSegments 는 정점 2개 = 선 1개)
        const positions: number[] = []
        const v = new THREE.Vector3()
        const push = (lng: number, lat: number) => {
          lngLatToUnit(lng, lat, v).multiplyScalar(RADIUS)
          positions.push(v.x, v.y, v.z)
        }

        for (const flat of data.rings) {
          for (let i = 0; i + 3 < flat.length; i += 2) {
            // 날짜변경선을 가로지르는 구간은 지구를 반대로 관통하는 선이 되므로 건너뛴다
            if (Math.abs(flat[i] - flat[i + 2]) > 180) continue
            push(flat[i], flat[i + 1])
            push(flat[i + 2], flat[i + 3])
          }
        }

        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
        setGeometry(geo)
      })
      .catch(() => {
        /* 없으면 선 없이 진행 — 앱이 죽을 이유는 없다 */
      })

    return () => {
      alive = false
      controller.abort()
    }
  }, [])

  // 나라를 바꿔도 이 층은 유지되므로, 언마운트 시에만 반납한다
  useEffect(() => () => geometry?.dispose(), [geometry])

  if (!geometry) return null

  return (
    <lineSegments geometry={geometry} visible={visible} raycast={() => {}}>
      <lineBasicMaterial color="#111114" transparent opacity={0.85} />
    </lineSegments>
  )
}
