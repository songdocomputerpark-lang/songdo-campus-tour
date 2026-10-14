// 건물 이름표 배치 구독 훅 (MapViewport 안쪽에서 사용).
// 배율이 5% 이상 바뀔 때만 새 배치를 돌려주므로, 줌 애니메이션 중에도 재렌더가 가볍다.
import { useCallback, useSyncExternalStore } from 'react'
import { uiScale } from '../lib/env'
import { useIsNarrow } from '../ui/useMedia'
import { placeLabels, type LabelPlacement } from './buildingLabels'
import { useMapApi } from './MapContext'

export function useLabelPlacement(): LabelPlacement {
  const api = useMapApi()
  const narrow = useIsNarrow()
  const subscribe = useCallback((cb: () => void) => api.subscribe(() => cb()), [api])
  const snap = useCallback(() => placeLabels(api.getTransform().k, narrow, uiScale()), [api, narrow])
  return useSyncExternalStore(subscribe, snap, snap)
}
