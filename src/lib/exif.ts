/**
 * 사진의 촬영 일시(EXIF DateTimeOriginal)를 읽는다.
 *
 * 필요한 태그가 하나뿐이라 외부 라이브러리 없이 직접 파싱한다.
 * 구조: JPEG(0xFFD8) → APP1 마커(0xFFE1) → "Exif\0\0" → TIFF 헤더 →
 *       IFD0 → ExifIFD 포인터(0x8769) → DateTimeOriginal(0x9003, ASCII)
 *
 * 영상(mp4 등)은 컨테이너가 달라 EXIF가 없다 — 파일 수정시각으로 대체한다.
 */

const TAG_EXIF_IFD_POINTER = 0x8769
const TAG_DATETIME_ORIGINAL = 0x9003
const TAG_DATETIME_DIGITIZED = 0x9004
const TAG_DATETIME = 0x0132 // IFD0 fallback

/** 'YYYY:MM:DD HH:MM:SS' → Date (로컬 시각으로 해석) */
function parseExifDate(s: string): Date | null {
  const m = s.trim().match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const [, y, mo, d, h, mi, se] = m.map(Number) as unknown as number[]
  const date = new Date(y, mo - 1, d, h, mi, se)
  return Number.isNaN(date.getTime()) ? null : date
}

/** 한 IFD를 훑어 원하는 태그 값을 모은다. */
function readIfd(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  le: boolean,
): { dates: Map<number, string>; exifPointer: number | null } {
  const dates = new Map<number, string>()
  let exifPointer: number | null = null

  const base = tiffStart + ifdOffset
  if (base + 2 > view.byteLength) return { dates, exifPointer }

  const count = view.getUint16(base, le)
  for (let i = 0; i < count; i++) {
    const entry = base + 2 + i * 12
    if (entry + 12 > view.byteLength) break

    const tag = view.getUint16(entry, le)
    const type = view.getUint16(entry + 2, le)
    const num = view.getUint32(entry + 4, le)

    if (tag === TAG_EXIF_IFD_POINTER) {
      exifPointer = view.getUint32(entry + 8, le)
      continue
    }

    const isDateTag =
      tag === TAG_DATETIME_ORIGINAL || tag === TAG_DATETIME_DIGITIZED || tag === TAG_DATETIME
    if (!isDateTag || type !== 2) continue // type 2 = ASCII

    // 4바이트를 넘으면 값이 아니라 오프셋이 들어 있다
    const valueOffset = num > 4 ? tiffStart + view.getUint32(entry + 8, le) : entry + 8
    if (valueOffset + num > view.byteLength) continue

    let s = ''
    for (let k = 0; k < num - 1; k++) s += String.fromCharCode(view.getUint8(valueOffset + k))
    dates.set(tag, s)
  }

  return { dates, exifPointer }
}

/** JPEG 바이트에서 촬영 일시를 찾는다. 못 찾으면 null. */
export function readExifDate(buffer: ArrayBuffer): Date | null {
  const view = new DataView(buffer)
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return null // JPEG 아님

  // APP1 세그먼트 찾기
  let offset = 2
  let tiffStart = -1
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset, false)
    if ((marker & 0xff00) !== 0xff00) break
    const size = view.getUint16(offset + 2, false)

    if (marker === 0xffe1) {
      const head = offset + 4
      // "Exif\0\0"
      if (
        head + 6 <= view.byteLength &&
        view.getUint32(head, false) === 0x45786966 &&
        view.getUint16(head + 4, false) === 0x0000
      ) {
        tiffStart = head + 6
        break
      }
    }
    if (marker === 0xffda) break // 이미지 데이터 시작 — 더 볼 필요 없음
    offset += 2 + size
  }
  if (tiffStart < 0 || tiffStart + 8 > view.byteLength) return null

  // TIFF 헤더: 바이트 순서 + 매직 42 + IFD0 오프셋
  const endian = view.getUint16(tiffStart, false)
  if (endian !== 0x4949 && endian !== 0x4d4d) return null
  const le = endian === 0x4949
  if (view.getUint16(tiffStart + 2, le) !== 42) return null

  const ifd0 = view.getUint32(tiffStart + 4, le)
  const first = readIfd(view, tiffStart, ifd0, le)

  // 촬영 시각은 보통 ExifIFD 안에 있다
  let dates = first.dates
  if (first.exifPointer != null) {
    const sub = readIfd(view, tiffStart, first.exifPointer, le)
    dates = new Map([...first.dates, ...sub.dates])
  }

  const raw =
    dates.get(TAG_DATETIME_ORIGINAL) ??
    dates.get(TAG_DATETIME_DIGITIZED) ??
    dates.get(TAG_DATETIME)
  return raw ? parseExifDate(raw) : null
}

/**
 * 파일의 촬영 일시. EXIF가 있으면 그걸, 없으면 파일 수정시각으로 대체한다.
 * 두 번째 값은 출처 — UI에서 "촬영일 추정"임을 알려주는 데 쓴다.
 */
export async function readCapturedAt(
  file: File,
): Promise<{ at: Date; source: 'exif' | 'file' }> {
  if (file.type === 'image/jpeg') {
    try {
      // EXIF는 앞부분에 있다 — 파일 전체를 읽지 않는다.
      const head = await file.slice(0, 256 * 1024).arrayBuffer()
      const exif = readExifDate(head)
      if (exif) return { at: exif, source: 'exif' }
    } catch {
      // 파싱 실패는 치명적이지 않다 — 아래 대체값 사용
    }
  }
  return { at: new Date(file.lastModified), source: 'file' }
}
