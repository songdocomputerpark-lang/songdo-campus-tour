// 캠퍼스 배치도 건물 이름표: 크기 지표 · 후보 위치(위/아래/좌/우) · 화면 공간 충돌 회피.
//
// 이름표는 화면 크기가 고정(scale(var(--ik)))이라, 줌 아웃하면 건물 사이 간격이 이름표보다 좁아져 겹친다.
// 그래서 배율 k 에서 '화면 px 기준 사각형'을 계산해 겹침을 피한다.
//  · 우선순위: 건물 면적 큰 순서 (먼저 놓인 이름표가 자리를 차지한다)
//  · 기본 방향(LABEL_SIDE)이 겹치면 반대쪽 → 나머지 두 방향 순으로 시도, 모두 겹치면 숨긴다
//  · 사각형은 '월드×k' 좌표계(= 화면 좌표에서 이동량을 뺀 값)로 비교한다 — 이동(pan)은 모든 이름표를 똑같이 옮기므로
//    충돌 결과는 배율과 화면 폭에만 달린다. 배율은 5% 단위로 양자화하므로(placeLabels) 줌 중에도 재계산이 가볍다.
//  · GPS 의 "추정 위치 ±N m" 글자는 이름표보다 낮은 우선순위로, 겹치면 생략한다 (gpsLabelClear).
import { aboveGroundCount, buildings } from '../data'
import type { Building, BuildingId, Pt } from '../data/types'
import { polygonArea, translatePoly } from '../lib/geometry'

export type LabelSide = 'above' | 'below' | 'left' | 'right'

/** 이름표를 건물 어느 쪽에 붙일지 (건물·도로·운동장 배치를 고려한 표현 설정) */
export const LABEL_SIDE: Record<BuildingId, LabelSide> = {
  main: 'below',
  restroom: 'above',
  new: 'above',
  gym: 'below',
  dining: 'left',
  library: 'right',
  science: 'right',
}

/** 이 배율 미만에서는 항상 축약 이름표(코드 + 이름만) */
export const COMPACT_K = 0.3
/** 건물별 최소 배율 — 작은 부속동 이름은 더 확대해야 보인다 */
const MIN_K: Partial<Record<BuildingId, number>> = { restroom: 0.34 }
/** 이름표 사이 최소 간격(px) — 배율을 5% 단위로 양자화한 오차까지 흡수 */
const PAD = 4

const STEP = Math.log(1.05)

/** 2.5D 건물 높이(월드 px) — 지붕 오프셋과 이름표 앵커 계산에 쓴다 */
export function buildingHeight(b: Building): number {
  return 8 + 4.6 * aboveGroundCount(b)
}

/** 축에 평행한 직선(axis='y': 수직선 x=c, 'x': 수평선 y=c)이 다각형과 만나는 [최소, 최대] */
export function lineSpan(poly: readonly Pt[], axis: 'x' | 'y', c: number): [number, number] | null {
  let lo = Infinity
  let hi = -Infinity
  const a = axis === 'y' ? 0 : 1 // 고정 좌표 인덱스
  const b = 1 - a
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    if ((p[a] - c) * (q[a] - c) > 0 || p[a] === q[a]) continue
    const t = (c - p[a]) / (q[a] - p[a])
    const v = p[b] + t * (q[b] - p[b])
    lo = Math.min(lo, v)
    hi = Math.max(hi, v)
  }
  return isFinite(lo) ? [lo, hi] : null
}

/** 네 방향의 이름표 기준점(월드 좌표) */
export function labelAnchors(b: Building, roof: readonly Pt[], h: number): Record<LabelSide, Pt> {
  const [cx, cy] = b.center
  return {
    above: [cx, lineSpan(roof, 'y', cx)?.[0] ?? cy - h],
    below: [cx, lineSpan(b.poly, 'y', cx)?.[1] ?? cy],
    left: [lineSpan(roof, 'x', cy - h)?.[0] ?? cx, cy - h],
    right: [lineSpan(roof, 'x', cy - h)?.[1] ?? cx, cy - h],
  }
}

export interface LabelMetrics {
  /** 알약 크기와 건물에서 떨어진 간격 — 이름표 단위(= 화면 px ÷ ui-scale) */
  w: number
  h: number
  gap: number
  /** 코드 배지 + 한글 이름만 (영문 부제 없음, 작은 알약) */
  compact: boolean
}

export function labelMetrics(b: Building, compact: boolean): LabelMetrics {
  if (compact) return { w: 23 + b.name.length * 11.8 + 9, h: 22, gap: 5, compact }
  const textW = Math.max(b.name.length * 13.2, b.en.length * 5.6)
  return { w: 30 + textW + 12, h: 38, gap: 8, compact }
}

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * 이름표보다 먼저 자리를 차지하는 요소(학생 안내 장소 핀 — spotPins.ts). 이름표는 이 사각형들을 피해 놓인다.
 * rects 는 (양자화된 배율, narrow, ui-scale) 에 대해 '월드×k' 사각형을 돌려준다. key 가 같으면 결과도 같아야 한다(캐시 키).
 */
export interface LabelObstacles {
  key: string
  rects: (k: number, narrow: boolean, us: number) => Rect[]
}

function overlaps(a: Rect, b: Rect, pad: number): boolean {
  return a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad
}

interface LabelEntry {
  b: Building
  anchors: Record<LabelSide, Pt>
  side: LabelSide
  area: number
}

