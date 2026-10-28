import { describe, expect, it } from 'vitest'
import type { Pt } from '../src/data/types'
import { allRooms } from '../src/data'
import { contrast, mix, readableOn, tint } from '../src/lib/color'
import { boundsOf, centroid, convexHull, distToPolygon, insetPolygon, isRectLike, pointInPolygon, polygonArea, polygonPath } from '../src/lib/geometry'
import { LABEL_BREAKS, layoutLabel, splitLines, textEm } from '../src/map/roomLayout'

const SQ: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]]
const L: Pt[] = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]]

describe('geometry', () => {
  it('bounds / area / centroid', () => {
    expect(boundsOf(SQ)).toEqual({ x: 0, y: 0, w: 10, h: 10 })
    expect(polygonArea(SQ)).toBe(100)
    expect(centroid(SQ)).toEqual([5, 5])
    const c = centroid(L)
    expect(pointInPolygon(c, L)).toBe(true)
  })
  it('pointInPolygon (오목 다각형)', () => {
    expect(pointInPolygon([2, 8], L)).toBe(true)
    expect(pointInPolygon([8, 8], L)).toBe(false)
    expect(pointInPolygon([-1, 5], SQ)).toBe(false)
  })
  it('distToPolygon', () => {
    expect(distToPolygon([5, 5], SQ)).toBe(0)
    expect(distToPolygon([13, 5], SQ)).toBeCloseTo(3, 8)
    expect(distToPolygon([13, 14], SQ)).toBeCloseTo(5, 8)
  })
  it('polygonPath / convexHull / insetPolygon', () => {
    expect(polygonPath(SQ)).toBe('M0 0L10 0L10 10L0 10Z')
    expect(convexHull(L)).toHaveLength(5)
    const inner = insetPolygon(SQ, 1)
    expect(boundsOf(inner)).toEqual({ x: 1, y: 1, w: 8, h: 8 })
    const out = insetPolygon(SQ, -1)
    expect(boundsOf(out)).toEqual({ x: -1, y: -1, w: 12, h: 12 })
    // 반대 방향 감기에서도 안쪽
    const rev = [...SQ].reverse()
    expect(boundsOf(insetPolygon(rev, 1))).toEqual({ x: 1, y: 1, w: 8, h: 8 })
  })
  it('isRectLike', () => {
    expect(isRectLike(SQ)).toBe(true)
    expect(isRectLike(L)).toBe(false)
  })
})

describe('color', () => {
  it('mix / tint', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(tint('#4f86c6', 0)).toBe('#ffffff')
    expect(tint('#4f86c6', 1)).toBe('#4f86c6')
  })
  it('readableOn 은 AA(4.5) 이상 대비를 고른다', () => {
    for (const bg of ['#4f86c6', '#e8954a', '#d9b44a', '#0b1f4b', '#ffffff']) {
      const fg = readableOn(bg)
      expect(contrast(bg, fg)).toBeGreaterThan(3.5)
    }
  })
})

