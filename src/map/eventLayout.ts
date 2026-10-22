// 입학설명회 안내(#/event) 캠퍼스 지도 위 '말풍선 카드' 배치 — 순수 함수 (React 비의존, vitest 대상).
//
//  · 건물마다 카드 하나: 머리글 = 건물 이름, 줄 = "★n 장소명  nF" (출발 줄은 깃발 + "출발").
//    카드는 화면 크기 고정(--ik)이라 단위는 '이름표 단위'(= 화면 px ÷ ui-scale). 건물 지붕 위 핀(들)과 가는 줄기(stem)로 이어진다.
//  · 기본 방향(CARD_SIDE)은 건물 옆 빈 공간 쪽. 다른 카드·다른 건물·핀과 겹치면 같은 방향에서 옆으로 미끄러뜨리고,
//    그래도 안 되면 다른 방향 → 그래도 안 되면 '작은 배지'("★1 급식실" · "★5–8 도서관동")로 접는다. 배지도 못 놓으면 번호 핀만 남긴다('pin' — 겹쳐 읽기 어려운 글자를 피한다).
//    선택한 건물의 카드만은 어떤 경우에도 겹침을 감수하고 놓는다(forced).
//  · 폰(< 640px)에서 전체 보기 배율(NARROW_FULL_K 미만), 그 밖의 화면에서 FULL_MIN_K 미만이면 선택한 건물 외에는 처음부터 작은 배지.
//  · 폰에서 장소를 선택하면(pinsOnlyForOthers) 선택하지 않은 건물은 배지도 없이 지붕 위 번호 핀만 — 줄기가 교차하고 축척·다른 건물과 겹치는 것을 막는다.
//    선택 없음(#/event) 은 작은 배지 그대로, 데스크톱은 그대로.
//  · 충돌 판정은 buildingLabels.placeLabels 와 같은 '월드×k' 좌표계 + 배율 5% 단계 양자화 + 결과 캐시.
//  · 핀 위치: 도면이 배치도와 같은 방향(planRotation 0)인 건물은 시설의 평면도상 동서 위치(u)를 건물에 투영한다 — 본관 ★3 중앙현관(중앙) · ★4 숨터(서쪽 끝).
//    서로 70px 이내면 한 핀으로 합친다. 도면이 회전된 건물(도서관·급식관·과학관)은 지붕 한가운데 한 핀.
import { buildings, getRoom, site } from '../data'
import type { Bounds, Building, BuildingId, FloorId, Pt } from '../data/types'
import { formatSpotNos } from '../features/event/eventModel'
import type { SpotIndex } from '../features/tour/spots'
import { boundsOf, centroid, clamp, dist, expandBounds, translatePoly, unionBounds } from '../lib/geometry'
import { buildingHeight, estimateTextWidth, labelStep, type LabelObstacles, type Rect } from './buildingLabels'

export type Side = 'N' | 'S' | 'E' | 'W'

/** 카드를 건물 어느 쪽 빈 공간에 놓을지 (배치도 y 아래 기준) */
export const CARD_SIDE: Record<BuildingId, Side> = {
  dining: 'W', // 급식관동 → 서쪽(왼쪽)
  new: 'N', // 신관동 → 북쪽(위)
  main: 'S', // 본관동 → 남쪽(운동장 북쪽 빈 곳)
  gym: 'S', // 체육관동(출발) → 남쪽(아래)
  library: 'E', // 도서관동 → 동쪽(운동장 쪽)
  science: 'E', // 과학관동 → 동쪽(운동장 쪽)
  restroom: 'N',
}

