import { describe, expect, it } from 'vitest'
import type { Pt } from '../src/data/types'
import { allRooms } from '../src/data'
import { contrast, mix, readableOn, tint } from '../src/lib/color'
import { boundsOf, centroid, convexHull, distToPolygon, insetPolygon, isRectLike, pointInPolygon, polygonArea, polygonPath } from '../src/lib/geometry'
import { layoutLabel, splitLines, textEm } from '../src/map/roomLayout'

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
    expect(splitLines('홈베이스(숲터)', 2)).toEqual(['홈베이스', '(숲터)'])
    expect(splitLines('도서관', 1)).toEqual(['도서관'])
  })
  it('모든 시설에 유한한 라벨 레이아웃이 있다', () => {
    for (const { room } of allRooms) {
      const l = layoutLabel(room)
      expect(l.lines.length, room.id).toBeGreaterThan(0)
      expect(Number.isFinite(l.fs) && l.fs > 0, room.id).toBe(true)
    }
  })
})
