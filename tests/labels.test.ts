// 건물 이름표 충돌 회피 · GPS 글자 · 교실 부제 · 투어 콤팩트 시트
import { describe, expect, it } from 'vitest'
import { allRooms, buildings, classroomSubtitle } from '../src/data'
import type { Building, BuildingId } from '../src/data/types'
import { translatePoly } from '../src/lib/geometry'
import {
  COMPACT_K,
  LABEL_SIDE,
  buildingHeight,
  estimateTextWidth,
  gpsLabelClear,
  labelAnchors,
  labelMetrics,
  labelStep,
  placeLabels,
} from '../src/map/buildingLabels'
import { sheetMetrics, SHEET_PEEK } from '../src/ui/BottomSheet'

const IDS = buildings.map((b) => b.id) as BuildingId[]
const SCALES = [0.12, 0.157, 0.21, 0.3, 0.44, 0.8, 1.6, 3.2]

function overlap(a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
}

describe('placeLabels — 건물 이름표 충돌 회피', () => {
  it.each([false, true])('보이는 이름표끼리 겹치지 않는다 (narrow=%s)', (narrow) => {
    for (const k of SCALES) {
      const p = placeLabels(k, narrow)
      const vis = IDS.map((id) => p.items[id]).filter((it) => it.visible)
      for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) expect(overlap(vis[i].rect, vis[j].rect), `${vis[i].id}×${vis[j].id} @k=${k}`).toBe(false)
    }
  })

  it('좁은 화면은 항상 축약 이름표(작은 알약, 영문 부제 없음)', () => {
    for (const k of [0.21, 0.8, 3.2]) {
      const p = placeLabels(k, true)
      expect(p.compact).toBe(true)
      for (const id of IDS) expect(p.items[id].metrics).toMatchObject({ compact: true, h: 22 })
    }
  })

  it('넓은 화면의 기본 배율(≈0.44)은 기존 모양 그대로 — 모두 보이고 기본 방향을 쓴다', () => {
    const p = placeLabels(0.44, false)
    expect(p.compact).toBe(false)
    for (const id of IDS) {
      expect(p.items[id].visible, id).toBe(true)
      expect(p.items[id].side, id).toBe(LABEL_SIDE[id])
      expect(p.items[id].metrics.h).toBe(38)
    }
  })

  it('작은 배율(< 0.3)은 넓은 화면에서도 축약', () => {
    expect(placeLabels(0.21, false).compact).toBe(true)
    expect(placeLabels(0.33, false).compact).toBe(false)
  })

  it('폰 세로 맞춤 배율(≈0.21)에서 주요 건물 이름은 대부분 보인다', () => {
    const p = placeLabels(0.21, true)
    expect(IDS.filter((id) => p.items[id].visible).length).toBeGreaterThanOrEqual(5)
  })

  it('같은 배율 단계에서는 같은 객체를 돌려준다(캐시)', () => {
    expect(placeLabels(0.4, false)).toBe(placeLabels(0.401, false))
  })
})

describe('gpsLabelClear — GPS 글자는 이름표보다 낮은 우선순위', () => {
  it('이름표 위에 놓이면 생략하고, 멀리 떨어져 있으면 보인다', () => {
    const p = placeLabels(0.44, false)
    // 도서관 이름표 사각형 한가운데 바로 위에 점이 있으면 글자(점 아래)가 이름표와 겹친다
    const r = p.items.library.rect
    const x = (r.x0 + r.x1) / 2 / p.k
    const y = (r.y0 - 20) / p.k
    expect(gpsLabelClear(p, x, y, '추정 위치 ±8 m')).toBe(false)
    // 운동장 한가운데(이름표가 없는 곳)
    expect(gpsLabelClear(p, 1180, 1250, '추정 위치 ±8 m')).toBe(true)
  })
})

describe('classroomSubtitle — 교실 부제', () => {
  it('"g-n" 교실 → "{g}학년 {n}반 교실 · 2025 배치도 기준"', () => {
    expect(classroomSubtitle({ cat: 'classroom', name: '1-1' })).toBe('1학년 1반 교실 · 2025 배치도 기준')
    expect(classroomSubtitle({ cat: 'classroom', name: '3-10' })).toBe('3학년 10반 교실 · 2025 배치도 기준')
  })
  it('교실이 아니거나 형식이 다르면 null', () => {
    expect(classroomSubtitle({ cat: 'learning', name: '1-1' })).toBeNull()
    expect(classroomSubtitle({ cat: 'classroom', name: '1-1A' })).toBeNull()
    expect(classroomSubtitle({ cat: 'classroom', name: '12-1' })).toBeNull()
  })
  it('데이터의 모든 교실이 부제를 갖는다', () => {
    const rooms = allRooms.filter((r) => r.room.cat === 'classroom')
    expect(rooms.length).toBeGreaterThan(0)
    for (const r of rooms) expect(classroomSubtitle(r.room), r.room.name).not.toBeNull()
  })
})