export const CARD_HEADER_H = 30
export const CARD_ROW_H = 28
export const CARD_PAD_B = 8
export const COMPACT_H = 26
export const PIN_R = 10
/** 건물 가장자리 밖으로 나온 줄기 최소 길이(이름표 단위) */
const STEM_MIN = 18
const STEM_MIN_COMPACT = 12
/** 핀 두 개가 이 거리(월드 px) 안이면 하나로 합친다 */
export const PIN_MERGE_PX = 70
/** 폰에서 이 배율 미만이면 선택하지 않은 카드는 작은 배지 */
export const NARROW_FULL_K = 0.5
/** 그 밖의 화면(작은 노트북·태블릿)도 이 배율 미만이면 작은 배지 — 전체 카드는 지도 대비 너무 커져 서로 겹친다 */
export const FULL_MIN_K = 0.3
const PAD = 4
const STEP = Math.log(1.05)

/**
 * 폰(< 640px)에서 장소를 선택했는가 — 이때 선택하지 않은 건물은 지붕 위 번호 핀만 남긴다(배지·카드·줄기 없음).
 * 좁은 화면에서 배지가 멀리 밀려 줄기가 교차하고 축척 막대·다른 건물과 겹치는 것을 막는다. 전체 보기(선택 없음)는 작은 배지 그대로.
 */
export function pinsOnlyForOthers(narrow: boolean, selectedId: BuildingId | null): boolean {
  return narrow && selectedId !== null
}

/** 카드가 놓일 수 있는 월드 영역: 건물 외접 + 6% — 안내 모드의 전체 맞춤 영역(CampusMap 의 PORTRAIT_FIT)과 같다 */
export const VIEW_LIMIT: Bounds = (() => {
  const u = unionBounds(
    buildings.map((bd) => unionBounds([boundsOf(bd.poly), boundsOf(translatePoly(bd.poly, 0, -buildingHeight(bd)))])),
  )
  return expandBounds(u, u.w * 0.06, u.h * 0.06)
})()

const OPPOSITE: Record<Side, Side> = { N: 'S', S: 'N', E: 'W', W: 'E' }
const PERP: Record<Side, [Side, Side]> = { N: ['E', 'W'], S: ['E', 'W'], E: ['S', 'N'], W: ['S', 'N'] }

// ───────────── 모델 ─────────────

export interface EvSpot {
  roomId: string
  /** tour.json 안의 위치 = 투어 단계 */
  index: number
  no: number | null
  label: string
  floorId: FloorId
}

export interface CardRow extends EvSpot {
  start: boolean
  /** 번호 배지 폭 */
  badgeW: number
}

export interface EvPin {
  /** 지붕 위 핀 끝 (월드 좌표) */
  at: Pt
  spots: EvSpot[]
  nos: number[]
  hasStart: boolean
  /** 핀에 적는 글자: "3" · "5–8" */
  text: string
}

export interface EvBuilding {
  id: BuildingId
  name: string
  en: string
  code: string
  color: string
  rows: CardRow[]
  /** [0] = 줄기가 이어지는 대표 핀 */
  pins: EvPin[]
  /** 지붕·바닥 외접 사각형 (월드) */
  bounds: Bounds
  side: Side
  full: { w: number; h: number }
  compact: { w: number; h: number; head: string; name: string; start: boolean; headW: number }
  /** site.entrances 에 있으면 그 지점(월드) — GPS 직선 안내의 도착점 */
  entrance: Pt | null
  firstIndex: number
}

export interface EvModel {
  buildings: EvBuilding[]
  byId: ReadonlyMap<BuildingId, EvBuilding>
  signature: string
}

function eastWestAxis(b: Building): { west: Pt; east: Pt } {
  const pts = [...b.poly].sort((p, q) => p[0] - q[0])
  const n = Math.max(1, Math.min(2, Math.floor(pts.length / 2)))
  const avg = (list: Pt[]): Pt => [list.reduce((s, p) => s + p[0], 0) / list.length, list.reduce((s, p) => s + p[1], 0) / list.length]
  return { west: avg(pts.slice(0, n)), east: avg(pts.slice(-n)) }
}

