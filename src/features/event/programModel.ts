/**
 * features/event/programModel.ts — 입학설명회 식순('설명회 안내' > 식순 탭) 순수 함수 모음 (React·스토어 비의존, vitest 대상)
 *
 *  - 소요 시간(start~end), 시간표 막대 구간(비례 폭·종류별 색 단계)·눈금, 번호 칩(①②③)
 *  - 탭 규칙: #/event 의 기본 탭은 항상 '식순' (식순 파일이 없으면 '학교 투어 장소' 만 보인다). 시각·날짜에 따라 달라지지 않는다.
 *  - 장소(venue): info 의 facility(시설 id)가 있는 건물 — 지도에서 강조할 건물
 * 시간·이름·전화번호는 모두 program.json 에서 온다 — 여기서 지어내지 않는다.
 */
import { getRoom } from '../../data'
import type { BuildingId, Program, ProgramKind, ProgramRow } from '../../data/types'
import { formatHm, parseHm } from '../../lib/clock'

/** 설명회 안내 패널의 탭: program = 식순, spots = 학교 투어 장소 */
export type EventTab = 'program' | 'spots'

export const EVENT_TAB_LABEL: Record<EventTab, string> = { program: '식순', spots: '학교 투어 장소' }

// ───────────── 시간 ─────────────

export function startMin(row: Pick<ProgramRow, 'start'>): number {
  return parseHm(row.start) ?? 0
}
export function endMin(row: Pick<ProgramRow, 'end'>): number | null {
  return row.end ? parseHm(row.end) : null
}

/** 소요 시간(분) = end − start. end 가 없거나 start 이하면 null */
export function durationMin(row: Pick<ProgramRow, 'start' | 'end'>): number | null {
  const s = parseHm(row.start)
  const e = row.end ? parseHm(row.end) : null
  return s !== null && e !== null && e > s ? e - s : null
}

/** 40 → "40분" · 60 → "1시간" · 90 → "1시간 30분" */
export function formatDuration(min: number): string {
  const m = Math.round(min)
  if (m < 60) return `${m}분`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}시간 ${r}분` : `${h}시간`
}

/** 번호 칩 글자: 0 → ① … 19 → ⑳, 그 이상은 "21." */
export function circled(index: number): string {
  return index >= 0 && index < 20 ? String.fromCharCode(0x2460 + index) : `${index + 1}.`
}

/** "032-627-4141" → "tel:0326274141" */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^0-9+]/g, '')}`
}

/** 제목을 [앞, 강조, 뒤] 로 나눈다 (강조 단어가 없으면 [제목, '', '']) */
export function splitHighlight(title: string, term: string): [string, string, string] {
  const i = term ? title.indexOf(term) : -1
  return i < 0 ? [title, '', ''] : [title.slice(0, i), term, title.slice(i + term.length)]
}

// ───────────── 시간표 막대 ─────────────

export interface TimelineSegment {
  /** program 배열 안의 위치 */
  index: number
  row: ProgramRow
  kind: ProgramKind
  start: number
  end: number
  /** 같은 종류 안에서 몇 번째 구간인가(색 단계) */
  shade: number
  /** 막대 안 글자: 위 줄 / 아래 줄 ("3부 · 대입 전형 설명회" → "3부" / "대입 전형 설명회") */
  head: string
  sub: string
  /** 전체 범위 대비 왼쪽 위치·폭 (%) */
  leftPct: number
  widthPct: number
}

export interface TimelineTick {
  min: number
  text: string
  leftPct: number
  /** 마지막 눈금(종료) — 오른쪽 끝에 맞춰 적는다 */
  last: boolean
}

export interface Timeline {
  start: number
  end: number
  segments: TimelineSegment[]
  ticks: TimelineTick[]
}

/** 시간표 막대에 그리는 종류 (접수·종료는 제외) */
const BAR_KINDS: readonly ProgramKind[] = ['talk', 'quiz', 'tour']

/** 막대 구간 = 접수·종료를 뺀 줄 중 start~end 가 있는 것. 구간이 없으면 null */
export function buildTimeline(program: Pick<Program, 'program'>): Timeline | null {
  const raw = program.program
    .map((row, index) => ({ row, index, s: startMin(row), e: endMin(row) }))
    .filter((x): x is { row: ProgramRow; index: number; s: number; e: number } => BAR_KINDS.includes(x.row.kind) && x.e !== null && x.e > x.s)
  if (raw.length === 0) return null
  const start = Math.min(...raw.map((x) => x.s))
  const end = Math.max(...raw.map((x) => x.e))
  const span = end - start
  const used = new Map<ProgramKind, number>()
  const segments = raw.map((x): TimelineSegment => {
    const shade = used.get(x.row.kind) ?? 0
    used.set(x.row.kind, shade + 1)
    const label = x.row.short || x.row.badge || x.row.title
    const [head, ...rest] = label.split(' · ')
    return {
      index: x.index,
      row: x.row,
      kind: x.row.kind,
      start: x.s,
      end: x.e,
      shade,
      head: head.trim(),
      sub: rest.join(' · ').trim(),
      leftPct: ((x.s - start) / span) * 100,
      widthPct: ((x.e - x.s) / span) * 100,
    }
  })
  // 눈금: 각 구간의 시작 + 맨 끝. 맨 끝이 '종료' 줄의 시작과 같으면 "12:40 종료"
  const endRow = program.program.find((r) => r.kind === 'end' && startMin(r) === end)
  const starts = [...new Set(segments.map((g) => g.start))].sort((a, b) => a - b)
  const ticks: TimelineTick[] = starts.map((m) => ({ min: m, text: formatHm(m), leftPct: ((m - start) / span) * 100, last: false }))
  ticks.push({ min: end, text: endRow ? `${formatHm(end)} ${endRow.badge || '종료'}` : formatHm(end), leftPct: 100, last: true })
  return { start, end, segments, ticks }
}

// ───────────── 탭 규칙 ─────────────

/**
 * 실제로 보여 줄 탭.
 *  - stored: 주소/클릭으로 정해진 탭(없으면 null = 기본값 '식순')
 *  - 콘텐츠를 아직 못 불러왔으면(ready=false) 식순이 있다고 보고 기다린다 — 'spots' 가 명시된 경우만 바로 'spots'
 *  - 불러왔는데 식순이 없으면 항상 'spots' ('식순' 탭은 숨겨진다)
 */
export function resolveEventTab(stored: EventTab | null, program: Program | null, ready: boolean): EventTab {
  if (!program) return ready ? 'spots' : (stored ?? 'program')
  return stored ?? 'program'
}

// ───────────── 장소(venue) ─────────────

export interface Venue {
  /** info 줄의 라벨/값 ("장소" / "송도고 체육관") */
  label: string
  value: string
  roomId: string
  buildingId: BuildingId
  buildingName: string
}

/** info 중 facility(시설 id)가 실제 시설인 첫 줄 → 그 건물. 없으면 null (버튼·지도 강조 없음) */
export function venueOf(program: Pick<Program, 'info'> | null): Venue | null {
  for (const it of program?.info ?? []) {
    if (!it.facility) continue
    const ref = getRoom(it.facility)
    if (ref) return { label: it.label, value: it.value, roomId: ref.room.id, buildingId: ref.building.id, buildingName: ref.building.name }
  }
  return null
}
