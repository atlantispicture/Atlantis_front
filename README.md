# atlantis-fe

**Atlas** 프론트엔드 — 3D 지구본 여행 기록 앱. Phase 0(웹 3D 프로토타입)부터 시작한다.

## 스택
- Vite + React 18 + TypeScript
- three.js + `@react-three/fiber` + `@react-three/drei`
- 상태관리: Zustand
- 지도/투영: `d3-geo`, `topojson-client`
- 국가 데이터: Natural Earth (오픈 데이터)

## 시작
```bash
npm install
npm run fetch-data   # Natural Earth 국가 경계 다운로드 (최초 1회)
npm run dev          # http://localhost:5173
```

## 폴더 구조
```
public/
  textures/   지구 텍스처 (day/night) — 직접 배치
  geo/        Natural Earth topojson/geojson — 스크립트로 다운로드
src/
  globe/      지구본 렌더 + 카메라 트위닝
    morph/    지구본→지도 모핑 셰이더 (최대 리스크)
  map/        나라 상세(평면 지도) 화면
  store/      Zustand 스토어 (방문/선택 상태)
  data/       국가 메타 데이터
  types/      공용 타입
  hooks/  lib/  styles/
```

## 로드맵 (Phase 0)
1. 지구본 렌더 + 자전 + 드래그/줌 조작         ✅
2. 국가 경계 채색 메시 로드 + 탭 선택          ✅ (한국어 국가명)
3. 카메라 트위닝(정면 회전+줌인) → 평면 지도 오버레이  ✅ 간이 모핑
4. 나라 검색(한/영/코드)                       ✅
5. 방문 토글 → 채색 + 수집 현황                 ✅
6. 정점 보간 셰이더 모핑으로 고도화              ⬜ (src/globe/morph)

> 목표: "이 인터랙션이 앱에서 실현 가능한가"를 앱 착수 전에 웹에서 검증 → **달성**.

## 구현 메모
- 국가는 GeoJSON → earcut 삼각분할 + 나라 크기별 적응형 세분화로 구면에 밀착시킨
  **채색 메시**로 렌더 (시각화·클릭·방문색을 한 메시로 처리, 기획서 §3.1).
- 회전은 yaw/pitch 스칼라 모델 → 롤(roll) 없이 자연스럽고, 무입력 2.5초 후 자동 자전.
- 모핑은 §4.3 권장대로 "카메라 정면 회전 + 줌인 + 평면 지도 크로스페이드"의 간이 전환.
  향후 `src/globe/morph/morphShader.ts`에서 정점 보간으로 고도화.
# Atlantis_front