describe('sheetMetrics — peek 높이 재정의(투어 콤팩트 시트)', () => {
  it('peekPx 를 주면 peek 가 그 높이, 생략하면 기본값', () => {
    expect(sheetMetrics(812, 56, 72).peek).toBe(SHEET_PEEK)
    expect(sheetMetrics(812, 56, 72, 148).peek).toBe(148)
  })
  it('peek 는 시트 최대 높이의 절반을 넘지 않고, half 는 peek 보다 크다', () => {
    const m = sheetMetrics(480, 56, 72, 400)
    expect(m.peek).toBeLessThanOrEqual(Math.round(m.full * 0.5))
    expect(m.half).toBeGreaterThan(m.peek)
  })
})

// ───────────── 이름표 배치에 쓰이는 순수 헬퍼 ─────────────

describe('labelStep — 배율 5% 양자화', () => {
  it('같은 단계 안에서는 같고, 5% 이상 벌어지면 단계가 바뀐다', () => {
    expect(labelStep(1)).toBe(0)
    expect(labelStep(1.02)).toBe(0)
    expect(labelStep(1.05)).toBe(1)
    expect(labelStep(1 / 1.05)).toBe(-1)
  })
  it('배율에 대해 단조 증가하고, 0·음수도 유한한 값을 돌려준다', () => {
    let prev = -Infinity
    for (let k = 0.05; k < 10; k *= 1.01) {
      const s = labelStep(k)
      expect(s).toBeGreaterThanOrEqual(prev)
      prev = s
    }
    expect(Number.isFinite(labelStep(0))).toBe(true)
    expect(Number.isFinite(labelStep(-3))).toBe(true)
  })
  it('프레임마다 배율이 미세하게 바뀌어도 새 배치를 만드는 횟수는 단계 수로 제한된다', () => {
    const seen = new Set<unknown>()
    let frames = 0
    for (let k = 0.1; k <= 4; k *= 1.002, frames++) seen.add(placeLabels(k, false))
    expect(frames).toBeGreaterThan(1500)
    expect(seen.size).toBeLessThanOrEqual(Math.ceil(Math.log(40) / Math.log(1.05)) + 2) // ≈ 77 단계
  })
})

describe('estimateTextWidth — 글자 폭 추정', () => {
  it('한글은 글자 크기와 같고 숫자·영문·공백은 더 좁다', () => {
    expect(estimateTextWidth('', 12)).toBe(0)
    expect(estimateTextWidth('가', 10)).toBeCloseTo(10.2, 5)
    expect(estimateTextWidth('a', 10)).toBeCloseTo(5.6, 5)
    expect(estimateTextWidth('추정 위치 ±8 m', 12)).toBeGreaterThan(estimateTextWidth('±8 m', 12))
  })
  it('글자 크기에 비례한다', () => {
    expect(estimateTextWidth('추정 위치 ±12 m', 24)).toBeCloseTo(estimateTextWidth('추정 위치 ±12 m', 12) * 2, 5)
  })
})

describe('labelMetrics · buildingHeight', () => {
  it('축약 알약은 작고(22px), 이름이 길수록 넓어진다', () => {
    for (const b of buildings) {
      const c = labelMetrics(b, true)
      const f = labelMetrics(b, false)
      expect(c).toMatchObject({ compact: true, h: 22 })
      expect(f).toMatchObject({ compact: false, h: 38 })
      expect(c.w).toBeLessThan(f.w)
      expect(c.gap).toBeLessThanOrEqual(f.gap)
    }
    const short = { ...buildings[0], name: '가' } as Building
    const long = { ...buildings[0], name: '가나다라마바사' } as Building
    expect(labelMetrics(long, true).w).toBeGreaterThan(labelMetrics(short, true).w)
  })
  it('건물 높이는 지상 층 수에 따라 단조 증가한다', () => {
    const base = buildings[0]
    const h = (floors: Building['floors']) => buildingHeight({ ...base, floors } as Building)
    expect(h(['1F'])).toBeLessThan(h(['1F', '2F']))
    expect(h(['B1', '1F'])).toBe(h(['1F'])) // 지하층은 높이에 반영하지 않는다
    for (const b of buildings) expect(buildingHeight(b)).toBeGreaterThan(8)
  })
})

