// 검색 색인 단위 테스트. 기본 `npm test` 는 tests/** 만 실행하므로,
// 이 파일을 포함하려면 vite.config.ts 의 test.include 에 'src/**/*.test.ts' 를 추가한다.
import { describe, expect, it } from 'vitest'
import { browseHits, highlightRanges, parseQuery, search, searchDetailed, splitByRanges } from './searchIndex'

const names = (q: string) => searchDetailed(q, 200).groups.flatMap((g) => g.hits.map((h) => `${h.kind}:${h.name}`))
const first = (q: string) => searchDetailed(q).groups.flatMap((g) => g.hits)[0]

describe('검색: 초성 · 공백 · 혼합', () => {
  it('초성 ㄷㅅㄱ → 도서관(시설)과 도서관동(건물)', () => {
    const r = names('ㄷㅅㄱ')
    expect(r).toContain('room:도서관')
    expect(r).toContain('building:도서관동')
  })
  it('공백은 무시된다', () => {
    expect(names('도 서 관')).toContain('room:도서관')
    expect(names('컴 퓨 터 실')).toContain('room:컴퓨터실')
  })
  it('초성과 글자를 섞어도 된다 (도ㅅ관)', () => {
    expect(names('도ㅅ관')).toContain('room:도서관')
  })
  it('입력 중인 마지막 글자(조합 중)도 결과를 낸다', () => {
    expect(names('도서과')).toContain('room:도서관')
    expect(names('도서고')).toContain('room:도서관')
  })
  it('일치가 없으면 빈 결과', () => {
    expect(searchDetailed('zzzzqq').total).toBe(0)
    expect(searchDetailed('   ').total).toBe(0)
    expect(search('')).toEqual([])
  })
})

describe('검색: 건물 · 층 · 번호', () => {
  it('"본관" → 건물과 그 층만, 시설을 쏟아 내지 않는다', () => {
    const r = names('본관')
    expect(r[0]).toBe('building:본관동')
    expect(r.filter((x) => x.startsWith('floor:'))).toHaveLength(4)
    expect(r.filter((x) => x.startsWith('room:'))).toHaveLength(0)
  })
  it('"본관 2층" / "본관2층" → 층 항목이 먼저, 그 층의 시설이 뒤따른다', () => {
    for (const q of ['본관 2층', '본관2층']) {
      const hits = searchDetailed(q).groups.flatMap((g) => g.hits)
      expect(hits[0].kind).toBe('floor')
      expect(hits[0].floorId).toBe('2F')
      const rooms = hits.filter((h) => h.kind === 'room')
      expect(rooms.length).toBeGreaterThan(5)
      expect(rooms.every((h) => h.buildingId === 'main' && h.floorId === '2F')).toBe(true)
    }
  })
  it('"2층" → 모든 건물의 2층 평면도', () => {
    const hits = searchDetailed('2층').groups.flatMap((g) => g.hits)
    expect(hits.every((h) => h.kind === 'floor' && h.floorId === '2F')).toBe(true)
    expect(hits.length).toBeGreaterThanOrEqual(5)
  })
  it('"b1" / "과학관 지하" → 지하 1층', () => {
    expect(first('b1').floorId).toBe('B1')
    expect(first('과학관 지하')).toMatchObject({ kind: 'floor', buildingId: 'science', floorId: 'B1' })
  })
  it('하이픈이 있으면 정확히: "1-1" 은 2-11 을 잡지 않는다', () => {
    const r = names('1-1')
    expect(r[0]).toBe('room:1-1')
    expect(r).not.toContain('room:2-11')
    // 하이픈 없이 "11" 이면 느슨하게 일치
    expect(names('11')).toContain('room:2-11')
  })
  it('2023 명칭으로도 찾고, 어느 필드로 일치했는지 알려 준다', () => {
    const h = searchDetailed('컴퓨터').groups.flatMap((g) => g.hits).find((x) => x.matchedOn === '2023 평면도 명칭')
    expect(h?.matchedText).toContain('컴퓨터')
  })
  it('영문 건물명', () => {
    expect(first('main hall')).toMatchObject({ kind: 'building', buildingId: 'main' })
  })
})

describe('검색: 구조', () => {
  it('결과는 건물별 그룹이고 그룹 안에서 점수 내림차순', () => {
    const groups = search('실')
    expect(groups.length).toBeGreaterThan(1)
    for (const g of groups) {
      expect(new Set(g.hits.map((h) => h.buildingId)).size).toBe(1)
      for (let i = 1; i < g.hits.length; i++) expect(g.hits[i - 1].score).toBeGreaterThanOrEqual(g.hits[i].score)
    }
  })
  it('limit 보다 많이 일치하면 total > shown', () => {
    const r = searchDetailed('교실', 10)
    expect(r.shown).toBeLessThanOrEqual(10)
    expect(r.total).toBeGreaterThan(r.shown)
  })
  it('빈 질의용 건물 바로가기는 7동', () => {
    expect(browseHits()).toHaveLength(7)
  })
})

describe('하이라이트', () => {
  it('일치 구간을 원문 인덱스로 돌려준다 (공백 · 초성 포함)', () => {
    const q = parseQuery('ㄷㅅㄱ')!
    expect(highlightRanges('도서관동', q)).toEqual([[0, 3]])
    const q2 = parseQuery('컴퓨터 실')!
    expect(highlightRanges('컴퓨터실', q2)).toEqual([[0, 4]])
  })
  it('splitByRanges', () => {
    expect(splitByRanges('도서관동', [[0, 3]])).toEqual([
      { text: '도서관', hit: true },
      { text: '동', hit: false },
    ])
    expect(splitByRanges('abc', [])).toEqual([{ text: 'abc', hit: false }])
  })
})
