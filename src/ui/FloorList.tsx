// "목록으로 보기": 현재 층의 시설 리스트(카테고리별). 평면도를 보기 어려운 환경의 대안이자 접근성 경로.
// 학생 안내 장소(★)는 번호 표식과 안내 이름을 함께 보여 준다.
import { ChevronRight } from 'lucide-react'
import { campus, floorLabel, getBuilding, getFloor } from '../data'
import type { CategoryId, Room } from '../data/types'
import { SpotMark } from '../features/tour/SpotChip'
import { useSpots, type Spot } from '../features/tour/spots'
import { tint } from '../lib/color'
import { CAT_KEEP } from '../map/categoryTint'
import { useAppStore } from '../store/useAppStore'
import { PanelHeader } from './PanelHeader'

const CAT_ORDER = Object.keys(campus.categories) as CategoryId[]

export function FloorList() {
  const buildingId = useAppStore((s) => s.buildingId)
  const floorId = useAppStore((s) => s.floorId)
  const roomId = useAppStore((s) => s.roomId)
  const selectRoom = useAppStore((s) => s.selectRoom)
  const closePanel = useAppStore((s) => s.closePanel)
  const exitFloor = useAppStore((s) => s.exitFloor)
  const spots = useSpots()
  const building = getBuilding(buildingId)
  const floor = getFloor(buildingId, floorId)
  if (!building || !floor) return null

  const groups = CAT_ORDER.map((c) => ({ cat: c, rooms: floor.rooms.filter((r) => r.cat === c) })).filter((g) => g.rooms.length > 0)

  return (
    <section aria-label={`${building.name} ${floorLabel(floor.floor)} 시설 목록`}>
      <PanelHeader
        eyebrow={`${building.en} · ${floor.floor}`}
        title={`${building.name} ${floorLabel(floor.floor)}`}
        subtitle={
          <>
            시설 {floor.rooms.length}곳
            {floor.schematic && <span className="ml-2 rounded-full border border-gold/50 bg-gold-soft/60 px-1.5 text-[0.6875rem] font-semibold text-gold-deep">개략도</span>}
          </>
        }
        accent={building.color}
        onClose={closePanel}
        closeLabel="목록 닫기"
      />
      <div className="px-3 pb-6">
        <button
          type="button"
          onClick={exitFloor}
          className="mx-2 mb-3 inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-full border border-line px-3.5 text-[0.8125rem] font-semibold text-ink-soft hover:border-navy/40 hover:text-navy"
        >
          ← 캠퍼스 지도로 돌아가기
        </button>
        {groups.map((g) => (
          <div key={g.cat} className="mb-3">
            <h3 className="eyebrow flex items-center gap-2 px-2 py-1.5 text-ink-mute">
              <span className="h-2.5 w-2.5 rounded-[3px] border border-ink/15" style={{ background: tint(building.color, CAT_KEEP[g.cat]) }} aria-hidden="true" />
              {campus.categories[g.cat]}
            </h3>
            <ul>
              {g.rooms.map((r) => (
                <RoomRow key={r.id} room={r} selected={r.id === roomId} onSelect={() => selectRoom(r.id)} spot={spots.byRoom.get(r.id)} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

function RoomRow({ room, selected, onSelect, spot }: { room: Room; selected: boolean; onSelect: () => void; spot?: Spot }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={`group flex min-h-[2.75rem] w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-[0.9375rem] transition-colors duration-180 ${
          selected ? 'bg-navy/[0.07] font-semibold text-navy' : 'text-ink hover:bg-paper-2'
        }`}
      >
        {spot && <SpotMark spot={spot} size={22} />}
        <span className="min-w-0 flex-1">
          <span className="block truncate">
            {room.name}
            {spot && <span className="sr-only">, {spot.no === null ? '출발 지점' : `학생 안내 장소 ${spot.no}번`}</span>}
          </span>
          {spot && spot.label !== room.name && <span className="block truncate text-[0.75rem] font-semibold text-gold-deep">안내 이름 · {spot.label}</span>}
          {room.sub && <span className="block truncate text-[0.75rem] font-normal text-ink-mute">{room.sub}</span>}
        </span>
        <ChevronRight size={16} className="shrink-0 text-ink-mute opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
      </button>
    </li>
  )
}
