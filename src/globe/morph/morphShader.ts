/**
 * 지구본 → 평면 지도 모핑 셰이더 (스켈레톤). 이 앱 최대 리스크.
 *
 * 전략(기획서 §4.3):
 *  - MVP: "완벽한 구 펴짐"을 노리지 말 것. ①카메라 줌인 + ②크로스페이드로
 *    평면 지도에 진입하는 간이 전환으로 먼저 "되는 것"을 만든다.
 *  - 고도화: uProgress(0=구, 1=평면)로 정점을 구면↔정거방위도법 평면 사이 보간.
 *
 * TODO(Phase 0): 아래 vertex 셰이더에서 sphere pos ↔ projected pos 를
 * uProgress 로 mix. projected pos 는 선택 나라 중심 기준 정거방위도법.
 */
export const morphUniforms = {
  uProgress: { value: 0 }, // 0 = 지구본, 1 = 평면 지도
  uCenter: { value: [0, 0] }, // 선택 나라 중심 [경도, 위도]
}

export const morphVertexShader = /* glsl */ `
  uniform float uProgress;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 spherePos = position;
    // TODO: vec3 planePos = azimuthalEquidistant(position, uCenter);
    vec3 planePos = spherePos; // placeholder
    vec3 morphed = mix(spherePos, planePos, uProgress);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(morphed, 1.0);
  }
`

export const morphFragmentShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(0.17, 0.42, 0.69, 1.0);
  }
`
