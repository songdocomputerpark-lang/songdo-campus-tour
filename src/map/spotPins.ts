// 캠퍼스 배치도 위 '학생 안내 장소' 핀: 건물 지붕 한가운데에 꽂히는 화면 크기 고정 핀.
//  · 건물마다 핀 하나. 그 건물에 있는 안내 장소들을 담는다 (출발 지점은 남색, ★ 지점은 금색).
//  · 축약(멀리서): 한 줄 알약 "★ 3·4" / "출발"  ·  펼침(가까이서): 지점마다 한 줄 "③ 중앙현관 1F"
//  · 핀은 건물 이름표보다 우선한다 — buildingLabels.placeLabels 에 장애물로 넘겨 이름표가 핀을 피해 놓이게 한다.
//  · 단위: 이름표와 같은 '이름표 단위'(= 화면 px ÷ ui-scale). 좌표는 배치도 px(월드).
import { buildings } from '../data'
import type { BuildingId, FloorId, Pt } from '../data/types'
import type { SpotIndex } from '../features/tour/spots'
import { buildingHeight, estimateTextWidth, type LabelObstacles, type Rect } from './buildingLabels'

export const PIN_ROW_H = 24
export const PIN_ROW_GAP = 3
/** 맨 아래 줄 바닥 → 핀 끝(지붕 위 점)까지 */
export const PIN_POINTER = 9
export const PIN_FONT = 12.5
const BADGE = 18

export interface PinSpot {
  roomId: string
  index: number
  no: number | null
  label: string
  floorId: FloorId
}

export interface PinRow {
  kind: 'start' | 'star'
  /** 펼침 줄: 지점 하나 / 축약 줄: 같은 종류 지점 모두 */
  spots: PinSpot[]
  text: string
  /** 펼침 줄의 층 표기(1F …) — 축약 줄은 null */
  floor: FloorId | null
  w: number
}

export interface PinLayout {
  id: BuildingId
  /** 핀 끝 = 지붕 한가운데 (월드 좌표) */
  tip: Pt
  full: boolean
  rows: PinRow[]
  w: number
  /** 줄 묶음 높이 (핀 끝 제외) */
  h: number
}

/** 펼침 핀으로 바꾸는 배율 — 좁은 화면은 건물이 충분히 커졌을 때만 */
export function pinFull(k: number, narrow: boolean): boolean {
  return narrow ? k >= 0.6 : k >= 0.4
}

const TIP = new Map<BuildingId, Pt>(buildings.map((b) => [b.id, [b.center[0], b.center[1] - buildingHeight(b)] as Pt]))

function rowsFor(spots: PinSpot[], full: boolean): PinRow[] {
  const start = spots.filter((s) => s.no === null)
  const stars = spots.filter((s) => s.no !== null)
  if (full) {
    return [...start, ...stars].map((s) => {
      const text = s.label
      const textW = estimateTextWidth(text, PIN_FONT)
      const floorW = estimateTextWidth(s.floorId, 10.5) + 8
      return { kind: s.no === null ? 'start' : 'star', spots: [s], text, floor: s.floorId, w: 5 + BADGE + 6 + textW + 6 + floorW + 6 }
    })
  }
  const rows: PinRow[] = []
  if (start.length) {
    const text = '출발'
    rows.push({ kind: 'start', spots: start, text, floor: null, w: 9 + 13 + 5 + estimateTextWidth(text, PIN_FONT) + 11 })
  }
  if (stars.length) {
    const text = stars.map((s) => s.no).join('·')
    rows.push({ kind: 'star', spots: stars, text, floor: null, w: 9 + 13 + 4 + estimateTextWidth(text, PIN_FONT + 0.5) + 11 })
  }
  return rows
}

/** 건물별 핀 배치 (spotsByBuilding 이 비어 있으면 빈 배열) */
export function layoutPins(spotsByBuilding: ReadonlyMap<BuildingId, PinSpot[]>, full: boolean): PinLayout[] {
  const out: PinLayout[] = []
  for (const [id, spots] of spotsByBuilding) {
    const tip = TIP.get(id)
    if (!tip || spots.length === 0) continue
    const rows = rowsFor(spots, full)
    const w = Math.max(...rows.map((r) => r.w))
    const h = rows.length * PIN_ROW_H + (rows.length - 1) * PIN_ROW_GAP
    out.push({ id, tip, full, rows, w, h })
  }
  return out
}

/** 핀이 차지하는 '월드×k' 사각형 (이름표 충돌 판정과 같은 좌표계) */
export function pinRect(p: PinLayout, k: number, us: number): Rect {
  const cx = p.tip[0] * k
  const cy = p.tip[1] * k
  const hw = (p.w / 2) * us
  return { x0: cx - hw, y0: cy - (p.h + PIN_POINTER) * us, x1: cx + hw, y1: cy + 5 * us }
}

/** 이름표 배치에 넘길 장애물. key 가 같으면 결과도 같다(캐시) */
export function pinObstacles(spotsByBuilding: ReadonlyMap<BuildingId, PinSpot[]>, signature: string): LabelObstacles | undefined {
  if (spotsByBuilding.size === 0) return undefined
  const byMode = new Map<boolean, PinLayout[]>()
  const pinsFor = (full: boolean) => {
    let l = byMode.get(full)
    if (!l) {
      l = layoutPins(spotsByBuilding, full)
      byMode.set(full, l)
    }
    return l
  }
  return {
    key: signature,
    rects: (k, narrow, us) => pinsFor(pinFull(k, narrow)).map((p) => pinRect(p, k, us)),
  }
}

export interface PinInput {
  byBuilding: ReadonlyMap<BuildingId, PinSpot[]>
  obstacles: LabelObstacles | undefined
}

const inputCache = new WeakMap<SpotIndex, PinInput>()

/** 안내 장소 색인 → 핀 입력(건물별 지점 + 이름표 장애물). 같은 색인에는 같은 객체 — 이름표 배치 캐시가 그대로 맞는다 */
export function pinInputFor(spots: SpotIndex): PinInput {
  let v = inputCache.get(spots)
  if (!v) {
    const byBuilding = new Map<BuildingId, PinSpot[]>()
    for (const [id, list] of spots.byBuilding) {
      byBuilding.set(
        id,
        list.map((s) => ({ roomId: s.roomId, index: s.index, no: s.no, label: s.label, floorId: s.floorId })),
      )
    }
    v = { byBuilding, obstacles: pinObstacles(byBuilding, spots.signature) }
    inputCache.set(spots, v)
  }
  return v
}