/** 시설의 평면도상 동서 위치(0~1) — 도면이 배치도와 같은 방향인 건물만. 아니면 null */
export function planU(roomId: string): number | null {
  const ref = getRoom(roomId)
  if (!ref || ref.building.planRotation !== 0) return null
  const sb = boundsOf(ref.floor.slab)
  if (sb.w <= 0) return null
  return clamp((ref.room.label[0] - sb.x) / sb.w, 0.08, 0.92)
}

/** 건물 지붕 위 핀 끝 좌표. u = 동서 위치(0~1), 생략하면 한가운데 */
export function roofPoint(b: Building, u: number | null = null): Pt {
  const h = buildingHeight(b)
  if (u === null) return [b.center[0], b.center[1] - h]
  const { west, east } = eastWestAxis(b)
  const t = u - 0.5
  return [b.center[0] + t * (east[0] - west[0]), b.center[1] + t * (east[1] - west[1]) - h]
}

/** 건물 하나의 핀들. 가까운 것끼리 합치고, 대표 핀 = 가장 이른 장소가 있는 핀 */
export function pinsFor(b: Building, spots: EvSpot[]): EvPin[] {
  const clusters: { at: Pt; members: EvSpot[]; pts: Pt[] }[] = []
  for (const s of spots) {
    const p = roofPoint(b, planU(s.roomId))
    const hit = clusters.find((c) => dist(c.at, p) < PIN_MERGE_PX)
    if (hit) {
      hit.members.push(s)
      hit.pts.push(p)
      hit.at = [hit.pts.reduce((a, q) => a + q[0], 0) / hit.pts.length, hit.pts.reduce((a, q) => a + q[1], 0) / hit.pts.length]
    } else clusters.push({ at: p, members: [s], pts: [p] })
  }
  return clusters.map((c) => {
    const nos = c.members.filter((m) => m.no !== null).map((m) => m.no as number)
    const hasStart = c.members.some((m) => m.no === null)
    return { at: c.at, spots: c.members, nos, hasStart, text: nos.length ? formatSpotNos(nos) : '출발' }
  })
}

function buildBuilding(b: Building, list: EvSpot[]): EvBuilding {
  const h = buildingHeight(b)
  const bounds = unionBounds([boundsOf(b.poly), boundsOf(translatePoly(b.poly, 0, -h))])
  const rows: CardRow[] = list.map((s) => {
    const start = s.no === null
    const badgeW = start ? 54 : 22 + 8 * String(s.no).length
    return { ...s, start, badgeW }
  })
  const nameW = estimateTextWidth(b.name, 13)
  const headerW = 12 + 20 + 7 + nameW + 14
  const rowW = (r: CardRow) => 10 + r.badgeW + 9 + estimateTextWidth(r.label, 13.5) + 12 + (estimateTextWidth(r.floorId, 11) + 14) + 8
  const w = Math.ceil(Math.max(136, headerW, ...rows.map(rowW)))
  const h2 = CARD_HEADER_H + rows.length * CARD_ROW_H + CARD_PAD_B

  const stars = list.filter((s) => s.no !== null)
  const startOnly = stars.length === 0
  const head = startOnly ? '출발' : `★${formatSpotNos(stars.map((s) => s.no as number))}`
  const cname = startOnly || stars.length === 1 ? list[0].label : b.name
  const headW = estimateTextWidth(head, 12.5) + (startOnly ? 16 : 14)
  const compactW = Math.ceil(10 + headW + 6 + estimateTextWidth(cname, 12.5) + 12)

  const ent = site.entrances.find((e) => e.building === b.id)
  return {
    id: b.id,
    name: b.name,
    en: b.en,
    code: b.code,
    color: b.color,
    rows,
    pins: pinsFor(b, list),
    bounds,
    side: CARD_SIDE[b.id],
    full: { w, h: h2 },
    compact: { w: compactW, h: COMPACT_H, head, name: cname, start: startOnly, headW },
    entrance: ent ? ent.at : null,
    firstIndex: Math.min(...list.map((s) => s.index)),
  }
}

