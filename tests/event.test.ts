// 입학설명회 안내: tour.json 파싱 · 방위/직선 문구 · 번호 표기 · 건물별 묶음 · 카드 배치(충돌·접기) · 핀 · 출입구
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildings } from '../src/data'
import {
  bearingDeg,
  compassKo,
  eventLegend,
  formatSpotNos,
  groupStarsByBuilding,
  officialName,
  siblingsOf,
  spotByNo,
  stepSpot,
  straightDistanceText,
  straightLineText,
} from '../src/features/event/eventModel'
import { buildSpots } from '../src/features/tour/spots'
import { DEFAULT_EVENT_TITLE, parseEvent, sanitizeTour } from '../src/lib/content'
import {
  buildEventModel,
  entranceMarkers,
  entranceTextOffset,
  entranceTextSide,
  focusBoundsFor,
  FULL_MIN_K,
  inwardAngle,
  NARROW_FULL_K,
  placeEventCards,
  pinsOnlyForOthers,
  planU,
  VIEW_LIMIT,
  type CardPlacement,
} from '../src/map/eventLayout'

const raw = JSON.parse(readFileSync('public/content/tour.json', 'utf8'))
const tour = sanitizeTour(raw)
const spots = buildSpots(tour)
const model = buildEventModel(spots)

describe('tour.json 파싱 (event · howto)', () => {
  it('실제 tour.json: 머리말 · 지점별 찾아가는 방법', () => {
    expect(tour.event).toEqual({ title: '입학설명회 안내', date: '2026. 10. 31.(토)', subtitle: '지도에 ★로 표시된 곳을 찾아가 보세요' })
    expect(tour.stops).toHaveLength(10)
    expect(tour.stops[0].start).toBe(true)
    expect(tour.stops.every((s) => (s.howto?.length ?? 0) > 0)).toBe(true)
  })
  it('event 가 없으면 undefined (구버전 tour.json)', () => {
    expect(sanitizeTour({ title: 'x', stops: [{ facility: 'main-1f-lobby', note: '' }] }).event).toBeUndefined()
    expect(parseEvent(undefined)).toBeUndefined()
    expect(parseEvent(null)).toBeUndefined()
    expect(parseEvent('문자열')).toBeUndefined()
    expect(parseEvent([])).toBeUndefined()
    expect(parseEvent({})).toBeUndefined()
  })
  it('event 일부 필드만 있어도 빈 칸은 빈 문자열, 제목은 기본 문구', () => {
    expect(parseEvent({ date: ' 2026. 10. 31.(토) ' })).toEqual({ title: DEFAULT_EVENT_TITLE, date: '2026. 10. 31.(토)', subtitle: '' })
    expect(parseEvent({ title: '설명회', date: 5, subtitle: null })).toEqual({ title: '설명회', date: '', subtitle: '' })
  })
  it('howto 가 없거나 형식이 틀리면 생략, 빈 문장은 걸러낸다', () => {
    const t = sanitizeTour({
      title: 't',
      stops: [
        { facility: 'main-1f-lobby', note: 'a' },
        { facility: 'main-1f-p1', note: 'b', howto: ['첫째', '  ', 3, ' 둘째 '] },
        { facility: 'gym-4f-p91', note: 'c', howto: '문자열' },
      ],
    } as never)
    expect(t.stops[0]).not.toHaveProperty('howto')
    expect(t.stops[1].howto).toEqual(['첫째', '둘째'])
    expect(t.stops[2]).not.toHaveProperty('howto')
  })
  it('stops 가 없으면 빈 투어', () => {
    expect(sanitizeTour(null).stops).toEqual([])
    expect(sanitizeTour({ title: 'x' } as never).stops).toEqual([])
  })
})

