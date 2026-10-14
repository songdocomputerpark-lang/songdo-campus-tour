// 방위 표시. deg = "지도(평면도)의 위쪽 → 진북" 시계방향 각도 (campus.site.north / building.northDeg)
import { campus, getBuilding } from '../data'
import { useAppStore } from '../store/useAppStore'
import { NorthNeedle } from './icons'

/** 현재 화면(캠퍼스/층 평면도)에 맞는 북쪽 각도 */
export function useNorthDeg(): number {
  const view = useAppStore((s) => s.view)
  const buildingId = useAppStore((s) => s.buildingId)
  const b = view === 'floor' ? getBuilding(buildingId) : undefined
  return b ? b.northDeg : campus.site.north
}

export function Compass({ deg, size = 'md', className = '' }: { deg: number; size?: 'md' | 'sm'; className?: string }) {
  const sm = size === 'sm'
  return (
    <div
      className={`glass-surface relative grid place-items-center rounded-full text-navy shadow-float ${sm ? 'h-10 w-10' : 'h-14 w-14'} ${className}`}
      role="img"
      aria-label={`북쪽 방향 표시 — 화면 위쪽에서 시계방향으로 약 ${Math.round(deg)}도`}
      title="북쪽"
    >
      <div className="transition-transform duration-[700ms] ease-out" style={{ transform: `rotate(${deg}deg)` }}>
        <NorthNeedle size={sm ? 24 : 38} />
      </div>
      <span
        className={`pointer-events-none absolute inset-0 grid place-items-center font-display font-semibold leading-none text-navy ${sm ? 'text-[0.5rem]' : 'text-[0.7rem]'}`}
        style={{ transform: `rotate(${deg}deg) translateY(${sm ? '-0.97rem' : '-1.55rem'}) rotate(${-deg}deg)` }}
        aria-hidden="true"
      >
        N
      </span>
    </div>
  )
}
