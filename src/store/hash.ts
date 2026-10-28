// hash 라우팅 파서/빌더 (순수 함수 — vitest 대상). 라우팅 라이브러리 없음.
//   #/                              캠퍼스 전체
//   #/b/main                        건물 선택(줌 + 건물 카드)
//   #/b/main/2F                     층 평면도
//   #/b/main/2F/main-2f-c1-1        방 선택
//   #/tour/3                        추천 투어 3번째 지점 (1-based)
//   #/event                         입학설명회 안내(전체) — 학교 투어 장소 목록
//   #/event/5                       입학설명회 안내: ★5 장소 (0 = 출발 지점)
// 예전 주소 #/event/program · #/event/spots(탭)는 #/event 로, #/calibrate(위치 보정)는 #/ 로 읽는다.
import { getFloor, getRoom, isBuildingId, isFloorId } from '../data'
import type { BuildingId, FloorId } from '../data/types'

export type Route =
  | { kind: 'campus' }
  | { kind: 'building'; building: BuildingId }
  | { kind: 'floor'; building: BuildingId; floor: FloorId }
  | { kind: 'room'; building: BuildingId; floor: FloorId; room: string }
  | { kind: 'tour'; /** 0-based */ index: number }
  | {
      kind: 'event'
      /** 별표 번호(1~), 0 = 출발 지점, null = 전체 안내 */
      spot: number | null
    }

export function parseHash(hash: string): Route {
  const raw = (hash || '').replace(/^#/, '')
  let path = raw.split('?')[0]
  try {
    path = decodeURI(path)
  } catch {
    /* keep raw */
  }
  const seg = path.split('/').filter(Boolean)
  if (seg.length === 0) return { kind: 'campus' }

  if (seg[0] === 'tour') {
    const n = parseInt(seg[1] ?? '1', 10)
    return { kind: 'tour', index: Number.isFinite(n) && n >= 1 ? n - 1 : 0 }
  }

  if (seg[0] === 'event') {
    if (seg[1] === undefined) return { kind: 'event', spot: null }
    const n = /^[0-9]+$/.test(seg[1]) ? parseInt(seg[1], 10) : NaN
    return { kind: 'event', spot: Number.isFinite(n) && n <= 99 ? n : null }
  }

  if (seg[0] === 'b' && seg[1]) {
    const building = seg[1]
    if (!isBuildingId(building)) return { kind: 'campus' }
    if (!seg[2]) return { kind: 'building', building }
    const fl = seg[2].toUpperCase()
    if (!isFloorId(fl) || !getFloor(building, fl)) return { kind: 'building', building }
    if (!seg[3]) return { kind: 'floor', building, floor: fl }
    const ref = getRoom(seg[3])
    if (!ref || ref.building.id !== building || ref.floor.floor !== fl) return { kind: 'floor', building, floor: fl }
    return { kind: 'room', building, floor: fl, room: seg[3] }
  }
  return { kind: 'campus' }
}

export function buildHash(r: Route): string {
  switch (r.kind) {
    case 'campus':
      return '#/'
    case 'building':
      return `#/b/${r.building}`
    case 'floor':
      return `#/b/${r.building}/${r.floor}`
    case 'room':
      return `#/b/${r.building}/${r.floor}/${r.room}`
    case 'tour':
      return `#/tour/${r.index + 1}`
    case 'event':
      return r.spot !== null ? `#/event/${r.spot}` : '#/event'
  }
}
