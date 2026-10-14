// 데이터 접근 헬퍼. campus.json / floors.json 은 번들에 import 된다 (수정 금지).
import campusJson from './campus.json'
import floorsJson from './floors.json'
import { distToPolygon, pointInPolygon } from '../lib/geometry'
import type {
  Building,
  BuildingId,
  CampusData,
  CategoryId,
  Floor,
  FloorId,
  Pt,
  Room,
  RoomRef,
} from './types'

export * from './types'

export const campus = campusJson as unknown as CampusData
export const allFloors = floorsJson as unknown as Floor[]
export const buildings: Building[] = campus.buildings
export const site = campus.site

/** 층 순서: B1 < 1F < 2F < 3F < 4F */
export const FLOOR_ORDER: readonly FloorId[] = ['B1', '1F', '2F', '3F', '4F']
export function floorIndex(f: FloorId): number {
  return FLOOR_ORDER.indexOf(f)
}

const buildingMap = new Map<string, Building>(buildings.map((b) => [b.id, b]))
const floorMap = new Map<string, Floor>(allFloors.map((f) => [`${f.building}/${f.floor}`, f]))

export function isBuildingId(s: string | null | undefined): s is BuildingId {
  return !!s && buildingMap.has(s)
}
export function isFloorId(s: string | null | undefined): s is FloorId {
  return !!s && (FLOOR_ORDER as readonly string[]).includes(s)
}

export function getBuilding(id: string | null | undefined): Building | undefined {
  return id ? buildingMap.get(id) : undefined
}

export function getFloor(buildingId: string | null | undefined, floorId: string | null | undefined): Floor | undefined {
  return buildingId && floorId ? floorMap.get(`${buildingId}/${floorId}`) : undefined
}

/** 건물의 층 평면도 목록(낮은 층 → 높은 층) */
export function floorsOf(buildingId: string): Floor[] {
  return allFloors
    .filter((f) => f.building === buildingId)
    .sort((a, b) => floorIndex(a.floor) - floorIndex(b.floor))
}

export const roomsIndex: Map<string, RoomRef> = (() => {
  const m = new Map<string, RoomRef>()
  for (const floor of allFloors) {
    const building = buildingMap.get(floor.building)
    if (!building) continue
    for (const room of floor.rooms) m.set(room.id, { room, floor, building })
  }
  return m
})()

export const allRooms: RoomRef[] = Array.from(roomsIndex.values())

export function getRoom(id: string | null | undefined): RoomRef | undefined {
  return id ? roomsIndex.get(id) : undefined
}

export function roomsOnFloor(buildingId: string, floorId: string): Room[] {
  return getFloor(buildingId, floorId)?.rooms ?? []
}

/** B1→"지하 1층", 1F→"1층" */
export function floorLabel(f: FloorId): string {
  return f === 'B1' ? '지하 1층' : `${f.replace('F', '')}층`
}
/** 층 선택기 칩용 짧은 표기: B1, 1F … */
export function floorShort(f: FloorId): string {
  return f
}

export function categoryLabel(id: CategoryId): string {
  return campus.categories[id] ?? id
}

/** "본관동 · 2층" */
export function locationLabel(ref: { building: Building; floor: Floor }): string {
  return `${ref.building.name} · ${floorLabel(ref.floor.floor)}`
}

/**
 * 교실(cat 'classroom') 이름 "1-3" → "1학년 3반 교실 · 2025 배치도 기준". 교실이 아니거나 형식이 다르면 null.
 * 이름은 데이터 그대로이며, 학년·반은 이름에서 읽어 보여 주기만 한다.
 */
export function classroomSubtitle(room: Pick<Room, 'cat' | 'name'>): string | null {
  if (room.cat !== 'classroom') return null
  const m = /^(\d)-(\d+)$/.exec(room.name)
  return m ? `${m[1]}학년 ${m[2]}반 교실 · 2025 배치도 기준` : null
}

/** 접근성 라벨: "본관동 2층 1-1" */
export function roomAriaLabel(ref: RoomRef): string {
  return `${ref.building.name} ${floorLabel(ref.floor.floor)} ${ref.room.name}`
}

/** 지상 층 수 (B1 제외) — 2.5D 높이 산출용 */
export function aboveGroundCount(b: Building): number {
  return b.floors.filter((f) => f !== 'B1').length
}

/** 배치도 px 점이 속한 건물, 없으면 최근접 건물과 px 거리 */
export function nearestBuilding(pt: Pt): { building: Building; distPx: number; inside: boolean } {
  let best: { building: Building; distPx: number; inside: boolean } | null = null
  for (const b of buildings) {
    const inside = pointInPolygon(pt, b.poly)
    const d = inside ? 0 : distToPolygon(pt, b.poly)
    if (!best || d < best.distPx) best = { building: b, distPx: d, inside }
  }
  return best as { building: Building; distPx: number; inside: boolean }
}