/** 안내 장소 색인 → 건물별 카드 모델 (같은 색인에는 같은 객체) */
export function buildEventModel(spots: SpotIndex): EvModel {
  const out: EvBuilding[] = []
  for (const b of buildings) {
    const list = spots.byBuilding.get(b.id)
    if (!list || list.length === 0) continue
    out.push(
      buildBuilding(
        b,
        list.map((s) => ({ roomId: s.roomId, index: s.index, no: s.no, label: s.label, floorId: s.floorId })),
      ),
    )
  }
  return { buildings: out, byId: new Map(out.map((e) => [e.id, e])), signature: spots.signature }
}

const modelCache = new WeakMap<SpotIndex, EvModel>()
export function eventModelFor(spots: SpotIndex): EvModel {
  let m = modelCache.get(spots)
  if (!m) {
    m = buildEventModel(spots)
    modelCache.set(spots, m)
  }
  return m
}

// ───────────── 배치 ─────────────

export type CardMode = 'full' | 'compact' | 'pin'

export interface CardPlacement {
  id: BuildingId
  mode: CardMode
  side: Side
  /** 카드 사각형: 대표 핀 끝(0,0) 기준, 이름표 단위 */
  x: number
  y: number
  w: number
  h: number
  /** 줄기 끝(카드 가장자리) — 같은 기준 */
  sx: number
  sy: number
  /** '월드×k' 화면 사각형 */
  rect: Rect
  /** 선택한 건물인데 어떤 후보에도 못 들어가 겹침을 감수한 경우 */
  forced: boolean
}

export interface EventPlacement {
  /** 양자화된 배율(5% 단위) */
  k: number
  narrow: boolean
  uiScale: number
  selectedId: BuildingId | null
  list: CardPlacement[]
  byId: ReadonlyMap<BuildingId, CardPlacement>
  /** 핀 사각형('월드×k') — 이름표가 피하도록 */
  pinRects: Rect[]
}

function overlaps(a: Rect, b: Rect, pad: number): boolean {
  return a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad
}

function reach(b: EvBuilding, side: Side): number {
  const [ax, ay] = b.pins[0].at
  const bb = b.bounds
  switch (side) {
    case 'W':
      return ax - bb.x
    case 'E':
      return bb.x + bb.w - ax
    case 'N':
      return ay - bb.y
    case 'S':
      return bb.y + bb.h - ay
  }
}

/** 한 후보(방향 + 미끄러짐)의 카드 사각형. 월드 거리는 k/us 로 이름표 단위가 된다 */
function candidate(b: EvBuilding, size: { w: number; h: number }, side: Side, slide: number, k: number, us: number, stemMin: number) {
  const off = Math.max(0, reach(b, side)) * (k / us) + stemMin
  const { w, h } = size
  let x = 0
  let y = 0
  switch (side) {
    case 'W':
      x = -off - w
      y = -h / 2 + slide
      break
    case 'E':
      x = off
      y = -h / 2 + slide
      break
    case 'N':
      x = -w / 2 + slide
      y = -off - h
      break
    case 'S':
      x = -w / 2 + slide
      y = off
      break
  }
  const sx = side === 'W' ? x + w : side === 'E' ? x : clamp(0, x + 12, x + w - 12)
  const sy = side === 'N' ? y + h : side === 'S' ? y : clamp(0, y + 10, y + h - 10)
  const [ax, ay] = b.pins[0].at
  const rect: Rect = { x0: ax * k + x * us, y0: ay * k + y * us, x1: ax * k + (x + w) * us, y1: ay * k + (y + h) * us }
  return { x, y, w, h, sx, sy, rect }
}

/** 방향을 유지한 채 옆으로 미끄러뜨리는 후보(이름표 단위) — 0 에 가까운 순서 */
function slides(side: Side, size: { w: number; h: number }, factors: readonly number[]): number[] {
  const span = side === 'E' || side === 'W' ? size.h : size.w
  const out: number[] = []
  for (const f of factors) out.push(...(f === 0 ? [0] : [-f * span, f * span]))
  return out
}
const NEAR_SLIDES = [0, 0.18, 0.36, 0.54, 0.72, 0.9]
const FAR_SLIDES = [1.15, 1.45]

