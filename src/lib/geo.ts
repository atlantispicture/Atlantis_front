import * as THREE from 'three'

/**
 * 위경도(도) → 반지름 r 구면 위 3D 좌표.
 * 프로젝트 전역에서 이 변환 하나만 쓴다 (지구본·카메라·메시 모두 동일 규약).
 */
export function lngLatToVector3(lng: number, lat: number, r = 1): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  )
}

/** 위 규약으로 (lng,lat) → 단위벡터를 배열에 직접 써 넣는다 (메시 빌드 성능용). */
export function lngLatToUnit(lng: number, lat: number, out: THREE.Vector3): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  const s = Math.sin(phi)
  return out.set(-s * Math.cos(theta), Math.cos(phi), s * Math.sin(theta))
}

/** 카메라가 이 나라를 정면(+Z, 카메라 쪽)으로 보게 만드는 회전 쿼터니언. */
export function faceFrontQuaternion(centroidLng: number, centroidLat: number): THREE.Quaternion {
  const p = lngLatToVector3(centroidLng, centroidLat, 1).normalize()
  return new THREE.Quaternion().setFromUnitVectors(p, new THREE.Vector3(0, 0, 1))
}
