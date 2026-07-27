import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * 지구 가장자리 링. 바깥을 향한 뒷면(BackSide) 구에 프레넬 셰이더로
 * 옅은 회색 테두리를 얹어 흰 배경 위에서 구의 윤곽을 잡아준다.
 *
 * 밝은 테마에선 additive 블렌딩이 무의미하므로(흰 배경 + 흰빛 = 그대로 흰색)
 * 일반 블렌딩 + 알파로 그린다.
 */
export default function Atmosphere({ radius = 1.13 }: { radius?: number }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        blending: THREE.NormalBlending,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uColor: { value: new THREE.Color('#8b9096') }, // 옅은 회색 윤곽
        },
        vertexShader: /* glsl */ `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          varying vec3 vNormal;
          void main() {
            // 가장자리로 갈수록 1에 가까워지는 프레넬 항
            float rim = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
            gl_FragColor = vec4(uColor, clamp(rim, 0.0, 1.0) * 0.45);
          }
        `,
      }),
    [],
  )

  return (
    <mesh material={material}>
      <sphereGeometry args={[radius, 64, 64]} />
    </mesh>
  )
}
