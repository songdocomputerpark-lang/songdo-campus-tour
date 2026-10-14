// 브레드크럼: 캠퍼스 › 본관동 › 2층  (각 단계 클릭으로 상위로 이동)
import { ChevronRight } from 'lucide-react'
import { floorLabel, getBuilding, getFloor } from '../data'
import { useAppStore } from '../store/useAppStore'

export function Breadcrumb({ className = '' }: { className?: string }) {
  const view = useAppStore((s) => s.view)
  const buildingId = useAppStore((s) => s.buildingId)
  const floorId = useAppStore((s) => s.floorId)
  const tourActive = useAppStore((s) => s.tour.active)
  const goCampus = useAppStore((s) => s.goCampus)
  const selectBuilding = useAppStore((s) => s.selectBuilding)

  const building = getBuilding(buildingId)
  const floor = view === 'floor' ? getFloor(buildingId, floorId) : undefined

  const items: { key: string; label: string; onClick?: () => void; badge?: string }[] = [
    { key: 'campus', label: '캠퍼스', onClick: building ? goCampus : undefined },
  ]
  if (building) items.push({ key: 'b', label: building.name, onClick: floor ? () => selectBuilding(building.id) : undefined })
  if (floor) items.push({ key: 'f', label: floorLabel(floor.floor), badge: floor.schematic ? '개략도' : undefined })

  return (
    <nav aria-label="현재 위치" className={className}>
      <ol className="flex min-w-0 items-center gap-0.5 text-[0.8125rem] font-medium">
        {tourActive && (
          <li className="mr-1.5 shrink-0 rounded-full bg-navy px-2 py-0.5 text-[0.6875rem] font-semibold tracking-wide text-white">추천 투어</li>
        )}
        {items.map((it, i) => {
          const last = i === items.length - 1
          return (
            <li key={it.key} className="flex min-w-0 items-center gap-0.5">
              {i > 0 && <ChevronRight size={14} className="shrink-0 text-ink-mute" aria-hidden="true" />}
              {it.onClick && !last ? (
                <button
                  type="button"
                  onClick={it.onClick}
                  className="min-h-[2rem] truncate rounded-md px-1.5 text-ink-soft underline-offset-4 transition-colors hover:text-navy hover:underline"
                >
                  {it.label}
                </button>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={`truncate px-1.5 ${last ? 'font-semibold text-navy' : 'text-ink-soft'}`}>
                  {it.label}
                </span>
              )}
              {it.badge && (
                <span className="ml-1 shrink-0 rounded-full border border-gold/50 bg-gold-soft/60 px-1.5 text-[0.6875rem] font-semibold text-gold-deep">
                  {it.badge}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
