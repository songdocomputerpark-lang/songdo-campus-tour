// 설명회 안내 패널의 현재 탭 — 패널(EventPanel)과 지도(CampusMap)가 같은 값을 보도록 한 곳에서 계산한다.
import { useMemo } from 'react'
import { useContent } from '../../lib/content'
import { useAppStore } from '../../store/useAppStore'
import { resolveEventTab, venueOf, type EventTab, type Venue } from './programModel'

export interface EventTabState {
  /** 지금 보여 줄 탭 */
  tab: EventTab
  /** 식순을 쓸 수 있는가 (false 면 '식순' 탭을 숨기고 학교 투어 장소만 보인다) */
  hasProgram: boolean
  /** 콘텐츠를 아직 불러오는 중 */
  loading: boolean
}

export function useEventTab(): EventTabState {
  const stored = useAppStore((s) => s.eventTab)
  const program = useContent((s) => s.program)
  const ready = useContent((s) => s.status === 'ready')
  return { tab: resolveEventTab(stored, program, ready), hasProgram: !!program, loading: !ready && !program }
}

/**
 * 지도의 '설명회 장소 강조' 모드: 안내 모드의 전체 안내에서 식순 탭이 보이고 장소 건물을 알 수 있을 때, 그 장소. 아니면 null.
 * (이때 지도는 모든 ★ 카드 대신 장소 건물만 강조한다)
 */
export function useVenueMode(): Venue | null {
  const active = useAppStore((s) => s.event.active)
  const spotNo = useAppStore((s) => s.event.spotNo)
  const program = useContent((s) => s.program)
  const { tab } = useEventTab()
  return useMemo(() => (active && spotNo === null && tab === 'program' ? venueOf(program) : null), [active, spotNo, tab, program])
}
