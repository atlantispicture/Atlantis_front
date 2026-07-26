// Natural Earth 110m 국가 경계 GeoJSON 다운로드.
// 사용: npm run fetch-data  (Node 18+, 전역 fetch 사용)
//
// 출력: public/geo/countries-110m.geojson  (~700KB, ISO_A3 · ADMIN 속성 포함)
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SOURCE =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson'
const OUT = resolve(__dirname, '../public/geo/countries-110m.geojson')

async function main() {
  console.log(`⬇  다운로드: ${SOURCE}`)
  const res = await fetch(SOURCE)
  if (!res.ok) throw new Error(`HTTP ${res.status} — 다운로드 실패`)

  const text = await res.text()
  const json = JSON.parse(text) // 유효성 검증

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(json))

  const kb = Math.round(Buffer.byteLength(JSON.stringify(json)) / 1024)
  console.log(`✅ 저장 완료: public/geo/countries-110m.geojson (${json.features.length}개국, ${kb}KB)`)
}

main().catch((err) => {
  console.error('❌', err.message)
  process.exit(1)
})