function sideOrder(def: Side): Side[] {
  return [def, OPPOSITE[def], ...PERP[def]]
}

const placeCache = new Map<string, EventPlacement>()

/**
 * 배율 k 에서의 카드 배치. (배율 5% 단계, narrow, uiScale, 선택 건물, 모델) 별로 캐시 — 같은 단계에서는 같은 객체를 돌려준다.
 * 순서: 선택한 건물 → 줄이 많은 건물 → 투어 순서. 먼저 놓인 카드가 자리를 차지한다.
 */
export function placeEventCards(model: EvModel, kRaw: number, narrow: boolean, us = 1, selectedId: BuildingId | null = null): EventPlacement {
  const step = labelStep(kRaw)
  const key = `${model.signature}|${step}|${narrow ? 1 : 0}|${us}|${selectedId ?? ''}`
  const hit = placeCache.get(key)
  if (hit) return hit

  const k = Math.exp(step * STEP)
  const pinR = PIN_R * us
  const pinRectsBy = new Map<BuildingId, Rect[]>()
  const pinRects: Rect[] = []
  for (const b of model.buildings) {
    const rs = b.pins.map((p) => ({ x0: p.at[0] * k - pinR, y0: p.at[1] * k - pinR, x1: p.at[0] * k + pinR, y1: p.at[1] * k + pinR }))
    pinRectsBy.set(b.id, rs)
    pinRects.push(...rs)
  }
  const bodyRects = new Map<BuildingId, Rect>(
    buildings.map((bd) => {
      const bb = expandBounds(unionBounds([boundsOf(bd.poly), boundsOf(translatePoly(bd.poly, 0, -buildingHeight(bd)))]), 4)
      return [bd.id, { x0: bb.x * k, y0: bb.y * k, x1: (bb.x + bb.w) * k, y1: (bb.y + bb.h) * k }]
    }),
  )

  const order = [...model.buildings].sort(
    (a, b) => Number(b.id === selectedId) - Number(a.id === selectedId) || b.rows.length - a.rows.length || a.firstIndex - b.firstIndex,
  )
  const lim = VIEW_LIMIT
  const limit: Rect = { x0: lim.x * k, y0: lim.y * k, x1: (lim.x + lim.w) * k, y1: (lim.y + lim.h) * k }
  const inside = (r: Rect) => r.x0 >= limit.x0 && r.y0 >= limit.y0 && r.x1 <= limit.x1 && r.y1 <= limit.y1
  const placedCards: Rect[] = []
  const list: CardPlacement[] = []

  for (const b of order) {
    const others: Rect[] = [...placedCards]
    for (const o of model.buildings) if (o.id !== b.id) others.push(...(pinRectsBy.get(o.id) ?? []))
    for (const [id, r] of bodyRects) if (id !== b.id) others.push(r)
    const free = (r: Rect) => inside(r) && others.every((o) => !overlaps(o, r, PAD))

    const tryMode = (mode: 'full' | 'compact'): CardPlacement | null => {
      const size = mode === 'full' ? b.full : b.compact
      const stemMin = mode === 'full' ? STEM_MIN : STEM_MIN_COMPACT
      // 1) 기본 방향에서 조금씩 미끄러뜨리기 → 2) 다른 방향 → 3) 멀리 미끄러뜨리기(배지 전용)
      const phases: [Side[], readonly number[]][] = [
        [[b.side], NEAR_SLIDES],
        [sideOrder(b.side).slice(1), NEAR_SLIDES],
        [sideOrder(b.side), FAR_SLIDES],
      ]
      // 전체 카드는 멀리 미끄러뜨려 줄기가 길어지느니 작은 배지로 접는다
      for (const [sides, factors] of mode === 'full' ? phases.slice(0, 2) : phases) {
        for (const side of sides) {
          for (const slide of slides(side, size, factors)) {
            const c = candidate(b, size, side, slide, k, us, stemMin)
            if (free(c.rect)) return { id: b.id, mode, side, ...c, forced: false }
          }
        }
      }
      return null
    }

    // 번호 핀만 남긴다 (카드·줄기 없음)
    const pinOnly = (): CardPlacement => {
      const r = pinRectsBy.get(b.id)?.[0] ?? { x0: 0, y0: 0, x1: 0, y1: 0 }
      return { id: b.id, mode: 'pin', side: b.side, x: 0, y: 0, w: 0, h: 0, sx: 0, sy: 0, rect: r, forced: false }
    }
    const forceCompact = k < (narrow ? NARROW_FULL_K : FULL_MIN_K) && b.id !== selectedId
    let chosen: CardPlacement | null
    if (b.id !== selectedId && pinsOnlyForOthers(narrow, selectedId)) chosen = pinOnly()
    else chosen = (forceCompact ? null : tryMode('full')) ?? tryMode('compact')
    if (!chosen) {
      if (b.id === selectedId) {
        const c = candidate(b, b.compact, b.side, 0, k, us, STEM_MIN_COMPACT)
        chosen = { id: b.id, mode: 'compact', side: b.side, ...c, forced: true }
      } else chosen = pinOnly()
    }
    placedCards.push(chosen.rect)
    list.push(chosen)
  }

  const out: EventPlacement = { k, narrow, uiScale: us, selectedId, list, byId: new Map(list.map((c) => [c.id, c])), pinRects }
  if (placeCache.size > 300) placeCache.clear()
  placeCache.set(key, out)
  return out
}

