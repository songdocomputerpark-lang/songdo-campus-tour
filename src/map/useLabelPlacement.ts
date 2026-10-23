// 건물 이름표 배치 구독 훅 (MapViewport 안쪽에서 사용).
// 배율이 5% 이상 바뀔 때만 새 배치를 돌려주므로, 줌 애니메이션 중에도 재렌더가 가볍다.
// 학생 안내 장소 핀(spotPins)이 먼저 자리를 차지하고 이름표는 핀을 피해 놓인다 — 캠퍼스 지도와 GPS 글자가 같은 배치를 본다.
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useVenueMode } from '../features/event/useEventTab'
import { useSpots } from '../features/tour/spots'
import { uiScale } from '../lib/env'
import { useAppStore } from '../store/useAppStore'
import { useIsNarrow } from '../ui/useMedia'
import { placeLabels, type LabelPlacement } from './buildingLabels'
import { eventModelFor, eventObstacles } from './eventLayout'
import { useMapApi } from './MapContext'
import { useEventSelectedBuilding } from './useEventPlacement'
import { pinInputFor } from './spotPins'

export function useLabelPlacement(): LabelPlacement {
  const api = useMapApi()
  const narrow = useIsNarrow()
  const spots = useSpots()
  const eventActive = useAppStore((s) => s.event.active)
  const selected = useEventSelectedBuilding()
  const venueMode = !!useVenueMode()
  // 입학설명회 안내 모드에서는 핀 대신 말풍선 카드가 먼저 자리를 차지한다. 식순 탭(설명회 장소 강조)에서는 카드도 핀도 없다
  const obstacles = useMemo(
    () => (venueMode ? undefined : eventActive ? eventObstacles(eventModelFor(spots), selected) : pinInputFor(spots).obstacles),
    [venueMode, eventActive, spots, selected],
  )
  const subscribe = useCallback((cb: () => void) => api.subscribe(() => cb()), [api])
  const snap = useCallback(() => placeLabels(api.getTransform().k, narrow, uiScale(), obstacles), [api, narrow, obstacles])
  return useSyncExternalStore(subscribe, snap, snap)
}
