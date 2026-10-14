// 층 선택기: 세로 '엘리베이터' 버튼 (데스크톱 좌측 하단 / 모바일 우측 세로 칩). 위층이 위.
// 활성 표시기는 층 사이를 부드럽게 미끄러진다. 위치는 상위(MapChrome)가 정한다.
import { floorLabel, getBuilding, floorsOf } from '../data'
import { useAppStore } from '../store/useAppStore'

const ROW = 44 // px (터치 타깃 ≥ 44)

export function FloorSelector({ className = '' }: { className?: string }) {
  const buildingId = useAppStore((s) => s.buildingId)
  const floorId = useAppStore((s) => s.floorId)
  const selectFloor = useAppStore((s) => s.selectFloor)
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
          return (
            <button
              key={f}
              type="button"
              onClick={() => selectFloor(f, building.id)}
              aria-current={active ? 'true' : undefined}
              aria-label={floorLabel(f)}
              title={floorLabel(f)}
              className={`tnum relative z-10 grid w-11 place-items-center rounded-[1.0625rem] text-[0.9375rem] font-bold tracking-tight transition-colors duration-180 ${
                active ? 'text-white' : 'text-ink-soft hover:text-navy'
              }`}
              style={{ height: ROW }}
            >
              {f}
            </button>
          )
        })}
      </div>
    </div>
  )
}
