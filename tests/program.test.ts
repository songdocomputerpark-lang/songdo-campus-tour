// 입학설명회 식순(program.json): 파싱·대체 동작 · 소요 시간 · 시간표 막대 · 기본 탭 규칙 · 장소(venue) · 표시(서버 렌더)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Program } from '../src/data/types'
import { ProgramView } from '../src/features/event/ProgramTab'
import {
  buildTimeline,
  circled,
  durationMin,
  formatDuration,
  resolveEventTab,
  splitHighlight,
  telHref,
  venueOf,
} from '../src/features/event/programModel'
import { formatHm, parseHm } from '../src/lib/clock'
import { DEFAULT_PROGRAM_TITLE, sanitizeProgram } from '../src/lib/content'

const raw = JSON.parse(readFileSync('public/content/program.json', 'utf8'))
const program = sanitizeProgram(raw) as Program

describe('program.json 파싱', () => {
  it('실제 program.json: 제목 · 정보 · 식순 9줄 · 참석 안내 · 문의', () => {
    expect(program).not.toBeNull()
    expect(program.title).toBe('2027학년도 입학설명회 식순')
    expect(program.eyebrow).toBe('꿈을 향한 선택')
    expect(program.anniversary).toBe('개교 120주년 · 1906–2026')
    expect(program.dateText).toBe('2026. 10. 31.(토)')
    expect(program.info.map((i) => i.label)).toEqual(['일시', '장소', '접수'])
    expect(program.info[1].facility).toBe('gym-4f-p91')
    expect(program.program).toHaveLength(9)
    expect(program.program.map((r) => r.start)).toEqual(['09:20', '10:00', '10:10', '10:30', '10:45', '11:00', '11:40', '12:10', '12:40'])
    expect(program.program[4]).toMatchObject({ badge: 'BREAK', short: 'QUIZ', kind: 'quiz' })
    expect(program.program[6].items).toHaveLength(3)
    expect(program.program[7].action).toBe('spots')
    expect(program.notes).toHaveLength(2)
    expect(program.contact).toEqual({ title: '행사 문의', phones: ['032-627-4141', '032-627-4167'], org: '송도고등학교 창의국제홍보부' })
  })

  it('파일이 없거나 형식이 틀리면 null → 식순 탭을 숨긴다', () => {
    expect(sanitizeProgram(null)).toBeNull()
    expect(sanitizeProgram(undefined)).toBeNull()
    expect(sanitizeProgram('문자열')).toBeNull()
    expect(sanitizeProgram([])).toBeNull()
    expect(sanitizeProgram({})).toBeNull()
    expect(sanitizeProgram({ title: '제목만' })).toBeNull()
    expect(sanitizeProgram({ program: [] })).toBeNull()
    expect(sanitizeProgram({ program: 'x' })).toBeNull()
  })

  it('쓸 수 없는 줄(시각·종류·제목 오류)은 버리고, 하나도 없으면 null', () => {
    expect(sanitizeProgram({ program: [{ start: '25:00', kind: 'talk', title: 'a' }, { start: '10:00', kind: 'nope', title: 'b' }, { start: '10:00', kind: 'talk', title: ' ' }, null, 3] })).toBeNull()
    const p = sanitizeProgram({
      program: [
        { start: '9시', kind: 'talk', title: '버림' },
        { start: '10:00', kind: 'talk', title: '남음', badge: '개회' },
      ],
    }) as Program
    expect(p.program).toHaveLength(1)
    expect(p.program[0].title).toBe('남음')
    expect(p.title).toBe(DEFAULT_PROGRAM_TITLE)
    expect(p.info).toEqual([])
    expect(p.notes).toEqual([])
    expect(p.contact).toBeNull()
  })

  it('end 가 start 이하이거나 형식이 틀리면 end 를 쓰지 않는다 · 시작 시각 순으로 정렬', () => {
    const p = sanitizeProgram({
      program: [
        { start: '11:00', end: '10:00', kind: 'talk', title: 'B' },
        { start: '10:00', end: '10:10', kind: 'talk', title: 'A' },
        { start: '12:00', end: 'x', kind: 'end', title: 'C' },
      ],
    }) as Program
    expect(p.program.map((r) => r.title)).toEqual(['A', 'B', 'C'])
    expect(p.program[0].end).toBe('10:10')
    expect(p.program[1]).not.toHaveProperty('end')
    expect(p.program[2]).not.toHaveProperty('end')
  })

  it('알 수 없는 키(_안내)·빈 문구·알 수 없는 action 은 무시한다', () => {
    const p = sanitizeProgram({
      _안내: '편집 메모',
      program: [{ start: '10:00', kind: 'tour', title: 'T', desc: '  ', items: ['', ' 가 ', 3], action: 'other' }],
      info: [{ label: '일시', value: '' }, { label: '장소', value: '체육관', facility: ' x ' }, { value: '값만' }],
      notes: [{ strong: '', text: '' }, { strong: '굵게', text: '보통' }],
      contact: { phones: [], org: '' },
    }) as Program
    expect(p).not.toHaveProperty('_안내')
    expect(p.program[0]).not.toHaveProperty('desc')
    expect(p.program[0]).not.toHaveProperty('action')
    expect(p.program[0].items).toEqual(['가'])
    expect(p.info).toEqual([{ label: '장소', value: '체육관', facility: 'x' }])
    expect(p.notes).toEqual([{ strong: '굵게', text: '보통' }])
    expect(p.contact).toBeNull()
  })

  it('문의: 전화번호가 없어도 기관명이 있으면 카드를 만들고, 제목은 기본 "행사 문의"', () => {
    const p = sanitizeProgram({ program: [{ start: '10:00', kind: 'talk', title: 'a' }], contact: { phones: ['032-1'], org: '' } }) as Program
    expect(p.contact).toEqual({ title: '행사 문의', phones: ['032-1'], org: '' })
  })
})

