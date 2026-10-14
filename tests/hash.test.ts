import { describe, expect, it } from 'vitest'
import { buildHash, parseHash, type Route } from '../src/store/hash'

describe('hash 파싱', () => {
  it('빈 값 / # / #/ → 캠퍼스', () => {
    expect(parseHash('')).toEqual({ kind: 'campus' })
    expect(parseHash('#')).toEqual({ kind: 'campus' })
    expect(parseHash('#/')).toEqual({ kind: 'campus' })
  })
  it('건물 · 층 · 방', () => {
    expect(parseHash('#/b/main')).toEqual({ kind: 'building', building: 'main' })
    expect(parseHash('#/b/main/2F')).toEqual({ kind: 'floor', building: 'main', floor: '2F' })
    expect(parseHash('#/b/main/2F/main-2f-c1-1')).toEqual({ kind: 'room', building: 'main', floor: '2F', room: 'main-2f-c1-1' })
  })
  it('층 표기는 대소문자 무관, B1 지원', () => {
    expect(parseHash('#/b/library/b1')).toEqual({ kind: 'floor', building: 'library', floor: 'B1' })
    expect(parseHash('#/b/main/2f')).toEqual({ kind: 'floor', building: 'main', floor: '2F' })
  })
  it('투어는 1-based → 내부 0-based', () => {
    expect(parseHash('#/tour/3')).toEqual({ kind: 'tour', index: 2 })
    expect(parseHash('#/tour')).toEqual({ kind: 'tour', index: 0 })
    expect(parseHash('#/tour/0')).toEqual({ kind: 'tour', index: 0 })
    expect(parseHash('#/tour/abc')).toEqual({ kind: 'tour', index: 0 })
  })
  it('보정 화면', () => {
    expect(parseHash('#/calibrate')).toEqual({ kind: 'calibrate' })
  })
  it('잘못된 값은 가장 가까운 유효 경로로 되돌린다', () => {
    expect(parseHash('#/b/nope')).toEqual({ kind: 'campus' })
    expect(parseHash('#/b/restroom/3F')).toEqual({ kind: 'building', building: 'restroom' }) // 화장실동 3층 없음
    expect(parseHash('#/b/main/9F')).toEqual({ kind: 'building', building: 'main' })
    expect(parseHash('#/b/main/2F/zzz')).toEqual({ kind: 'floor', building: 'main', floor: '2F' })
    // 다른 건물/층의 방 id
    expect(parseHash('#/b/main/3F/main-2f-c1-1')).toEqual({ kind: 'floor', building: 'main', floor: '3F' })
    expect(parseHash('#/b/new/2F/main-2f-c1-1')).toEqual({ kind: 'floor', building: 'new', floor: '2F' })
    expect(parseHash('#/something/else')).toEqual({ kind: 'campus' })
  })
  it('쿼리/슬래시 잡음 허용', () => {
    expect(parseHash('#/b/main/?x=1')).toEqual({ kind: 'building', building: 'main' })
    expect(parseHash('#//b//main//')).toEqual({ kind: 'building', building: 'main' })
  })
})

describe('hash 빌드', () => {
  const routes: Route[] = [
    { kind: 'campus' },
    { kind: 'building', building: 'gym' },
    { kind: 'floor', building: 'science', floor: 'B1' },
    { kind: 'room', building: 'main', floor: '2F', room: 'main-2f-c1-1' },
    { kind: 'tour', index: 4 },
    { kind: 'calibrate' },
  ]
  it('build → parse 왕복', () => {
    for (const r of routes) expect(parseHash(buildHash(r))).toEqual(r)
  })
  it('형식', () => {
    expect(buildHash({ kind: 'campus' })).toBe('#/')
    expect(buildHash({ kind: 'tour', index: 2 })).toBe('#/tour/3')
    expect(buildHash({ kind: 'floor', building: 'main', floor: '2F' })).toBe('#/b/main/2F')
  })
})