/** 건물 이름표 배치가 피해야 할 장애물(카드 + 핀). key 가 같으면 결과도 같다 */
export function eventObstacles(model: EvModel, selectedId: BuildingId | null): LabelObstacles {
  return {
    key: `ev:${model.signature}:${selectedId ?? ''}`,
    rects: (k, narrow, us) => {
      const p = placeEventCards(model, k, narrow, us, selectedId)
      return [...p.list.map((c) => c.rect), ...p.pinRects]
    },
  }
}

// ───────────── 선택 카메라 ─────────────

/**
 * 선택한 장소의 건물 + 카드가 한 화면에 들어오는 영역(월드). 카드는 화면 크기가 고정이라 배율에 따라 월드 크기가 달라지므로
 * '배율 → 카드 월드 사각형 → 합친 영역 → 배율' 을 몇 번 반복해 수렴시킨다.
 * avail = 보이는 영역(insets 제외) 화면 px. 기본 방향 · 전체 카드 기준(충돌은 고려하지 않는다).
 */
export function focusBoundsFor(b: EvBuilding, avail: { w: number; h: number }, us = 1, maxK = 2.4): Bounds {
  const base = expandBounds(b.bounds, 10)
  const fit = (r: Bounds) => Math.min(maxK, avail.w / Math.max(r.w, 1), avail.h / Math.max(r.h, 1))
  let bounds = base
  let k = fit(base)
  for (let i = 0; i < 4; i++) {
    const c = candidate(b, b.full, b.side, 0, k, us, STEM_MIN)
    const [ax, ay] = b.pins[0].at
    const card: Bounds = { x: ax + (c.x * us) / k, y: ay + (c.y * us) / k, w: (c.w * us) / k, h: (c.h * us) / k }
    bounds = expandBounds(unionBounds([base, card]), 6)
    const nk = fit(bounds)
    if (Math.abs(nk - k) < 0.002) break
    k = nk
  }
  return bounds
}

// ───────────── 출입구 화살표 ─────────────

export interface EntranceMarker {
  buildingId: BuildingId
  name: string
  at: Pt
  /** 건물 안쪽을 향하는 각도(도, +x 가 0, 시계방향) */
  angle: number
}

