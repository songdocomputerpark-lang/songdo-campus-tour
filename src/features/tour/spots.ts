/**
 * features/tour/spots.ts — 학생 안내 장소(★) 색인
 *
 *  - 지점 목록 = content/tour.json 의 stops (순서 그대로). start=true 인 지점은 '출발'(번호 없음), 나머지는 1, 2, 3 … 별표 번호.
 *  - 표시 이름 = stop.label (예: 학생식당 → "급식실"), 없으면 시설명. 데이터(floors.json)의 시설명은 바꾸지 않는다.
 *  - 지도(캠퍼스 핀·평면도 강조), 층 선택기, 패널, 투어가 모두 이 색인 하나를 본다 — tour.json 만 고치면 전부 따라 바뀐다.
 */
import { floorLabel, getRoom } from '../../data'
import type { BuildingId, FloorId, Tour } from '../../data/types'
import { useContent } from '../../lib/content'

export interface Spot {
  /** tour.json 안의 위치(0-based) = 투어 단계 index */
  index: number
  roomId: string
  /** 표시 이름 (label ?? 시설명) */
  label: string
  /** floors.json 의 시설명 */
  roomName: string
  /** 별표 번호(1부터). 출발 지점은 null */
  no: number | null
  start: boolean
  buildingId: BuildingId
  buildingName: string
  floorId: FloorId
  /** "급식관동 · 3층" */
  locationText: string
}

export interface SpotIndex {
  /** 투어 순서 그대로 (출발 포함) */
  list: Spot[]
  /** 별표 지점만 (번호 순) */
  stars: Spot[]
  start: Spot | null
  byRoom: ReadonlyMap<string, Spot>
  byBuilding: ReadonlyMap<BuildingId, Spot[]>
  /** key = spotFloorKey(building, floor) */
  byFloor: ReadonlyMap<string, Spot[]>
  /** 내용이 같으면 같은 문자열 — 캐시 키 */
  signature: string
}

export function spotFloorKey(buildingId: string, floorId: string): string {
  return `${buildingId}/${floorId}`
}

export function buildSpots(tour: Tour): SpotIndex {
  const list: Spot[] = []
  const byRoom = new Map<string, Spot>()
  const byBuilding = new Map<BuildingId, Spot[]>()
  const byFloor = new Map<string, Spot[]>()
  let no = 0
  tour.stops.forEach((st, index) => {
    const ref = getRoom(st.facility)
    if (!ref || byRoom.has(ref.room.id)) return
    const start = st.start === true
    const spot: Spot = {
      index,
      roomId: ref.room.id,
      label: st.label?.trim() || ref.room.name,
      roomName: ref.room.name,
      no: start ? null : ++no,
      start,
      buildingId: ref.building.id,
      buildingName: ref.building.name,
      floorId: ref.floor.floor,
      locationText: `${ref.building.name} · ${floorLabel(ref.floor.floor)}`,
    }
    list.push(spot)
    byRoom.set(spot.roomId, spot)
    const b = byBuilding.get(spot.buildingId) ?? []
    b.push(spot)
    byBuilding.set(spot.buildingId, b)
    const fk = spotFloorKey(spot.buildingId, spot.floorId)
    const f = byFloor.get(fk) ?? []
    f.push(spot)
    byFloor.set(fk, f)
  })
  const stars = list.filter((s) => s.no !== null)
  return {
    list,
    stars,
    start: list.find((s) => s.start) ?? null,
    byRoom,
    byBuilding,
    byFloor,
    signature: list.map((s) => `${s.roomId}:${s.no ?? 'S'}:${s.label}`).join('|'),
  }
}

const cache = new WeakMap<Tour, SpotIndex>()

/** 같은 tour 객체에는 같은 색인을 돌려준다 */
export function spotsFor(tour: Tour): SpotIndex {
  let s = cache.get(tour)
  if (!s) {
    s = buildSpots(tour)
    cache.set(tour, s)
  }
  return s
}

export function useSpots(): SpotIndex {
  return spotsFor(useContent((s) => s.tour))
}

export function getSpots(): SpotIndex {
  return spotsFor(useContent.getState().tour)
}

/** 화면에 쓰는 짧은 표기: 별표 지점 "★3", 출발 "출발" */
export function spotBadgeText(s: Pick<Spot, 'no'>): string {
  return s.no === null ? '출발' : `★${s.no}`
}

/** 접근성 라벨: "학생 안내 장소 3번 중앙현관" / "출발 지점 체육관" */
export function spotAria(s: Pick<Spot, 'no' | 'label'>): string {
  return s.no === null ? `출발 지점 ${s.label}` : `학생 안내 장소 ${s.no}번 ${s.label}`
}