describe('시각 · 소요 시간 · 표기', () => {
  it('parseHm / formatHm', () => {
    expect(parseHm('09:20')).toBe(560)
    expect(parseHm('9:05')).toBe(545)
    expect(parseHm('23:59')).toBe(1439)
    expect(parseHm('24:00')).toBeNull()
    expect(parseHm('10:60')).toBeNull()
    expect(parseHm('1000')).toBeNull()
    expect(parseHm(1000)).toBeNull()
    expect(formatHm(560)).toBe('09:20')
    expect(formatHm(760)).toBe('12:40')
  })

  it('소요 시간 = end − start (실제 식순)', () => {
    const mins = program.program.map((r) => durationMin(r))
    expect(mins).toEqual([40, 10, 20, 15, 15, 40, 30, 30, null])
    expect(durationMin({ start: '10:00' })).toBeNull()
    expect(durationMin({ start: '10:00', end: '10:00' })).toBeNull()
    expect(durationMin({ start: '10:30', end: '10:00' })).toBeNull()
  })

  it('formatDuration: 40분 · 1시간 · 1시간 30분', () => {
    expect(formatDuration(40)).toBe('40분')
    expect(formatDuration(5)).toBe('5분')
    expect(formatDuration(60)).toBe('1시간')
    expect(formatDuration(90)).toBe('1시간 30분')
  })

  it('번호 칩 · 전화 링크 · 제목 강조', () => {
    expect([0, 1, 2, 19].map(circled)).toEqual(['①', '②', '③', '⑳'])
    expect(circled(20)).toBe('21.')
    expect(telHref('032-627-4141')).toBe('tel:0326274141')
    expect(telHref('+82 32-627-4141')).toBe('tel:+82326274141')
    expect(splitHighlight('2027학년도 입학설명회 식순', '입학설명회')).toEqual(['2027학년도 ', '입학설명회', ' 식순'])
    expect(splitHighlight('식순', '입학설명회')).toEqual(['식순', '', ''])
  })
})