describe('장소 번호 · 순서 · 묶음', () => {
  it('번호 0 = 출발, 1~9 = ★ (tour.json 순서)', () => {
    expect(spotByNo(spots, 0)?.label).toBe('체육관')
    expect(spotByNo(spots, 1)?.label).toBe('급식실')
    expect(spotByNo(spots, 9)?.label).toBe('과학실')
    expect(spotByNo(spots, 10)).toBeNull()
    expect(spotByNo(spots, null)).toBeNull()
  })
  it('stepSpot: 출발 → ★1 → … → ★9', () => {
    expect(stepSpot(spots, 0, -1)).toBeNull()
    expect(stepSpot(spots, 0, 1)?.no).toBe(1)
    expect(stepSpot(spots, 5, -1)?.no).toBe(4)
    expect(stepSpot(spots, 9, 1)).toBeNull()
    expect(stepSpot(spots, 1, -1)?.no).toBeNull() // 출발
  })
  it('건물별 묶음: 급식관 → 신관 → 본관(2) → 도서관(4) → 과학관', () => {
    const g = groupStarsByBuilding(spots)
    expect(g.map((x) => [x.buildingId, x.spots.length])).toEqual([
      ['dining', 1],
      ['new', 1],
      ['main', 2],
      ['library', 4],
      ['science', 1],
    ])
    expect(g.flatMap((x) => x.spots.map((s) => s.no))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
  it('같은 건물의 다른 장소 · 도면상 명칭', () => {
    const lib = spotByNo(spots, 6)!
    expect(siblingsOf(spots, lib).map((s) => s.no)).toEqual([5, 7, 8])
    expect(siblingsOf(spots, spotByNo(spots, 0)!)).toEqual([])
    expect(officialName(spotByNo(spots, 1)!)).not.toBeNull() // 급식실 ← 도면상 이름
    expect(officialName({ label: '도서관', roomName: '도서관' })).toBeNull()
  })
  it('번호 범위 표기', () => {
    expect(formatSpotNos([1])).toBe('1')
    expect(formatSpotNos([3, 4])).toBe('3·4')
    expect(formatSpotNos([5, 6, 7, 8])).toBe('5–8')
    expect(formatSpotNos([8, 5, 7, 6])).toBe('5–8')
    expect(formatSpotNos([1, 3])).toBe('1·3')
    expect(formatSpotNos([])).toBe('')
  })
  it('범례: 출발 안내문이 재학생 안내를 말할 때만 "재학생 안내 장소"', () => {
    expect(eventLegend(tour.stops[0].note)).toBe('★ = 재학생 안내 장소')
    expect(eventLegend('체육관에서 출발합니다.')).toBe('★ 표시 장소')
    expect(eventLegend('')).toBe('★ 표시 장소')
    expect(eventLegend(undefined)).toBe('★ 표시 장소')
  })
})

describe('GPS 직선 안내: 8방위 · 방위각 · 문구', () => {
  it('8방위 한국어', () => {
    const cases: [number, string][] = [
      [0, '북쪽'],
      [44, '북동쪽'],
      [90, '동쪽'],
      [135, '남동쪽'],
      [180, '남쪽'],
      [225, '남서쪽'],
      [270, '서쪽'],
      [315, '북서쪽'],
      [337, '북서쪽'],
      [338, '북쪽'],
      [360, '북쪽'],
      [-45, '북서쪽'],
      [725, '북쪽'],
    ]
    for (const [deg, ko] of cases) expect(compassKo(deg), `${deg}°`).toBe(ko)
  })
  it('방위각: 정북·정동·정남·정서', () => {
    const o = { lat: 37.43, lon: 126.64 }
    expect(bearingDeg(o, { lat: o.lat + 0.001, lon: o.lon })).toBeCloseTo(0, 0)
    expect(bearingDeg(o, { lat: o.lat, lon: o.lon + 0.001 })).toBeCloseTo(90, 0)
    expect(bearingDeg(o, { lat: o.lat - 0.001, lon: o.lon })).toBeCloseTo(180, 0)
    expect(bearingDeg(o, { lat: o.lat, lon: o.lon - 0.001 })).toBeCloseTo(270, 0)
    expect(bearingDeg(o, { lat: o.lat + 0.001, lon: o.lon - 0.001 })).toBeGreaterThan(300) // 북서쪽
  })
  it('직선거리 반올림 · 문구', () => {
    expect(straightDistanceText(3)).toBe('약 5 m')
    expect(straightDistanceText(47)).toBe('약 45 m')
    expect(straightDistanceText(123)).toBe('약 120 m')
    expect(straightDistanceText(999)).toBe('약 1.0 km')
    expect(straightDistanceText(1500)).toBe('약 1.5 km')
    expect(straightLineText(123, 315)).toBe('현재 위치에서 직선 약 120 m · 북서쪽')
  })
})

// ───────────── 카드 배치 ─────────────

function overlap(a: CardPlacement, b: CardPlacement): boolean {
  const r = a.rect
  const s = b.rect
  return r.x0 < s.x1 && s.x0 < r.x1 && r.y0 < s.y1 && s.y0 < r.y1
}

describe('카드 모델 · 핀', () => {
  it('건물 6곳: 급식·신관·본관·도서관·과학관 + 체육관(출발), 화장실동은 없음', () => {
    expect(model.buildings.map((b) => b.id).sort()).toEqual(['dining', 'gym', 'library', 'main', 'new', 'science'])
    expect(model.byId.has('restroom')).toBe(false)
  })
  it('줄: 번호·층 그대로, 출발 줄은 start', () => {
    const lib = model.byId.get('library')!
    expect(lib.rows.map((r) => `${r.no}:${r.floorId}`)).toEqual(['5:1F', '6:2F', '7:3F', '8:3F'])
    const gym = model.byId.get('gym')!
    expect(gym.rows[0].start).toBe(true)
    expect(gym.compact.head).toBe('출발')
  })
  it('본관: 핀 둘(★3 현관 = 중앙, ★4 숨터 = 서쪽 끝), 대표 핀은 ★3', () => {
    const main = model.byId.get('main')!
    expect(main.pins).toHaveLength(2)
    expect(main.pins[0].nos).toEqual([3])
    expect(main.pins[1].nos).toEqual([4])
    expect(main.pins[1].at[0]).toBeLessThan(main.pins[0].at[0] - 300) // 숨터는 훨씬 서쪽
    expect(main.pins[1].at[0]).toBeLessThan(700)
    const b = buildings.find((x) => x.id === 'main')!
    expect(Math.abs(main.pins[0].at[0] - b.center[0])).toBeLessThan(40) // 현관 ≈ 건물 중앙
  })
  it('도면이 회전된 건물(도서관·급식관·과학관)은 지붕 한가운데 한 핀, 도서관 핀 글자 "5–8"', () => {
    for (const id of ['library', 'dining', 'science'] as const) expect(model.byId.get(id)!.pins).toHaveLength(1)
    expect(model.byId.get('library')!.pins[0].text).toBe('5–8')
    expect(planU('library-1f-p62')).toBeNull()
    expect(planU('main-1f-p1')!).toBeLessThan(0.2)
  })
  it('접힌 배지 글자: 단일 "★1 급식실", 묶음 "★5–8 도서관동", 본관 "★3·4 본관동"', () => {
    expect([model.byId.get('dining')!.compact.head, model.byId.get('dining')!.compact.name]).toEqual(['★1', '급식실'])
    expect([model.byId.get('library')!.compact.head, model.byId.get('library')!.compact.name]).toEqual(['★5–8', '도서관동'])
    expect([model.byId.get('main')!.compact.head, model.byId.get('main')!.compact.name]).toEqual(['★3·4', '본관동'])
  })
})

describe('카드 배치: 충돌 · 접기', () => {
  it('데스크톱 전체 보기(k≈0.45): 카드는 모두 전체 모양, 서로 겹치지 않고 기본 방향', () => {
    const p = placeEventCards(model, 0.45, false, 1, null)
    expect(p.list.every((c) => c.mode === 'full' && !c.forced)).toBe(true)
    for (let i = 0; i < p.list.length; i++) for (let j = i + 1; j < p.list.length; j++) expect(overlap(p.list[i], p.list[j]), `${p.list[i].id} × ${p.list[j].id}`).toBe(false)
    const side = Object.fromEntries(p.list.map((c) => [c.id, c.side]))
    expect(side).toMatchObject({ dining: 'W', main: 'S', gym: 'S', library: 'E', science: 'E' })
  })
  it('어떤 배율·화면에서도 강제 배치가 아니면 카드끼리 겹치지 않는다', () => {
    for (const k of [0.17, 0.22, 0.27, 0.3, 0.35, 0.45, 0.6, 0.9, 1.2]) {
      for (const narrow of [false, true]) {
        for (const sel of [null, 'library', 'main'] as const) {
          const p = placeEventCards(model, k, narrow, 1, sel)
          const ok = p.list.filter((c) => !c.forced)
          for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) expect(overlap(ok[i], ok[j]), `k=${k} ${ok[i].id}×${ok[j].id}`).toBe(false)
        }
      }
    }
  })
  it('모든 카드는 건물 외접+6% 영역 안에 놓인다(전체 보기에서 잘리지 않음)', () => {
    for (const k of [0.2, 0.45, 0.9]) {
      const p = placeEventCards(model, k, false, 1, null)
      for (const c of p.list.filter((x) => !x.forced)) {
        expect(c.rect.x0).toBeGreaterThanOrEqual(VIEW_LIMIT.x * p.k - 0.01)
        expect(c.rect.x1).toBeLessThanOrEqual((VIEW_LIMIT.x + VIEW_LIMIT.w) * p.k + 0.01)
        expect(c.rect.y0).toBeGreaterThanOrEqual(VIEW_LIMIT.y * p.k - 0.01)
        expect(c.rect.y1).toBeLessThanOrEqual((VIEW_LIMIT.y + VIEW_LIMIT.h) * p.k + 0.01)
      }
    }
  })
  it('폰(narrow) 전체 보기(선택 없음)는 모두 작은 배지', () => {
    const k = NARROW_FULL_K - 0.05
    const all = placeEventCards(model, k, true, 1, null)
    expect(all.list.every((c) => c.mode === 'compact')).toBe(true)
  })
  it('폰에서 장소를 선택하면 선택한 건물만 카드, 나머지는 어떤 배율에서도 번호 핀만 (배지·줄기 없음)', () => {
    expect(pinsOnlyForOthers(true, 'library')).toBe(true)
    expect(pinsOnlyForOthers(true, null)).toBe(false)
    expect(pinsOnlyForOthers(false, 'library')).toBe(false)
    for (const k of [0.17, 0.3, 0.45, 0.6, 0.9, 1.4]) {
      for (const sel of ['library', 'main', 'science', 'gym'] as const) {
        const p = placeEventCards(model, k, true, 1, sel)
        expect(p.list).toHaveLength(model.buildings.length)
        const chosen = p.byId.get(sel)!
        expect(chosen.mode, `k=${k} ${sel}`).not.toBe('pin')
        for (const c of p.list.filter((x) => x.id !== sel)) {
          expect(c.mode, `k=${k} ${sel} ${c.id}`).toBe('pin')
          expect([c.w, c.h, c.sx, c.sy, c.forced]).toEqual([0, 0, 0, 0, false])
        }
      }
    }
  })
  it('폰에서 선택한 건물의 카드는 다른 건물의 핀·몸체를 피해 놓인다', () => {
    for (const sel of ['library', 'main', 'dining', 'science'] as const) {
      const p = placeEventCards(model, 0.9, true, 1, sel)
      const card = p.byId.get(sel)!
      expect(card.mode).toBe('full')
      for (const o of p.list.filter((x) => x.id !== sel)) expect(overlap(card, o), `${sel} × ${o.id}`).toBe(false)
    }
  })
  it('데스크톱은 장소를 선택해도 배지·카드가 그대로 (핀만 남기지 않는다)', () => {
    const p = placeEventCards(model, 0.45, false, 1, 'library')
    expect(p.list.every((c) => c.mode === 'full')).toBe(true)
    const small = placeEventCards(model, FULL_MIN_K - 0.05, false, 1, 'library')
    expect(small.list.filter((c) => c.id !== 'library').some((c) => c.mode === 'compact')).toBe(true)
  })
  it('데스크톱도 많이 축소하면(작은 창) 처음부터 작은 배지 — 겹쳐 읽기 어려운 전체 카드를 피한다', () => {
    const p = placeEventCards(model, FULL_MIN_K - 0.05, false, 1, null)
    expect(p.list.every((c) => c.mode === 'compact')).toBe(true)
    expect(placeEventCards(model, FULL_MIN_K + 0.05, false, 1, null).list.some((c) => c.mode === 'full')).toBe(true)
  })
  it('폰에서도 충분히 확대하면(선택한 장소 카메라) 선택한 건물은 전체 카드', () => {
    const p = placeEventCards(model, 0.9, true, 1, 'main')
    expect(p.byId.get('main')!.mode).toBe('full')
    // 선택 없이 확대한 폰 화면은 여전히 전체 카드들
    expect(placeEventCards(model, 0.9, true, 1, null).list.every((c) => c.mode === 'full')).toBe(true)
  })
  it('멀리 축소하면 공간이 모자란 카드부터 작은 배지로 접힌다 (건물마다 하나는 남는다)', () => {
    const p = placeEventCards(model, 0.2, false, 1, null)
    expect(p.list).toHaveLength(model.buildings.length)
    expect(p.list.some((c) => c.mode === 'compact')).toBe(true)
  })
  it('배지도 못 놓는 자리면 겹치지 않게 번호 핀만 남기고, 선택한 건물은 항상 카드로 남는다', () => {
    let pins = 0
    for (const k of [0.14, 0.16, 0.2, 0.25, 0.32, 0.4]) {
      for (const sel of [null, 'main', 'library', 'gym'] as const) {
        const p = placeEventCards(model, k, true, 1, sel)
        for (const c of p.list) {
          if (c.mode === 'pin') pins++
          if (c.id === sel) expect(c.mode).not.toBe('pin')
          if (c.mode === 'pin') expect(c.id).not.toBe(sel)
        }
        const shown = p.list.filter((c) => c.mode !== 'pin' && !c.forced)
        for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) expect(overlap(shown[i], shown[j]), `k=${k} ${sel}`).toBe(false)
      }
    }
    expect(pins).toBeGreaterThan(0)
  })
  it('같은 배율 단계(5%)에서는 같은 객체 (캐시)', () => {
    expect(placeEventCards(model, 0.45, false, 1, null)).toBe(placeEventCards(model, 0.451, false, 1, null))
    expect(placeEventCards(model, 0.45, false, 1, null)).not.toBe(placeEventCards(model, 0.45, false, 1, 'main'))
  })
  it('줄기는 카드 가장자리에서 끝난다', () => {
    const p = placeEventCards(model, 0.9, false, 1, null)
    for (const c of p.list) {
      const onEdge = [c.x, c.x + c.w].includes(c.sx) || [c.y, c.y + c.h].includes(c.sy)
      expect(onEdge, c.id).toBe(true)
    }
  })
  it('선택 카메라: 건물 + 카드가 한 영역에 들어간다', () => {
    for (const b of model.buildings) {
      const r = focusBoundsFor(b, { w: 360, h: 330 }, 1)
      expect(r.x).toBeLessThanOrEqual(b.bounds.x)
      expect(r.y).toBeLessThanOrEqual(b.bounds.y)
      expect(r.x + r.w).toBeGreaterThanOrEqual(b.bounds.x + b.bounds.w)
      expect(r.y + r.h).toBeGreaterThanOrEqual(b.bounds.y + b.bounds.h)
    }
  })
})

describe('출입구 화살표', () => {
  it('본관 현관은 북쪽(건물 안)을, 도서관동 출입구는 서쪽을 향한다', () => {
    const m = entranceMarkers(model)
    expect(m.map((x) => x.buildingId).sort()).toEqual(['library', 'main'])
    const main = m.find((x) => x.buildingId === 'main')!
    const lib = m.find((x) => x.buildingId === 'library')!
    expect(main.angle).toBeLessThan(-70)
    expect(main.angle).toBeGreaterThan(-110)
    expect(Math.abs(lib.angle)).toBeGreaterThan(150)
  })
  it('inwardAngle: 사각형 변 근처 점에서 안쪽 방향', () => {
    const sq: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]
    expect(inwardAngle(sq, [5, -1])).toBeCloseTo(90, 0) // 위쪽 변 바깥 → 아래(+y)로
    expect(inwardAngle(sq, [11, 5])).toBeCloseTo(180, 0) // 오른쪽 → 왼쪽
  })
})

