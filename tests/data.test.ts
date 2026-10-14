// 데이터 무결성: 데이터 파일은 읽기 전용 계약이다 — 구조가 깨지면 앱 전체가 영향을 받는다.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FLOOR_ORDER, allFloors, allRooms, buildings, campus, floorLabel, floorsOf, getBuilding, getFloor, getRoom, nearestBuilding, roomsIndex } from '../src/data'
import type { Pt } from '../src/data/types'
import { boundsOf, pointInPolygon } from '../src/lib/geometry'

const ROOT = join(__dirname, '..')
const readJson = (rel: string) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))

describe('campus.json / floors.json', () => {
  it('26개 층 · 139개 시설 · 7개 건물', () => {
    expect(allFloors).toHaveLength(26)
    expect(allRooms).toHaveLength(139)
    expect(buildings).toHaveLength(7)
    expect(roomsIndex.size).toBe(139) // id 중복 없음
  })

  it('id 유일성: 건물 · 층(건물-층) · 방 · 맥락 건물', () => {
    const uniq = (ids: string[]) => expect(new Set(ids).size).toBe(ids.length)
    uniq(buildings.map((b) => b.id))
    uniq(allFloors.map((f) => `${f.building}-${f.floor}`))
    uniq(allRooms.map((r) => r.room.id))
    uniq(campus.minor.map((m) => m.id))
  })

  it('각 건물의 floors[] 와 층 평면도가 일치한다', () => {
    for (const b of buildings) {
      const list = floorsOf(b.id).map((f) => f.floor)
      expect(list).toEqual([...b.floors].sort((a, c) => FLOOR_ORDER.indexOf(a) - FLOOR_ORDER.indexOf(c)))
      for (const f of b.floors) expect(getFloor(b.id, f)).toBeTruthy()
    }
  })

  it('모든 방: 다각형 ≥ 3점, 라벨이 다각형 bbox 안, 카테고리 유효', () => {
    for (const { room, floor } of allRooms) {
      expect(room.poly.length, room.id).toBeGreaterThanOrEqual(3)
      const b = boundsOf(room.poly)
      expect(room.label[0], room.id).toBeGreaterThanOrEqual(b.x - 1)
      expect(room.label[0], room.id).toBeLessThanOrEqual(b.x + b.w + 1)
      expect(room.label[1], room.id).toBeGreaterThanOrEqual(b.y - 1)
      expect(room.label[1], room.id).toBeLessThanOrEqual(b.y + b.h + 1)
      expect(campus.categories[room.cat], room.id).toBeTruthy()
      expect(['high', 'medium']).toContain(room.conf)
      // 좌표는 층 size 안 (여유 2px)
      for (const [x, y] of room.poly) {
        expect(x).toBeGreaterThanOrEqual(-2)
        expect(y).toBeGreaterThanOrEqual(-2)
        expect(x).toBeLessThanOrEqual(floor.size[0] + 2)
        expect(y).toBeLessThanOrEqual(floor.size[1] + 2)
      }
    }
  })

  it('CAD 레이어 이미지는 모두 public/plans 에 존재, 없으면 개략도', () => {
    for (const f of allFloors) {
      if (f.image) expect(existsSync(join(ROOT, 'public', f.image)), f.image).toBe(true)
      else expect(f.schematic, `${f.building}-${f.floor}`).toBe(true)
    }
  })

  it('코어 타입과 위치 정보', () => {
    for (const f of allFloors)
      for (const c of f.cores) {
        expect(['stairs', 'elevator', 'toilet', 'aed', 'kit', 'entrance', 'bridge']).toContain(c.type)
        expect(Boolean(c.poly) || Boolean(c.at), `${f.building}-${f.floor} ${c.type}`).toBe(true)
      }
  })

  it('site: 건물 중심이 건물 다각형 안, 변환 행렬 유효', () => {
    for (const b of buildings) expect(pointInPolygon(b.center as Pt, b.poly), b.id).toBe(true)
    expect(campus.geo.pxToEnu).toHaveLength(6)
    expect(campus.geo.metersPerPx).toBeGreaterThan(0)
    expect(campus.site.viewBox).toHaveLength(4)
  })

  it('헬퍼', () => {
    expect(floorLabel('B1')).toBe('지하 1층')
    expect(floorLabel('2F')).toBe('2층')
    expect(getBuilding('main')?.name).toBe('본관동')
    expect(getBuilding('zzz')).toBeUndefined()
    expect(getRoom('main-2f-c1-1')?.floor.floor).toBe('2F')
    const near = nearestBuilding(getBuilding('gym')!.center as Pt)
    expect(near.building.id).toBe('gym')
    expect(near.inside).toBe(true)
    const far = nearestBuilding([100, 100])
    expect(far.inside).toBe(false)
    expect(far.distPx).toBeGreaterThan(0)
  })
})

describe('public/content', () => {
  it('facilities.json 은 모든 시설 id 를 포함하고 이름이 일치한다', () => {
    const fac = readJson('public/content/facilities.json').facilities as Record<string, { name: string }>
    expect(Object.keys(fac).sort()).toEqual(allRooms.map((r) => r.room.id).sort())
    for (const { room } of allRooms) expect(fac[room.id].name, room.id).toBe(room.name)
  })

  it('tour.json 의 모든 지점은 실제 시설을 가리킨다 (중복 없음, 안내 문구 있음)', () => {
    const tour = readJson('public/content/tour.json')
    expect(tour.stops.length).toBeGreaterThan(0)
    for (const s of tour.stops) expect(getRoom(s.facility), s.facility).toBeTruthy()
    const ids = tour.stops.map((s: { facility: string }) => s.facility)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of tour.stops) expect(typeof s.note, s.facility).toBe('string')
  })

  it('photos.json 이 있다면 존재하는 시설/건물 id 만 가리키고 파일도 있다', () => {
    const path = join(ROOT, 'public/content/photos.json')
    if (!existsSync(path)) return
    const photos = readJson('public/content/photos.json') as Record<string, { src: string }[]>
    for (const [id, list] of Object.entries(photos)) {
      const ok = getRoom(id) || (id.startsWith('building-') && getBuilding(id.slice('building-'.length)))
      expect(ok, id).toBeTruthy()
      for (const p of list) expect(existsSync(join(ROOT, 'public', p.src)), p.src).toBe(true)
    }
  })

  it('geo-calibration.json 형식', () => {
    const c = readJson('public/content/geo-calibration.json')
    expect('calibration' in c).toBe(true)
  })

  it('엠블럼 SVG 존재', () => {
    expect(existsSync(join(ROOT, 'public/brand/emblem.svg'))).toBe(true)
  })
})