describe('시간표 막대', () => {
  const tl = buildTimeline(program)!

  it('접수·종료를 뺀 7구간, 10:00 ~ 12:40', () => {
    expect(tl.segments.map((g) => g.head)).toEqual(['개회', '1부', '2부', 'QUIZ', '3부', '4부', '5부'])
    expect(tl.start).toBe(600)
    expect(tl.end).toBe(760)
    expect(tl.segments.some((g) => g.kind === 'reception' || g.kind === 'end')).toBe(false)
  })

  it('폭은 소요 시간에 비례하고 빈틈 없이 이어진다 (합 100%)', () => {
    const total = tl.end - tl.start
    for (const g of tl.segments) expect(g.widthPct).toBeCloseTo(((g.end - g.start) / total) * 100, 6)
    expect(tl.segments.reduce((s, g) => s + g.widthPct, 0)).toBeCloseTo(100, 6)
    expect(tl.segments[0].leftPct).toBe(0)
    tl.segments.slice(1).forEach((g, i) => expect(g.leftPct).toBeCloseTo(tl.segments[i].leftPct + tl.segments[i].widthPct, 6))
    // 3부(40분)는 개회(10분)의 4배
    expect(tl.segments[4].widthPct / tl.segments[0].widthPct).toBeCloseTo(4, 6)
  })

  it('종류별 색 단계: 같은 종류 안에서 0, 1, 2 … 로 이어진다', () => {
    expect(tl.segments.filter((g) => g.kind === 'talk').map((g) => g.shade)).toEqual([0, 1, 2, 3])
    expect(tl.segments.filter((g) => g.kind === 'quiz').map((g) => g.shade)).toEqual([0])
    expect(tl.segments.filter((g) => g.kind === 'tour').map((g) => g.shade)).toEqual([0, 1])
  })

  it('막대 글자: "3부 · 대입 전형 설명회" → 위 "3부" / 아래 "대입 전형 설명회"', () => {
    expect(tl.segments[4]).toMatchObject({ head: '3부', sub: '대입 전형 설명회' })
    expect(tl.segments[3]).toMatchObject({ head: 'QUIZ', sub: '' })
    expect(tl.segments[0]).toMatchObject({ head: '개회', sub: '' })
  })

  it('눈금: 각 구간 시작 + 마지막 "12:40 종료"', () => {
    expect(tl.ticks.map((t) => t.text)).toEqual(['10:00', '10:10', '10:30', '10:45', '11:00', '11:40', '12:10', '12:40 종료'])
    expect(tl.ticks[tl.ticks.length - 1]).toMatchObject({ last: true, leftPct: 100 })
    expect(tl.ticks.filter((t) => t.last)).toHaveLength(1)
  })

  it('구간이 없으면 null, 종료 줄이 없으면 시각만', () => {
    expect(buildTimeline({ program: [{ start: '09:00', end: '10:00', badge: '접수', kind: 'reception', title: 'a' }] })).toBeNull()
    const t = buildTimeline({ program: [{ start: '10:00', end: '11:00', badge: '1부', kind: 'talk', title: 'a' }] })!
    expect(t.ticks.map((x) => x.text)).toEqual(['10:00', '11:00'])
  })
})

describe('기본 탭 규칙 — 항상 식순 (시각·날짜와 무관)', () => {
  it('저장된 탭이 없으면 식순', () => {
    expect(resolveEventTab(null, program, true)).toBe('program')
  })
  it('저장된 탭(주소 · 클릭)이 있으면 그대로', () => {
    expect(resolveEventTab('spots', program, true)).toBe('spots')
    expect(resolveEventTab('program', program, true)).toBe('program')
  })
  it('시각·날짜를 바꿔도 결과가 같다', () => {
    vi.useFakeTimers()
    try {
      for (const iso of ['2026-10-23T03:00:00Z', '2026-10-31T01:00:00Z', '2026-10-31T03:30:00Z', '2026-10-31T09:00:00Z', '2026-11-01T00:00:00Z']) {
        vi.setSystemTime(new Date(iso))
        expect(resolveEventTab(null, program, true)).toBe('program')
      }
    } finally {
      vi.useRealTimers()
    }
  })
  it('식순 파일이 없으면(불러온 뒤) 항상 학교 투어 장소 — 식순 탭은 숨겨진다', () => {
    expect(resolveEventTab(null, null, true)).toBe('spots')
    expect(resolveEventTab('program', null, true)).toBe('spots')
    expect(resolveEventTab('spots', null, true)).toBe('spots')
  })
  it('아직 불러오는 중이면 식순을 기다린다 (spots 가 명시된 경우만 바로 spots)', () => {
    expect(resolveEventTab(null, null, false)).toBe('program')
    expect(resolveEventTab('spots', null, false)).toBe('spots')
  })
})

describe('설명회 장소(venue)', () => {
  it('장소 줄의 facility(gym-4f-p91) → 체육관동', () => {
    const v = venueOf(program)!
    expect(v).toMatchObject({ label: '장소', value: '송도고 체육관', roomId: 'gym-4f-p91', buildingId: 'gym', buildingName: '체육관동' })
  })
  it('시설이 없거나 알 수 없으면 null (버튼·강조 없음)', () => {
    expect(venueOf(null)).toBeNull()
    expect(venueOf({ info: [{ label: '장소', value: '체육관' }] })).toBeNull()
    expect(venueOf({ info: [{ label: '장소', value: '체육관', facility: 'nope-1f-x' }] })).toBeNull()
  })
})

