// Natural Earth 지리 데이터 다운로드.
// 사용: npm run fetch-data  (Node 18+, 전역 fetch 사용)
//
// 출력:
//   public/geo/countries-110m.geojson   국가 경계 (~800KB, ISO_A3 · NAME_KO · CONTINENT)
//   public/geo/regions/{ISO3}.json      나라별 행정구역 + 도시 (앱에서 지연 로딩)
//
// 원본 admin-1(40MB) / 도시(19MB)를 통째로 브라우저에 보낼 수 없으므로
// 나라 단위로 쪼개 저장한다. 좌표는 소수점 3자리(≈100m)로 반올림해 용량을 줄인다.
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const GEO_DIR = resolve(__dirname, '../public/geo')

const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson'
const SRC_COUNTRIES = `${BASE}/ne_110m_admin_0_countries.geojson`
const SRC_ADMIN1 = `${BASE}/ne_10m_admin_1_states_provinces.geojson`
const SRC_CITIES = `${BASE}/ne_10m_populated_places.geojson`

const COORD_PRECISION = 3 // 소수점 자리수 (≈100m — 지구본/나라 줌 수준에 충분)

// 전 세계 경계선 단순화 임계값(도). 0.2° ≈ 22km — 지구본 전체 뷰에서 1픽셀 미만이라
// 눈에 띄지 않으면서 좌표 수를 130만 → 16만으로 줄인다.
const LINE_TOLERANCE = 0.2

/** 직전에 남긴 점에서 임계값 이상 떨어진 점만 남긴다 (선 렌더링용 근사 단순화) */
function simplifyRing(ring, tol) {
  const out = [ring[0]]
  let last = ring[0]
  for (let i = 1; i < ring.length - 1; i++) {
    const p = ring[i]
    if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) >= tol) {
      out.push(p)
      last = p
    }
  }
  out.push(ring[ring.length - 1]) // 링을 닫기 위해 마지막 점은 유지
  return out
}

async function fetchJson(url, label) {
  process.stdout.write(`⬇  ${label} …`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${label} 다운로드 실패`)
  const json = await res.json()
  console.log(` 완료 (${json.features.length.toLocaleString()}개)`)
  return json
}

/** 좌표 정밀도를 낮추고, 반올림으로 겹쳐진 연속 중복점을 제거한다. */
function compactCoords(node) {
  if (typeof node[0] === 'number') {
    return [round(node[0]), round(node[1])]
  }
  const mapped = node.map(compactCoords)
  // 링(ring) 레벨이면 연속 중복 제거
  if (mapped.length && typeof mapped[0][0] === 'number') {
    const out = mapped.filter((p, i) => i === 0 || p[0] !== mapped[i - 1][0] || p[1] !== mapped[i - 1][1])
    return out.length >= 4 ? out : mapped // 폴리곤 최소 정점 수 보장
  }
  return mapped
}

const round = (n) => Math.round(n * 10 ** COORD_PRECISION) / 10 ** COORD_PRECISION

function main() {
  return (async () => {
    await mkdir(GEO_DIR, { recursive: true })

    // 1) 국가 경계 -------------------------------------------------
    const countries = await fetchJson(SRC_COUNTRIES, '국가 경계 (110m)')
    await writeFile(resolve(GEO_DIR, 'countries-110m.geojson'), JSON.stringify(countries))
    console.log(`   → countries-110m.geojson`)

    // 2) 행정구역(admin-1) + 3) 도시 -------------------------------
    const admin1 = await fetchJson(SRC_ADMIN1, '행정구역 (admin-1, 40MB)')
    const cities = await fetchJson(SRC_CITIES, '도시 (populated places, 19MB)')

    // 나라(ISO3)별로 묶는다
    const byCountry = new Map()
    const bucket = (iso3) => {
      if (!iso3 || iso3 === '-99') return null
      if (!byCountry.has(iso3)) byCountry.set(iso3, { regions: [], cities: [] })
      return byCountry.get(iso3)
    }

    for (const f of admin1.features) {
      const p = f.properties
      const b = bucket(p.adm0_a3)
      if (!b || !f.geometry) continue
      b.regions.push({
        code: p.iso_3166_2 || `${p.adm0_a3}-${b.regions.length}`, // 표준 코드 없으면 대체 키
        name: p.name_ko || p.name || p.name_en || '이름 없음',
        nameEn: p.name_en || p.name || '',
        lng: round(Number(p.longitude)),
        lat: round(Number(p.latitude)),
        geometry: { type: f.geometry.type, coordinates: compactCoords(f.geometry.coordinates) },
      })
    }

    for (const f of cities.features) {
      const p = f.properties
      const b = bucket(p.ADM0_A3)
      if (!b || !f.geometry) continue
      const [lng, lat] = f.geometry.coordinates
      b.cities.push({
        name: p.NAME_KO || p.NAME || '이름 없음',
        nameEn: p.NAME_EN || p.NAME || '',
        lng: round(lng),
        lat: round(lat),
        pop: p.POP_MAX || 0,
        adm1: p.ADM1NAME || null, // 행정구역 연결용(영문명)
      })
    }

    // 나라별 파일로 저장 (인구 많은 도시 우선 정렬)
    const outDir = resolve(GEO_DIR, 'regions')
    await rm(outDir, { recursive: true, force: true })
    await mkdir(outDir, { recursive: true })

    let total = 0
    for (const [iso3, data] of byCountry) {
      data.regions.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      data.cities.sort((a, b) => b.pop - a.pop)
      const json = JSON.stringify(data)
      total += Buffer.byteLength(json)
      await writeFile(resolve(outDir, `${iso3}.json`), json)
    }

    console.log(
      `   → regions/{ISO3}.json  ${byCountry.size}개국, 합계 ${(total / 1024 / 1024).toFixed(1)}MB` +
        ` (나라당 평균 ${Math.round(total / byCountry.size / 1024)}KB)`,
    )

    // 4) 전 세계 지역 경계선 (지구본 전체 뷰용) ------------------
    // 원본 그대로면 130만 점이라 못 올린다. 지구본 축척에서 1픽셀도 안 되는
    // 미세한 굴곡을 걷어내 선만 남긴다. 상세는 나라를 열 때 10m 원본으로 그린다.
    const lines = []
    let kept = 0
    for (const f of admin1.features) {
      if (!f.geometry) continue
      const polys =
        f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
      for (const poly of polys) {
        for (const ring of poly) {
          if (ring.length < 3) continue
          const s = simplifyRing(ring, LINE_TOLERANCE)
          if (s.length < 2) continue
          // [lng,lat,lng,lat,...] 평탄화 — JSON 이 작고 파싱도 빠르다
          const flat = []
          for (const [lng, lat] of s) flat.push(round(lng), round(lat))
          lines.push(flat)
          kept += s.length
        }
      }
    }
    const linesJson = JSON.stringify({ tolerance: LINE_TOLERANCE, rings: lines })
    await writeFile(resolve(GEO_DIR, 'admin1-lines.json'), linesJson)
    console.log(
      `   → admin1-lines.json  ${lines.length.toLocaleString()}개 선, ` +
        `${kept.toLocaleString()}점, ${(Buffer.byteLength(linesJson) / 1024 / 1024).toFixed(1)}MB`,
    )

    console.log('\n✅ 완료')
  })()
}

main().catch((err) => {
  console.error('❌', err.message)
  process.exit(1)
})
