// 축척 막대 (campus 전용 — metersPerPx 는 campus.geo.metersPerPx). DOM 직접 갱신(재렌더 없음).
import { useEffect, useRef } from 'react'
import type { PanZoomApi } from './usePanZoom'

const NICE = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000]

export function ScaleBar({ api, metersPerPx, className = '' }: { api: PanZoomApi | null; metersPerPx: number; className?: string }) {
  const barRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!api) return
    const update = () => {
      const pxPerM = api.getTransform().k / metersPerPx
      let best = NICE[0]
      for (const n of NICE) if (n * pxPerM <= 132) best = n
      const w = best * pxPerM
      if (barRef.current) barRef.current.style.width = `${Math.max(8, w)}px`
      if (textRef.current) textRef.current.textContent = best >= 1000 ? `${best / 1000} km` : `${best} m`
    }
    update()
    return api.subscribe(update)
  }, [api, metersPerPx])

  return (
    <div className={`pointer-events-none select-none ${className}`} role="img" aria-label="축척 막대">
      <span ref={textRef} className="tnum mb-1 block text-[0.6875rem] font-semibold tracking-wide text-ink-soft">
        50 m
      </span>
      <div
        ref={barRef}
        className="h-[7px] w-24 border-x-[1.5px] border-b-[1.5px] border-ink-soft/80"
        style={{ transition: 'width 120ms linear' }}
      />
    </div>
  )
}