describe('식순 화면(서버 렌더)', () => {
  const noop = () => {}
  const render = (p: Program = program, venue = venueOf(p)) => renderToStaticMarkup(createElement(ProgramView, { program: p, venue, onShowSpots: noop, onShowVenue: noop }))
  const html = render()

  it('히어로: 눈썹 · 강조 제목 · 안내 · 개교 문구 · 일시/장소/접수', () => {
    expect(html).toContain('꿈을 향한 선택')
    expect(html).toMatch(/<span class="[^"]*text-gold-deep[^"]*">입학설명회<\/span>/) // 진한 금색 글자(형광펜 띠 위)
    expect(html).toContain('설명회 순서와 시간을 미리 확인해 주세요.')
    expect(html).toContain('개교 120주년 · 1906–2026')
    for (const label of ['일시', '장소', '접수']) expect(html).toContain(`>${label}</dt>`)
    expect(html).toContain('2026. 10. 31.(토) 10:00')
    expect(html).toContain('09:20부터')
  })

  it('장소 줄은 버튼 (지도에서 보기), 시설이 없으면 글자만', () => {
    expect(html).toContain('지도에서 보기')
    expect(html).toContain('송도고 체육관, 지도에서 체육관동 보기')
    expect(render(program, null)).not.toContain('지도에서 보기')
  })

  it('시간표 막대 · 범례 · 마지막 눈금', () => {
    expect(html).toContain('한눈에 보는 시간표')
    expect(html).toContain('12:40 종료')
    for (const l of ['설명·발표', '퀴즈 이벤트', '연수·투어']) expect(html).toContain(l)
    expect(html).toContain('role="img"')
  })

  it('식순 목록: 의미 있는 목록 · 줄마다 시작 시각 · 소요 시간', () => {
    expect(html).toContain('<ol role="list"')
    expect((html.match(/<h4/g) ?? []).length).toBe(9)
    for (const t of ['등록 및 입장', '개회사', '재학생 발표', 'BREAK QUIZ', '대입 전형 설명회', '학부모 연수 · 부스 투어', '학교 투어', '행사 종료']) expect(html).toContain(t)
    expect(html).toMatch(/<time dateTime="10:45"[^>]*>10:45<\/time>/)
    expect(html).toMatch(/~ <time dateTime="11:00">11:00<\/time>/)
    expect(html).toContain('40분')
    expect(html).toContain('15분')
    expect(html).toContain('30분')
  })

  it('4부 세부 순서는 ① ② ③ 칩', () => {
    expect(html).toContain('①')
    expect(html).toContain('②')
    expect(html).toContain('③')
    expect(html).toContain('부스 투어 (8개 부스)')
  })

  it('5부 줄에만 "투어 장소 보기 →" 버튼, BREAK 줄은 연한 금색 배경', () => {
    expect((html.match(/투어 장소 보기/g) ?? []).length).toBe(1)
    expect(html).toContain('from-gold-50')
    expect((html.match(/from-gold-50/g) ?? []).length).toBe(1)
  })

  it('참석 안내: 굵은 글씨 + 본문 · 행사 문의: tel 링크 + 기관명', () => {
    expect(html).toContain('<strong class="font-bold text-ink">입장 시 QR 코드로 사전 등록</strong>(설문)을 해 주세요.')
    expect(html).toContain('<strong class="font-bold text-ink">BREAK QUIZ</strong>는 스마트폰으로 참여합니다.')
    expect(html).toContain('href="tel:0326274141"')
    expect(html).toContain('href="tel:0326274167"')
    expect(html).toContain('송도고등학교 창의국제홍보부')
  })

  it('진행 중 표시가 없다 — 어느 날·몇 시에 렌더해도 똑같다 (aria-current 없음)', () => {
    expect(html).not.toContain('aria-current')
    expect(html).not.toContain('진행 중')
    vi.useFakeTimers()
    try {
      for (const iso of ['2026-10-23T03:00:00Z', '2026-10-31T01:50:00Z', '2026-10-31T09:00:00Z']) {
        vi.setSystemTime(new Date(iso))
        expect(render()).toBe(html)
      }
    } finally {
      vi.useRealTimers()
    }
  })

  afterEach(() => vi.useRealTimers())
})
