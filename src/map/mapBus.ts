// 지도 인스턴스 레지스트리 — 지도 밖(툴바·GPS 컨트롤·검색·오버레이)에서 카메라를 움직이거나 배율을 읽을 때 사용.
//   CampusMap / FloorPlan 이 마운트되면 자신의 PanZoomApi 를 등록한다.
import { create } from 'zustand'
import type { Pt } from '../data/types'
import { useAppStore } from '../store/useAppStore'
import type { PanZoomApi } from './usePanZoom'

export type MapKind = 'campus' | 'floor'

export const useMapBus = create<Record<MapKind, PanZoomApi | null>>(() => ({ campus: null, floor: null }))

export function registerMap(kind: MapKind, api: PanZoomApi | null): void {
  useMapBus.setState({ [kind]: api } as Record<MapKind, PanZoomApi | null>)
}
export function getMapApi(kind: MapKind): PanZoomApi | null {
  return useMapBus.getState()[kind]
}
/** 컴포넌트에서 구독: const api = useRegisteredMap('campus') */
export function useRegisteredMap(kind: MapKind): PanZoomApi | null {
  return useMapBus((s) => s[kind])
}

/**
 * 배치도(site px) 좌표로 카메라 이동. 층 평면도 화면이면 캠퍼스 지도로 먼저 돌아간다.
 * 예) GPS "내 위치로 이동": focusSitePoint(px, { k: 1.8 })
 */
export function focusSitePoint(pt: Pt, opts: { k?: number; duration?: number } = {}): void {
  const st = useAppStore.getState()
  if (st.view === 'floor') st.exitFloor()
  const api = getMapApi('campus')
  if (!api) return
  const k = opts.k ?? Math.max(api.getTransform().k, 1.6)
  api.focus(pt, { k, duration: opts.duration })
}
