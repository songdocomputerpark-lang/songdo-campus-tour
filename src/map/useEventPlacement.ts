// 입학설명회 안내 카드 배치 구독 훅 (MapViewport 안쪽). 배율이 5% 이상 바뀔 때만 새 배치를 돌려준다 — useLabelPlacement 와 같은 방식.
import { useCallback, useSyncExternalStore } from 'react'
import { spotByNo } from '../features/event/eventModel'
import { useSpots } from '../features/tour/spots'
import { uiScale } from '../lib/env'
import { useAppStore } from '../store/useAppStore'
import { useIsNarrow } from '../ui/useMedia'
import type { BuildingId } from '../data/types'
import { eventModelFor, placeEventCards, type EvModel, type EventPlacement } from './eventLayout'
import { useMapApi } from './MapContext'

/** 선택한 안내 장소의 건물 (안내 모드가 아니거나 선택이 없으면 null) */
export function useEventSelectedBuilding(): BuildingId | null {
  const active = useAppStore((s) => s.event.active)
  const spotNo = useAppStore((s) => s.event.spotNo)
  const spots = useSpots()
  return active ? (spotByNo(spots, spotNo)?.buildingId ?? null) : null
}

export function useEventModel(): EvModel {
  return eventModelFor(useSpots())
}

export function useEventPlacement(): EventPlacement {
  const api = useMapApi()
  const narrow = useIsNarrow()
  const model = useEventModel()
  const selected = useEventSelectedBuilding()
  const subscribe = useCallback((cb: () => void) => api.subscribe(() => cb()), [api])
  const snap = useCallback(() => placeEventCards(model, api.getTransform().k, narrow, uiScale(), selected), [api, model, narrow, selected])
  return useSyncExternalStore(subscribe, snap, snap)
}
