import { useRegions } from '@/lib/useRegions'
import { useUiStore } from '@/store/useUiStore'
import { useVisitStore } from '@/store/useVisitStore'

/**
 * 지역 데이터를 받아오거나 지오메트리를 굽는 동안 띄우는 로딩 표시.
 *
 * 나라를 누르면 (1) 지역 파일 내려받기 → (2) 파싱 → (3) 지오메트리 굽기 순으로
 * 최대 200ms 가량 반응이 없어 '렉'처럼 느껴진다. 그 구간을 눈에 보이게 만든다.
 */
export default function Loader() {
  const selected = useVisitStore((s) => s.selected)
  const { status } = useRegions(selected?.code) // 캐시 공유 — 추가 요청 없음
  const baking = useUiStore((s) => s.regionBaking)

  const busy = status === 'loading' || baking
  if (!busy) return null

  return (
    <div className="loader" role="status" aria-live="polite">
      <span className="loader__ring" />
      <span className="loader__text">
        {selected ? `${selected.name} 지역 불러오는 중…` : '불러오는 중…'}
      </span>
    </div>
  )
}
