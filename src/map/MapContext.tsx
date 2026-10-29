// MapViewport 안쪽(월드 SVG · 오버레이)에서 지도 엔진에 접근하기 위한 컨텍스트와 훅.
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react'
import type { PanZoomApi } from './usePanZoom'

export const MapCtx = createContext<PanZoomApi | null>(null)

/** 가장 가까운 MapViewport 의 pan/zoom API (animateTo, focus, zoomBy …) */
export function useMapApi(): PanZoomApi {
  const api = useContext(MapCtx)
  if (!api) throw new Error('useMapApi must be used inside <MapViewport>')
  return api
}

export function useOptionalMapApi(): PanZoomApi | null {
  return useContext(MapCtx)
}

/**
 * 현재 배율 k 를 '양자화'해서 구독한다 (stepsPerOctave 단계/2배). 줌이 단계를 넘을 때만 재렌더.
 * 적응형 라벨(숨김/축약) 같은 '임계값 기반' 렌더링에 사용. 프레임마다 바뀌는 크기 보정은 CSS 변수 --ik 를 쓸 것.
 * 손가락 제스처 중에는 바뀌지 않는다(getSettledScale) — 손을 뗄 때 한 번 다시 그린다.
 */
export function useMapScale(stepsPerOctave = 3): number {
  const api = useMapApi()
  const subscribe = useCallback((cb: () => void) => api.subscribe(() => cb()), [api])
  const snap = useCallback(() => {
    const k = api.getSettledScale()
    return Math.pow(2, Math.round(Math.log2(k) * stepsPerOctave) / stepsPerOctave)
  }, [api, stepsPerOctave])
  return useSyncExternalStore(subscribe, snap, snap)
}
