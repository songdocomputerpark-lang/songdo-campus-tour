// 지도 조작 버튼: 확대 / 축소 / 전체 맞춤 (우하단). compact = 폰에서 시트가 올라와 지도가 좁을 때 — 확대·축소만
import { Maximize2, Minus, Plus } from 'lucide-react'
import type { PanZoomApi } from './usePanZoom'

const btn =
  'grid h-11 w-11 place-items-center text-ink-soft transition-colors duration-180 hover:bg-paper-2 hover:text-navy active:bg-paper-3 focus-visible:z-10'

export function MapControls({ api, compact = false, className = '' }: { api: PanZoomApi | null; compact?: boolean; className?: string }) {
  return (
    <div className={`glass-surface flex flex-col overflow-hidden rounded-2xl shadow-float ${className}`} role="group" aria-label="지도 조작">
      <button type="button" className={btn} onClick={() => api?.zoomBy(1.5)} aria-label="확대" title="확대 (+)">
        <Plus size={20} strokeWidth={1.8} />
      </button>
      <div className="mx-2 h-px bg-line" />
      <button type="button" className={btn} onClick={() => api?.zoomBy(1 / 1.5)} aria-label="축소" title="축소 (−)">
        <Minus size={20} strokeWidth={1.8} />
      </button>
      {!compact && (
        <>
          <div className="mx-2 h-px bg-line" />
          <button type="button" className={btn} onClick={() => api?.fit()} aria-label="전체 맞춤" title="전체 맞춤 (0)">
            <Maximize2 size={18} strokeWidth={1.8} />
          </button>
        </>
      )}
    </div>
  )
}