describe('라벨 레이아웃', () => {
  it('textEm: 한글 1em, 숫자/기호 더 좁음', () => {
    expect(textEm('도서관')).toBe(3)
    expect(textEm('1-1')).toBeLessThan(3)
  })
  it('splitLines: 단어 경계 우선, 균등 분할', () => {
    expect(splitLines('1학년 교무실', 2)).toEqual(['1학년', '교무실'])
    expect(splitLines('물리학강의실', 2)).toEqual(['물리학', '강의실'])
    expect(splitLines('홈베이스(숨터)', 2)).toEqual(['홈베이스', '(숨터)'])
    expect(splitLines('도서관', 1)).toEqual(['도서관'])
  })
  it('splitLines: 합성어는 뜻 단위(LABEL_BREAKS)에서만, 단어 중간에서는 끊지 않는다', () => {
    expect(splitLines('창의국제홍보부', 2)).toEqual(['창의국제', '홍보부'])
    expect(splitLines('창의국제홍보부', 3)).toEqual(['창의', '국제', '홍보부'])
    expect(splitLines('인문사회부', 2)).toEqual(['인문', '사회부'])
    expect(splitLines('생활안전부', 2)).toEqual(['생활', '안전부'])
    expect(splitLines('교육과정지원부', 2)).toEqual(['교육과정', '지원부'])
    expect(splitLines('교육과정지원부', 3)).toEqual(['교육', '과정', '지원부'])
    // 나눌 곳이 없으면 줄 수를 채우지 못한다(호출 쪽이 한 줄로 둔다) — '교장/실'·'J-R/OTC' 같은 끊김 없음
    expect(splitLines('교장실', 2)).toEqual(['교장실'])
    expect(splitLines('J-ROTC', 2)).toEqual(['J-ROTC'])
    expect(splitLines('학습실 Ⅲ', 3).length).toBeLessThan(3)
    // 한 글자 낱말은 앞뒤 어느 쪽으로도 떼지 않는다 — '학습실 / Ⅰ', '1 / 학년' 같은 한 글자 줄 없음
    expect(splitLines('학습실 Ⅰ', 2)).toEqual(['학습실 Ⅰ'])
    expect(splitLines('1 학년 교무실', 2)).toEqual(['1 학년', '교무실'])
  })
  it('splitLines: 괄호·가운뎃점은 같은 줄이면 띄어쓰기 없이 붙이고, (여) · (여)· 앞에서는 줄을 바꾸지 않는다', () => {
    expect(splitLines('샤워실(여)', 1)).toEqual(['샤워실(여)'])
    // 괄호 속 한 글자는 앞말에 붙여 둔다 — '휴게실 / (여)' 같은 한 글자 줄 없음
    expect(splitLines('샤워실(여)', 2)).toEqual(['샤워실(여)'])
    expect(splitLines('조리사 휴게실(여)', 2)).toEqual(['조리사', '휴게실(여)'])
    expect(splitLines('조리사 휴게실(여)', 3).length).toBeLessThan(3)
    expect(splitLines('교직원 화장실(남)', 2)).toEqual(['교직원', '화장실(남)'])
    expect(splitLines('샤워실·탈의실', 2)).toEqual(['샤워실·', '탈의실'])
    expect(splitLines('교직원 화장실(여)·샤워실(여)', 2)).toEqual(['교직원 화장실(여)·', '샤워실(여)'])
    expect(splitLines('교직원 화장실(여)·샤워실(여)', 3)).toEqual(['교직원', '화장실(여)·', '샤워실(여)'])
  })
  it('LABEL_BREAKS: 이어 붙이면 이름 그대로이고, 모두 실제 방 이름에 쓰인다', () => {
    for (const [name, parts] of Object.entries(LABEL_BREAKS)) {
      expect(parts.join(''), name).toBe(name)
      expect(parts.every((p) => Array.from(p).length >= 2), name).toBe(true) // 한 글자 조각 없음
      expect(allRooms.some(({ room }) => room.name.includes(name)), name).toBe(true)
    }
  })
  it('모든 시설에 유한한 라벨 레이아웃이 있다', () => {
    for (const { room } of allRooms) {
      const l = layoutLabel(room)
      expect(l.lines.length, room.id).toBeGreaterThan(0)
      expect(Number.isFinite(l.fs) && l.fs > 0, room.id).toBe(true)
    }
  })
  it('모든 시설 라벨: 글자를 빠뜨리지 않고, 한 글자만 떨어진 줄이 없다(세로쓰기 제외)', () => {
    for (const { room } of allRooms) {
      const l = layoutLabel(room)
      expect(l.lines.join('').replace(/ /g, ''), room.id).toBe(room.name.replace(/ /g, ''))
      const vertical = l.lines.length > 1 && l.lines.every((s) => Array.from(s).length === 1)
      // 괄호는 빼고 센다 — '(여)' 만 남은 줄도 한 글자 줄이다
      if (!vertical && l.lines.length > 1) for (const s of l.lines) expect(Array.from(s.replace(/[()]/g, '')).length, `${room.id} "${s}"`).toBeGreaterThan(1)
    }
  })
  it('부서 이름표가 휴대폰 첫 화면에서 숨지 않을 만큼 크다 (화면 글자 8.5px 미만이면 숨김)', () => {
    const at = (id: string) => layoutLabel(allRooms.find((r) => r.room.id === id)!.room)
    // 도서관동 2층: 창의국제홍보부는 같은 크기 방인 인문사회부와 같은 글자 크기 — 360px 폰 첫 화면(k≈0.3)에서도 보인다
    expect(at('library-2f-p71').lines).toEqual(['창의', '국제', '홍보부'])
    expect(at('library-2f-p71').fs).toBeCloseTo(at('library-2f-p70').fs)
    // 신관동 1층의 좁고 긴 방(진로진학상담부, 샤워실·탈의실): 폰 첫 화면 k=0.5 에서 8.5px 이상
    for (const id of ['new-1f-p31', 'new-1f-p33']) expect(at(id).fs * 0.5, id).toBeGreaterThanOrEqual(8.5)
  })
})
