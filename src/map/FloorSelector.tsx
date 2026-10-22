// 층 선택기: 세로 '엘리베이터' 버튼 (데스크톱 좌측 하단 / 모바일 우측 세로 칩). 위층이 위.
// 활성 표시기는 층 사이를 부드럽게 미끄러진다. 위치는 상위(MapChrome)가 정한다.
// 학생 안내 장소(★)가 있는 층은 버튼 모서리에 작은 금별(출발 층은 남색 깃발 점)을 단다.
import { floorLabel, getBuilding, floorsOf } from '../data'
import { spotFloorKey, useSpots } from '../features/tour/spots'
import { useAppStore } from '../store/useAppStore'
import { starPath } from './icons'

const ROW = 44 // px (터치 타깃 ≥ 44)
const MARK_STAR = starPath(5.6)

export function FloorSelector({ className = '' }: { className?: string }) {
  const buildingId = useAppStore((s) => s.buildingId)
  const floorId = useAppStore((s) => s.floorId)
  const selectFloor = useAppStore((s) => s.selectFloor)
  const spots = useSpots()
  const building = getBuilding(buildingId)
  if (!building) return null
  const list = floorsOf(building.id)
    .map((f) => f.floor)
    .reverse() // 높은 층이 위
  const activeIdx = Math.max(0, list.indexOf(floorId ?? list[0]))

  return (
    <div className={`flex flex-col items-center ${className}`} role="group" aria-label={`${building.name} 층 선택`}>
      <div className="glass-surface relative flex flex-col rounded-[1.375rem] p-1 shadow-float">
        <span
          aria-hidden="true"
          className="absolute left-1 right-1 top-1 rounded-[1.0625rem] bg-navy shadow-soft transition-transform duration-[320ms] ease-out"
          style={{ height: ROW, transform: `translateY(${activeIdx * ROW}px)` }}
        />
        {list.map((f) => {
          const active = f === floorId
          const here = spots.byFloor.get(spotFloorKey(building.id, f)) ?? []
          const stars = here.filter((s) => s.no !== null)
          const start = here.some((s) => s.no === null)
          const note = [stars.length ? `학생 안내 장소 ${stars.map((s) => s.label).join(', ')}` : '', start ? '출발 지점' : ''].filter(Boolean).join(', ')
          return (
            <button
              key={f}
              type="button"
              onClick={() => selectFloor(f, building.id)}
              aria-current={active ? 'true' : undefined}
              aria-label={note ? `${floorLabel(f)}, ${note}` : floorLabel(f)}
              title={note ? `${floorLabel(f)} · ${here.map((s) => s.label).join(' · ')}` : floorLabel(f)}
              className={`tnum relative z-10 grid w-11 place-items-center rounded-[1.0625rem] text-[0.9375rem] font-bold tracking-tight transition-colors duration-180 ${
                active ? 'text-white' : 'text-ink-soft hover:text-navy'
              }`}
              style={{ height: ROW }}
            >
              {f}
              {stars.length > 0 && (
                <svg className="pointer-events-none absolute -right-0.5 top-0.5" width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true">
                  <path d={MARK_STAR} style={{ fill: 'rgb(var(--star))', stroke: 'rgb(var(--star-deep))', strokeWidth: 0.9, strokeLinejoin: 'round' }} />
                </svg>
              )}
              {start && stars.length === 0 && (
                <span className={`pointer-events-none absolute right-1 top-1.5 h-2 w-2 rounded-full border ${active ? 'border-navy bg-white' : 'border-surface bg-navy'}`} aria-hidden="true" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