describe('labelAnchors — 네 방향 이름표 기준점', () => {
  // 100×60 직사각형, 높이 10 → 지붕은 위로 10 이동
  const square = { center: [50, 30], poly: [[0, 0], [100, 0], [100, 60], [0, 60]] } as unknown as Building
  const H = 10
  const a = labelAnchors(square, translatePoly(square.poly, 0, -H), H)
  it('직사각형: 위 = 지붕 윗변, 아래 = 바닥 아랫변, 좌우 = 지붕 옆변', () => {
    expect(a.above).toEqual([50, -H])
    expect(a.below).toEqual([50, 60])
    expect(a.left).toEqual([0, 30 - H])
    expect(a.right).toEqual([100, 30 - H])
  })
  it('실제 건물: 모두 유한하고 위 < 아래, 왼쪽 ≤ 중심 ≤ 오른쪽', () => {
    for (const b of buildings) {
      const h = buildingHeight(b)
      const p = labelAnchors(b, translatePoly(b.poly, 0, -h), h)
      for (const pt of Object.values(p)) pt.forEach((v) => expect(Number.isFinite(v), b.id).toBe(true))
      expect(p.above[1], b.id).toBeLessThan(p.below[1])
      expect(p.below[1] - p.above[1], b.id).toBeGreaterThanOrEqual(h)
      expect(p.left[0], b.id).toBeLessThanOrEqual(b.center[0])
      expect(p.right[0], b.id).toBeGreaterThanOrEqual(b.center[0])
    }
  })
})

describe('placeLabels — 불변식', () => {
  const GRID: number[] = []
  for (let k = 0.1; k <= 3.5; k *= 1.05) GRID.push(k)

  it('보이는 이름표는 최소 간격(4px) 이상 떨어져 있다 — 여러 배율·ui-scale·폭', () => {
    for (const narrow of [false, true])
      for (const us of [1, 1.25, 1.5])
        for (const k of GRID) {
          const vis = Object.values(placeLabels(k, narrow, us).items).filter((it) => it.visible)
          for (let i = 0; i < vis.length; i++)
            for (let j = i + 1; j < vis.length; j++) {
              const A = vis[i].rect
              const B = vis[j].rect
              const gap = Math.max(B.x0 - A.x1, A.x0 - B.x1, B.y0 - A.y1, A.y0 - B.y1)
              expect(gap, `${vis[i].id}×${vis[j].id} k=${k.toFixed(3)} us=${us} narrow=${narrow}`).toBeGreaterThanOrEqual(4 - 1e-6)
            }
        }
  })

  it('모든 건물에 항목이 있고, 사각형 크기는 알약 크기 × ui-scale', () => {
    for (const us of [1, 1.25]) {
      const p = placeLabels(0.5, false, us)
      expect(p.uiScale).toBe(us)
      for (const id of IDS) {
        const it = p.items[id]
        expect(it, id).toBeDefined()
        expect(it.rect.x1 - it.rect.x0).toBeCloseTo(it.metrics.w * us, 6)
        expect(it.rect.y1 - it.rect.y0).toBeCloseTo(it.metrics.h * us, 6)
      }
    }
  })

  it('가장 큰 건물(본관동)은 어느 배율에서도 숨겨지지 않는다(우선순위 1위)', () => {
    for (const narrow of [false, true]) for (const k of GRID) expect(placeLabels(k, narrow).items.main.visible, `k=${k}`).toBe(true)
  })

  it('확대하면 보이던 이름표가 사라지지 않는다 (축약 전환 구간 포함)', () => {
    for (const narrow of [false, true]) {
      const was = new Set<BuildingId>()
      for (const k of GRID) {
        const p = placeLabels(k, narrow)
        for (const id of was) expect(p.items[id].visible, `${id} k=${k.toFixed(3)} narrow=${narrow}`).toBe(true)
        for (const id of IDS) if (p.items[id].visible) was.add(id)
      }
    }
  })

  it('축약 전환 배율(COMPACT_K) 위·아래에서 compact 가 갈린다', () => {
    expect(placeLabels(COMPACT_K * 0.9, false).compact).toBe(true)
    expect(placeLabels(COMPACT_K * 1.2, false).compact).toBe(false)
    expect(placeLabels(COMPACT_K * 1.2, true).compact).toBe(true)
  })
})

describe('gpsLabelClear — 글자 폭 단조성', () => {
  it('같은 자리에서 글자가 짧아지면 더 쉽게 비어 있다고 판정된다', () => {
    const p = placeLabels(0.44, false)
    const long = '추정 위치 ±123 m (정확도 낮음)'
    const short = '±8 m'
    for (const b of buildings) {
      const [x, y] = b.center
      if (gpsLabelClear(p, x, y, long)) expect(gpsLabelClear(p, x, y, short), b.id).toBe(true)
    }
  })
  it('이름표가 하나도 보이지 않는 배율에서도 항상 비어 있다(유한 좌표)', () => {
    const p = placeLabels(0.44, false)
    expect(gpsLabelClear({ ...p, items: Object.fromEntries(IDS.map((id) => [id, { ...p.items[id], visible: false }])) as typeof p.items }, 100, 100, '추정 위치 ±8 m')).toBe(true)
  })
})
