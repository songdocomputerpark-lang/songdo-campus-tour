// 지도 뷰포트: 컨테이너(div) + SVG + 월드 그룹. pan/zoom 엔진(usePanZoom)을 연결하고 컨텍스트로 API 를 공급한다.
//
//  children  = 월드 좌표계의 SVG 요소 (CampusMap: site px, FloorPlan: floor px)
//  overlay   = 월드 밖 HTML 오버레이(컨트롤 등). MapCtx 안쪽이므로 useMapApi() 사용 가능
//  빈 곳 탭: 클릭 가능한 요소에는 반드시 data-hit 를 달 것 (더블탭 확대·배경탭 판정에서 제외)
import { useEffect, type CSSProperties, type ReactNode } from 'react'
import type { Bounds, Insets, Pt } from '../data/types'
import { MapCtx } from './MapContext'
import { usePanZoom, type PanZoomApi } from './usePanZoom'

interface Props {
  content: Bounds
  initialBounds?: Bounds
  /** 세로 화면에서 '맞춤'이 content 대신 맞출 영역 (usePanZoom 참고) */
  portraitFit?: Bounds
  insets: Insets
  maxScale?: number
  label: string
  className?: string
  style?: CSSProperties
  /** data-hit 요소가 아닌 곳을 탭했을 때. world = 월드 좌표 */
  onBackgroundTap?: (world: Pt) => void
  onApi?: (api: PanZoomApi | null) => void
  defs?: ReactNode
  children: ReactNode
  overlay?: ReactNode
}

export function MapViewport({
  content,
  initialBounds,
  portraitFit,
  insets,
  maxScale = 8,
  label,
  className,
  style,
  onBackgroundTap,
  onApi,
  defs,
  children,
  overlay,
}: Props) {
  const { containerRef, worldRef, api } = usePanZoom({ content, insets, maxScale, initialBounds, portraitFit })

  useEffect(() => {
    onApi?.(api)
    return () => onApi?.(null)
  }, [api, onApi])

  return (
    <MapCtx.Provider value={api}>
      <div
        ref={containerRef}
        className={`map-viewport ${className ?? ''}`}
        style={style}
        role="group"
        aria-label={label}
        tabIndex={0}
        onClick={(e) => {
          if ((e.target as Element).closest('[data-hit]') || !onBackgroundTap) return
          const r = e.currentTarget.getBoundingClientRect()
          onBackgroundTap(api.screenToWorld(e.clientX - r.left, e.clientY - r.top))
        }}
      >
        <svg className="block h-full w-full" xmlns="http://www.w3.org/2000/svg" role="presentation">
          <defs>{defs}</defs>
          <g ref={worldRef}>{children}</g>
        </svg>
      </div>
      {overlay}
    </MapCtx.Provider>
  )
}