describe('출입구 이름 글자: 카드에 덮이지 않는 쪽', () => {
  const markers = entranceMarkers(model)
  it('카드·핀이 없는 열린 자리면 기본 쪽(1)', () => {
    const empty = { k: 1, narrow: false, uiScale: 1, selectedId: null, list: [], byId: new Map(), pinRects: [] }
    for (const en of markers) expect(entranceTextSide(en, empty)).toBe(1)
  })
  it('기본 쪽을 카드가 덮으면 반대편(-1), 양쪽 다 덮이면 생략(0)', () => {
    const en = markers[0]
    const o = (side: 1 | -1) => entranceTextOffset(en, side)
    const rectAt = (side: 1 | -1) => {
      const c = o(side)
      const cx = en.at[0] + c.x
      const cy = en.at[1] + c.y
      return { x0: cx - 4, y0: cy - 4, x1: cx + 4, y1: cy + 4 }
    }
    const card = (rect: { x0: number; y0: number; x1: number; y1: number }): CardPlacement => ({
      id: 'main', mode: 'full', side: 'S', x: 0, y: 0, w: 1, h: 1, sx: 0, sy: 0, rect, forced: false,
    })
    const base = { k: 1, narrow: false, uiScale: 1, selectedId: null, byId: new Map(), pinRects: [] }
    expect(entranceTextSide(en, { ...base, list: [card(rectAt(1))] })).toBe(-1)
    expect(entranceTextSide(en, { ...base, list: [card(rectAt(1)), card(rectAt(-1))] })).toBe(0)
    // 번호 핀만 남은 건물의 사각형은 카드가 아니다
    expect(entranceTextSide(en, { ...base, list: [{ ...card(rectAt(1)), mode: 'pin' }] })).toBe(1)
  })
  it('실제 배치(데스크톱 전체 보기)에서도 글자가 카드와 겹치지 않는다', () => {
    const p = placeEventCards(model, 0.45, false, 1, null)
    for (const en of markers) {
      const side = entranceTextSide(en, p)
      if (side === 0) continue
      const o = entranceTextOffset(en, side)
      const cx = en.at[0] * p.k + o.x
      const cy = en.at[1] * p.k + o.y
      for (const c of p.list) {
        if (c.mode === 'pin') continue
        const hit = cx + o.w / 2 > c.rect.x0 && cx - o.w / 2 < c.rect.x1 && cy + 8 > c.rect.y0 && cy - 8 < c.rect.y1
        expect(hit).toBe(false)
      }
    }
  })
})