/** 건물 바닥 외곽에서 점 p 에 가장 가까운 변의 '안쪽' 방향(도) */
export function inwardAngle(poly: readonly Pt[], p: Pt): number {
  let best = Infinity
  let angle = 0
  const c = centroid(poly as Pt[])
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const q = poly[(i + 1) % poly.length]
    const dx = q[0] - a[0]
    const dy = q[1] - a[1]
    const l2 = dx * dx + dy * dy || 1
    const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0, 1)
    const px = a[0] + t * dx
    const py = a[1] + t * dy
    const d = Math.hypot(p[0] - px, p[1] - py)
    if (d < best) {
      best = d
      const len = Math.sqrt(l2)
      let nx = dy / len
      let ny = -dx / len
      if ((c[0] - px) * nx + (c[1] - py) * ny < 0) {
        nx = -nx
        ny = -ny
      }
      angle = (Math.atan2(ny, nx) * 180) / Math.PI
    }
  }
  return angle
}

/**
 * 출입구 이름 글자가 놓이는 위치 — 화살표 몸통 축에 수직으로 옆에 놓는다(카드 줄기가 지나는 축을 피한다).
 * 반환 = 화살표 지점 기준 이름표 단위 중심 좌표 (side 1 = 기본, -1 = 반대편)
 */
export function entranceTextOffset(en: EntranceMarker, side: 1 | -1): { x: number; y: number; w: number } {
  const a = (en.angle * Math.PI) / 180
  let px = -Math.sin(a)
  let py = Math.cos(a)
  if (px < -0.01 || (Math.abs(px) <= 0.01 && py < 0)) {
    px = -px
    py = -py
  }
  const tw = estimateTextWidth(en.name, 10.5)
  const off = 15 + (tw / 2) * Math.abs(px)
  return { x: side * px * off - Math.cos(a) * 8, y: side * py * off - Math.sin(a) * 8 + 1, w: tw }
}

/**
 * 출입구 이름 글자가 카드·핀과 겹치지 않는 쪽(1 = 기본, -1 = 반대편). 양쪽 다 겹치면 0 (글자 생략 — 화살표만).
 * 카드가 글자를 덮어 "도서관동 출입" 처럼 잘려 보이는 것을 막는다. 사각형은 '월드×k' 좌표 (placeEventCards 와 같은 기준).
 */
export function entranceTextSide(en: EntranceMarker, p: EventPlacement): 1 | -1 | 0 {
  const obstacles: Rect[] = [...p.list.filter((c) => c.mode !== 'pin').map((c) => c.rect), ...p.pinRects]
  for (const side of [1, -1] as const) {
    const o = entranceTextOffset(en, side)
    const cx = en.at[0] * p.k + o.x * p.uiScale
    const cy = en.at[1] * p.k + o.y * p.uiScale
    const hw = (o.w / 2 + 3) * p.uiScale
    const hh = 8 * p.uiScale
    const r: Rect = { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh }
    if (obstacles.every((q) => !overlaps(q, r, 1))) return side
  }
  return 0
}

/** 안내 장소가 있는 건물의 출입구(site.entrances) 화살표 */
export function entranceMarkers(model: EvModel): EntranceMarker[] {
  const out: EntranceMarker[] = []
  for (const en of site.entrances) {
    const b = buildings.find((x) => x.id === en.building)
    if (!b || !model.byId.has(b.id)) continue
    out.push({ buildingId: b.id, name: en.name, at: en.at, angle: inwardAngle(b.poly, en.at) })
  }
  return out
}

/** GPS 직선 안내의 도착점: 건물 출입구를 알면 그곳, 아니면 건물 중심 */
export function spotTargetPx(buildingId: BuildingId): Pt | null {
  const en = site.entrances.find((e) => e.building === buildingId)
  if (en) return en.at
  const b = buildings.find((x) => x.id === buildingId)
  return b ? b.center : null
}