/** 우선순위 순(면적 큰 건물이 먼저) */
const ENTRIES: LabelEntry[] = buildings
  .map((b) => {
    const h = buildingHeight(b)
    return {
      b,
      anchors: labelAnchors(b, translatePoly(b.poly, 0, -h), h),
      side: LABEL_SIDE[b.id],
      area: polygonArea(b.poly),
    }
  })
  .sort((p, q) => q.area - p.area)

const OPPOSITE: Record<LabelSide, LabelSide> = { above: 'below', below: 'above', left: 'right', right: 'left' }
const PERPENDICULAR: Record<LabelSide, [LabelSide, LabelSide]> = {
  above: ['right', 'left'],
  below: ['right', 'left'],
  left: ['below', 'above'],
  right: ['below', 'above'],
}
function tryOrder(pref: LabelSide): LabelSide[] {
  return [pref, OPPOSITE[pref], ...PERPENDICULAR[pref]]
}

export interface PlacedLabel {
  id: BuildingId
  side: LabelSide
  /** false = 모든 방향이 다른 이름표와 겹쳐 숨김 */
  visible: boolean
  /** 선택한 방향의 기준점(월드 좌표) */
  at: Pt
  /** 기준점에서 알약 중심까지(이름표 단위) */
  dx: number
  dy: number
  metrics: LabelMetrics
  /** '월드×k' 좌표계의 화면 사각형 */
  rect: Rect
}

export interface LabelPlacement {
  /** 양자화된 배율(5% 단위) — 사각형은 이 배율 기준 */
  k: number
  narrow: boolean
  compact: boolean
  uiScale: number
  items: Record<BuildingId, PlacedLabel>
}

function rectFor(e: LabelEntry, side: LabelSide, k: number, m: LabelMetrics, us: number): { at: Pt; dx: number; dy: number; rect: Rect } {
  const at = e.anchors[side]
  const dx = side === 'left' ? -(m.w / 2 + m.gap) : side === 'right' ? m.w / 2 + m.gap : 0
  const dy = side === 'above' ? -(m.h / 2 + m.gap) : side === 'below' ? m.h / 2 + m.gap : 0
  const cx = at[0] * k + dx * us
  const cy = at[1] * k + dy * us
  const hw = (m.w / 2) * us
  const hh = (m.h / 2) * us
  return { at, dx, dy, rect: { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh } }
}

export function labelStep(k: number): number {
  return Math.round(Math.log(Math.max(k, 1e-6)) / STEP)
}

const cache = new Map<string, LabelPlacement>()

/**
 * 배율 k 에서의 이름표 배치. 결과는 (배율 5% 단계, narrow, uiScale, 장애물 key) 별로 캐시되어 같은 단계에서는 같은 객체를 돌려준다.
 * narrow = 뷰포트 폭 < 640px → 항상 축약 이름표. obstacles = 이름표가 피해야 할 핀(항상 보임).
 */
export function placeLabels(k: number, narrow: boolean, us = 1, obstacles?: LabelObstacles): LabelPlacement {
  const step = labelStep(k)
  const key = `${step}|${narrow ? 1 : 0}|${us}|${obstacles?.key ?? ''}`
  const hit = cache.get(key)
  if (hit) return hit

  const kq = Math.exp(step * STEP)
  const compact = narrow || kq < COMPACT_K
  const placed: Rect[] = obstacles ? obstacles.rects(kq, narrow, us) : []
  const items = {} as Record<BuildingId, PlacedLabel>

  for (const e of ENTRIES) {
    const m = labelMetrics(e.b, compact)
    const minK = MIN_K[e.b.id] ?? 0
    let chosen: PlacedLabel | null = null
    if (kq >= minK) {
      for (const side of tryOrder(e.side)) {
        const r = rectFor(e, side, kq, m, us)
        if (placed.every((p) => !overlaps(p, r.rect, PAD))) {
          chosen = { id: e.b.id, side, visible: true, metrics: m, ...r }
          break
        }
      }
    }
    if (chosen) placed.push(chosen.rect)
    else {
      // 숨김 — 기본 방향 위치를 기록해 두면 페이드 인 때 자리가 맞는다
      const r = rectFor(e, e.side, kq, m, us)
      chosen = { id: e.b.id, side: e.side, visible: false, metrics: m, ...r }
    }
    items[e.b.id] = chosen
  }

  const out: LabelPlacement = { k: kq, narrow, compact, uiScale: us, items }
  if (cache.size > 400) cache.clear()
  cache.set(key, out)
  return out
}

/** 글자 폭 추정(px): 한글·한자는 글자 크기와 같고 숫자·영문·공백은 약 0.55배 */
export function estimateTextWidth(text: string, fontSize: number): number {
  let w = 0
  for (const ch of text) w += /[ᄀ-ᇿ㄰-㆏가-힯一-鿿]/.test(ch) ? 1.02 : 0.56
  return w * fontSize
}

/**
 * GPS 점(월드 좌표 x, y) 아래에 놓일 글자가 보이는 이름표와 겹치지 않는가.
 * 글자는 점 중심에서 아래로 18~35 단위(화면고정 마커 좌표) 구간, 폭은 글자 폭 + 외곽선.
 */
export function gpsLabelClear(p: LabelPlacement, x: number, y: number, text: string, fontSize = 12): boolean {
  const us = p.uiScale
  const cx = x * p.k
  const cy = y * p.k
  const hw = (estimateTextWidth(text, fontSize) / 2 + 4) * us
  const r: Rect = { x0: cx - hw, y0: cy + 17 * us, x1: cx + hw, y1: cy + 36 * us }
  return Object.values(p.items).every((it) => !it.visible || !overlaps(it.rect, r, PAD - 1))
}
