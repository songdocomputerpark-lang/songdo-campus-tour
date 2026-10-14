/**
 * features/search/searchIndex.ts — 건물 · 층 · 시설 통합 검색 색인 (SPEC §4.5)
 *
 * 색인 대상
 *   · 시설(room, 139곳): 시설명 · 부제 · 2023 평면도 명칭(src.name2023) · 분류(카테고리) · 소개 문구(facilities.json, 있을 때만)
 *   · 층(26개): "본관동 2층" — 건물명 + 층 표기
 *   · 건물(7동): 한글명 · 약칭("본관") · 영문명
 *
 * 매칭 규칙
 *   · 공백 · 구두점 무시 ("도 서 관" = "도서관"), 대소문자 무시, 한글 초성(ㄷㅅㄱ → 도서관), 초성+글자 혼합(도ㅅ관).
 *   · "1-1" 처럼 하이픈이 있는 질의는 하이픈까지 일치해야 한다 (2-11 이 "1-1" 로 잡히지 않도록). 하이픈이 없으면 무시하고 비교.
 *   · IME 조합 중인 마지막 글자(받침 없는 음절) 는 같은 초성+중성의 음절에 일치시킨다 ("도서고" ← 입력 중 → 도서관).
 *   · 공백으로 나눈 낱말은 모두 만족해야 한다(AND). "본관 2층", "본관 교무실", "신관 ㄱㅅ" 처럼 건물·층 문맥을 조합할 수 있다.
 *   · 건물/층 문맥만으로는 시설을 쏟아 내지 않는다 — "본관" 은 건물과 그 층만, "본관 2층" 은 그 층의 시설까지 보여 준다.
 *
 * 결과는 건물별 그룹. 그룹 순서 = 그룹 안 최고 점수 순, 그룹 안 순서 = 점수 → (건물 > 층 > 시설) → 도면 순서.
 * 선택 시 이동은 호출 측(SearchBox)이 store.selectRoom / selectFloor / selectBuilding 으로 처리한다.
 */
import { allFloors, allRooms, buildings, campus, floorLabel } from '../../data'
import type { BuildingId, CategoryId, FacilityMap, FloorId } from '../../data/types'
import { useContent } from '../../lib/content'
import { choseongOf, isChoseongJamo } from '../../lib/hangul'

export type Range = [number, number]
export type HitKind = 'building' | 'floor' | 'room'

export interface SearchHit {
  /** 목록 key · option id 용 고유값 */
  key: string
  kind: HitKind
  /** kind==='room' 일 때 시설 id, 아니면 '' */
  roomId: string
  /** 표시 이름 (시설명 / "본관동 2층" / "본관동") */
  name: string
  /** 시설: 부제, 건물: 영문명 */
  sub: string | null
  buildingId: BuildingId
  buildingName: string
  buildingColor: string
  /** 건물 힛트는 null */
  floorId: FloorId | null
  /** 건물 힛트는 '' */
  floorLabel: string
  /** 시설만 */
  cat: CategoryId | null
  categoryLabel: string
  /** 층/건물 힛트의 부가 설명 (예: "시설 12곳") */
  meta: string
  schematic: boolean
  /** 이름 이외 필드로 일치했을 때의 설명 (예: "2023 명칭") — 이름으로 일치하면 '' */
  matchedOn: string
  matchedText: string
  matchedRanges: Range[]
  nameRanges: Range[]
  subRanges: Range[]
  score: number
}

export interface SearchGroup {
  buildingId: BuildingId
  buildingName: string
  color: string
  hits: SearchHit[]
}

export interface SearchResponse {
  groups: SearchGroup[]
  /** 일치한 전체 건수 (limit 이전) */
  total: number
  /** 실제 표시되는 건수 */
  shown: number
}

// ────────────────────────────── 정규화(fold) ──────────────────────────────

interface Folded {
  /** 하이픈을 보존한 문자 배열 */
  keep: string[]
  /** 하이픈까지 제거한 문자 배열 */
  loose: string[]
}

const DROP = /^[\s·•∙・ㆍ_.,()[\]{}'"`~!?:;\/\\|+&*#@<>^=%$]$/u
const DASH = /^[‐-―−－]$/u

/** 소문자 · 공백/구두점 제거. spans[i] = chars[i] 의 원문 [start, end) 위치 (하이라이트용) */
function foldMapped(s: string, keepHyphen: boolean): { chars: string[]; spans: Range[] } {
  const chars: string[] = []
  const spans: Range[] = []
  let i = 0
  for (const raw of s) {
    const start = i
    i += raw.length
    let ch = DASH.test(raw) ? '-' : raw
    if (ch === '-') {
      if (!keepHyphen) continue
    } else if (DROP.test(ch)) continue
    ch = ch.normalize('NFC').toLowerCase()
    chars.push(ch)
    spans.push([start, i])
  }
  return { chars, spans }
}

function fold(s: string): Folded {
  return { keep: foldMapped(s, true).chars, loose: foldMapped(s, false).chars }
}

// ────────────────────────────── 문자/부분 일치 ──────────────────────────────

const HANGUL_BASE = 0xac00
const HANGUL_END = 0xd7a3
/** 단순 모음 → 그 모음으로 시작하는 복합 모음 (조합 중 "고" → 과/괘/괴) */
const COMPOUND_VOWELS: Record<number, number[]> = { 8: [9, 10, 11], 13: [14, 15, 16], 18: [19] }

/** 0 = 불일치, 1 = 글자 일치, 2 = 초성 일치 */
function charMatch(q: string, t: string, open: boolean, jamo: boolean): 0 | 1 | 2 {
  if (q === t) return 1
  if (isChoseongJamo(q)) return jamo && choseongOf(t) === q ? 2 : 0
  if (open && q.length === 1 && t.length === 1) {
    const qc = q.charCodeAt(0)
    const tc = t.charCodeAt(0)
    if (qc >= HANGUL_BASE && qc <= HANGUL_END && tc >= HANGUL_BASE && tc <= HANGUL_END) {
      const qi = qc - HANGUL_BASE
      const ti = tc - HANGUL_BASE
      if (qi % 28 === 0) {
        // 받침 없는 음절 = 아직 조합 중일 수 있음 → 같은 초성+중성이면 일치
        const qv = Math.floor(qi / 28)
        const tv = Math.floor(ti / 28)
        if (qv === tv) return 1
        const cho = Math.floor(qv / 21)
        if (cho === Math.floor(tv / 21) && COMPOUND_VOWELS[qv % 21]?.includes(tv % 21)) return 1
      }
    }
  }
  return 0
}

const NONE = { idx: -1, literal: false }

/** t 안에서 q 가 처음 일치하는 위치. literal=false 면 초성이 섞여 일치 */
function find(t: string[], q: string[], open: boolean, jamo: boolean): { idx: number; literal: boolean } {
  const n = q.length
  if (n === 0) return NONE
  for (let i = 0; i + n <= t.length; i++) {
    let literal = true
    let ok = true
    for (let j = 0; j < n; j++) {
      const m = charMatch(q[j], t[i + j], open && j === n - 1, jamo)
      if (m === 0) {
        ok = false
        break
      }
      if (m === 2) literal = false
    }
    if (ok) return { idx: i, literal }
  }
  return NONE
}

/** 완전일치 100 > 접두 80 > 부분 60, 초성이 섞이면 70 / 50 / 40 */
function scoreOf(t: string[], q: string[], open: boolean, jamo: boolean): number {
  const m = find(t, q, open, jamo)
  if (m.idx < 0) return 0
  if (m.idx === 0 && t.length === q.length) return m.literal ? 100 : 70
  if (m.idx === 0) return m.literal ? 80 : 50
  return m.literal ? 60 : 40
}

// ────────────────────────────── 질의 ──────────────────────────────

interface Token {
  keep: string[]
  loose: string[]
  /** 하이픈이 있는 낱말 → 하이픈까지 일치해야 함 */
  hyphen: boolean
  /** 입력 중인 마지막 낱말 → 조합 중 음절 허용 */
  open: boolean
  /** 층 별칭 비교용 (loose 문자열) */
  key: string
}

export interface Query {
  raw: string
  tokens: Token[]
  /** 모든 낱말을 이어 붙인 것 ("도 서 관" → "도서관") */
  joined: Token
}

function makeToken(text: string, open: boolean): Token | null {
  const keep = foldMapped(text, true).chars
  const loose = foldMapped(text, false).chars
  if (loose.length === 0) return null
  return { keep, loose, hyphen: keep.length !== loose.length, open, key: loose.join('') }
}

/**
 * lenient=true 면 마지막 글자를 "IME 조합 중일 수 있음"으로 보고 같은 초성+중성의 음절에도 일치시킨다.
 * 정확한 일치가 하나도 없을 때만 켠다 (그렇지 않으면 "지하" 가 "지학" 에도 걸린다).
 */
export function parseQuery(raw: string, lenient = false): Query | null {
  const parts = raw.normalize('NFC').split(/\s+/).filter(Boolean).slice(0, 5)
  const composing = lenient && !/\s$/.test(raw)
  const tokens: Token[] = []
  parts.forEach((p, i) => {
    const t = makeToken(p, composing && i === parts.length - 1)
    if (t) tokens.push(t)
  })
  if (tokens.length === 0) return null
  const joined = makeToken(parts.join(''), composing) ?? tokens[tokens.length - 1]
  return { raw, tokens, joined }
}

/** prefixOnly: 문장 앞에서 시작하는 일치(접두·완전)만 인정 — 건물+층 결합 표기("본관동2층") 용 */
function tokenScore(f: Folded, tk: Token, jamo: boolean, prefixOnly = false): number {
  const gate = (s: number) => (prefixOnly && s < 50 ? 0 : s)
  const a = gate(scoreOf(f.keep, tk.keep, tk.open, jamo))
  if (tk.hyphen) return a
  return Math.max(a, gate(scoreOf(f.loose, tk.loose, tk.open, jamo)) * 0.92)
}

// ────────────────────────────── 색인 ──────────────────────────────

interface Field {
  f: Folded
  /** 가중치 */
  w: number
  label: string
  text: string
  /** 초성 일치 허용 (소개 문구는 글자 일치만) */
  jamo: boolean
}

function field(text: string | null | undefined, w: number, label: string, jamo = true): Field | null {
  if (!text) return null
  const f = fold(text)
  return f.loose.length ? { f, w, label, text, jamo } : null
}
function compact<T>(a: Array<T | null>): T[] {
  return a.filter((x): x is T => x !== null)
}

export type SearchEntryHit = Omit<SearchHit, 'matchedOn' | 'matchedText' | 'matchedRanges' | 'nameRanges' | 'subRanges' | 'score'>

export interface SearchEntry {
  kind: HitKind
  hit: SearchEntryHit
  /** 이 항목 자체의 이름 필드 */
  own: Field[]
  /** 소속 건물 이름 필드(문맥) */
  bctx: Field[]
  /** "본관동2층" 같은 건물+층 결합 표기 */
  combo: Field[]
  /** 층 별칭(loose 문자열, 소문자) */
  floorKeys: string[]
  order: number
}

const FLOOR_ALIASES: Record<FloorId, string[]> = {
  B1: ['지하1층', '지하', 'b1', 'b1층', '지하층'],
  '1F': ['1층', '1f'],
  '2F': ['2층', '2f'],
  '3F': ['3층', '3f'],
  '4F': ['4층', '4f'],
}

function shortName(name: string): string {
  return name.replace(/동$/, '')
}

let cache: { facilities: FacilityMap; entries: SearchEntry[] } | null = null

/** 색인을 (지연) 구축. 소개 문구(facilities.json) 가 뒤늦게 로드되면 자동으로 다시 만든다 */
export function buildSearchIndex(): SearchEntry[] {
  const facilities = useContent.getState().facilities
  if (cache && cache.facilities === facilities) return cache.entries

  const entries: SearchEntry[] = []
  let order = 0

  const bFields = new Map<BuildingId, Field[]>()
  for (const b of buildings) {
    bFields.set(b.id, compact([field(b.name, 1, '건물명'), field(shortName(b.name), 1, '건물명'), field(b.en, 0.9, '영문명')]))
  }

  // 1) 건물
  for (const b of buildings) {
    const floors = allFloors.filter((f) => f.building === b.id)
    const roomCount = floors.reduce((n, f) => n + f.rooms.length, 0)
    entries.push({
      kind: 'building',
      hit: {
        key: `b:${b.id}`,
        kind: 'building',
        roomId: '',
        name: b.name,
        sub: b.en,
        buildingId: b.id,
        buildingName: b.name,
        buildingColor: b.color,
        floorId: null,
        floorLabel: '',
        cat: null,
        categoryLabel: '',
        meta: `${b.floors.map(floorLabel).join(' · ')} · 시설 ${roomCount}곳`,
        schematic: false,
      },
      own: bFields.get(b.id)!,
      bctx: [],
      combo: [],
      floorKeys: [],
      order: order++,
    })
  }

  // 2) 층
  const comboOf = (b: (typeof buildings)[number], fid: FloorId): Field[] => {
    const fl = floorLabel(fid)
    const short = shortName(b.name)
    return compact([
      field(`${b.name}${fl}`, 1, '건물·층'),
      field(`${short}${fl}`, 1, '건물·층'),
      field(`${b.name}${fid}`, 1, '건물·층'),
      field(`${short}${fid}`, 1, '건물·층'),
      field(`${b.en}${fid}`, 0.9, '건물·층'),
    ])
  }
  for (const fl of allFloors) {
    const b = buildings.find((x) => x.id === fl.building)
    if (!b) continue
    entries.push({
      kind: 'floor',
      hit: {
        key: `f:${b.id}/${fl.floor}`,
        kind: 'floor',
        roomId: '',
        name: `${b.name} ${floorLabel(fl.floor)}`,
        sub: null,
        buildingId: b.id,
        buildingName: b.name,
        buildingColor: b.color,
        floorId: fl.floor,
        floorLabel: floorLabel(fl.floor),
        cat: null,
        categoryLabel: '',
        meta: `평면도 · 시설 ${fl.rooms.length}곳`,
        schematic: fl.schematic,
      },
      own: [],
      bctx: bFields.get(b.id)!,
      combo: comboOf(b, fl.floor),
      floorKeys: FLOOR_ALIASES[fl.floor],
      order: order++,
    })
  }

  // 3) 시설
  for (const { room, floor, building } of allRooms) {
    const fac = facilities[room.id]
    const nameKey = fold(room.name).loose.join('')
    const own = compact([
      field(room.name, 1, '시설명'),
      field(room.sub, 0.85, '세부 명칭'),
      ...room.src.name2023.filter((n) => fold(n).loose.join('') !== nameKey).map((n) => field(n, 0.8, '2023 평면도 명칭')),
      field(campus.categories[room.cat], 0.45, '분류', false),
      ...(fac
        ? [
            fac.name && fold(fac.name).loose.join('') !== nameKey ? field(fac.name, 0.9, '시설명') : null,
            field(fac.summary, 0.25, '소개', false),
            field(fac.description, 0.2, '소개', false),
            ...fac.features.map((t) => field(t, 0.3, '주요 장비·특징', false)),
            ...fac.activities.map((t) => field(t, 0.3, '교육활동', false)),
          ]
        : []),
    ])
    entries.push({
      kind: 'room',
      hit: {
        key: `r:${room.id}`,
        kind: 'room',
        roomId: room.id,
        name: room.name,
        sub: room.sub,
        buildingId: building.id,
        buildingName: building.name,
        buildingColor: building.color,
        floorId: floor.floor,
        floorLabel: floorLabel(floor.floor),
        cat: room.cat,
        categoryLabel: campus.categories[room.cat],
        meta: '',
        schematic: floor.schematic,
      },
      own,
      bctx: bFields.get(building.id)!,
      combo: comboOf(building, floor.floor),
      floorKeys: FLOOR_ALIASES[floor.floor],
      order: order++,
    })
  }

  cache = { facilities, entries }
  return entries
}

// ────────────────────────────── 평가 ──────────────────────────────

interface TokenEval {
  score: number
  src: 'own' | 'b' | 'f' | 'bf'
  field: Field | null
}

function bestIn(fields: Field[], tk: Token, prefixOnly = false): { score: number; field: Field | null } {
  let score = 0
  let hit: Field | null = null
  for (const fd of fields) {
    const s = tokenScore(fd.f, tk, fd.jamo, prefixOnly) * fd.w
    if (s > score) {
      score = s
      hit = fd
    }
  }
  return { score, field: hit }
}

function evalToken(e: SearchEntry, tk: Token): TokenEval | null {
  const cands: TokenEval[] = []
  const own = bestIn(e.own, tk)
  if (own.score > 0) cands.push({ score: own.score, src: 'own', field: own.field })
  if (e.kind !== 'building') {
    const isFloor = e.kind === 'floor'
    const b = bestIn(e.bctx, tk)
    if (b.score > 0) cands.push({ score: b.score * (isFloor ? 0.7 : 0.5), src: 'b', field: null })
    if (e.floorKeys.includes(tk.key)) cands.push({ score: isFloor ? 90 : 60, src: 'f', field: null })
    const c = bestIn(e.combo, tk, true)
    if (c.score > 0) cands.push({ score: c.score * (isFloor ? 0.95 : 0.5), src: 'bf', field: null })
  }
  let best: TokenEval | null = null
  for (const c of cands) if (!best || c.score > best.score) best = c
  return best
}

interface EntryEval {
  score: number
  matched: { field: Field; score: number } | null
}

function evalTokens(e: SearchEntry, tokens: Token[]): EntryEval | null {
  let sum = 0
  let hasOwn = false
  let hasB = false
  let hasF = false
  let matched: EntryEval['matched'] = null
  for (const tk of tokens) {
    const r = evalToken(e, tk)
    if (!r) return null
    sum += r.score
    if (r.src === 'own') {
      hasOwn = true
      if (r.field && (!matched || r.score > matched.score)) matched = { field: r.field, score: r.score }
    } else if (r.src === 'b') hasB = true
    else if (r.src === 'f') hasF = true
    else hasB = hasF = true
  }
  // 시설은 자기 필드로 일치했거나, 건물+층을 모두 지정했을 때만 (건물/층 문맥만으로 시설을 쏟아 내지 않는다)
  if (e.kind === 'room' && !hasOwn && !(hasB && hasF)) return null
  return { score: sum / tokens.length, matched }
}

/** text 안에서 질의가 일치한 구간(원문 인덱스) — 하이라이트용 */
export function highlightRanges(text: string, q: Query): Range[] {
  if (!text) return []
  const keep = foldMapped(text, true)
  const loose = foldMapped(text, false)
  const out: Range[] = []
  const add = (tk: Token) => {
    const src = tk.hyphen ? keep : loose
    const qc = tk.hyphen ? tk.keep : tk.loose
    const m = find(src.chars, qc, tk.open, true)
    if (m.idx >= 0) out.push([src.spans[m.idx][0], src.spans[m.idx + qc.length - 1][1]])
  }
  for (const tk of q.tokens) add(tk)
  if (out.length === 0 && q.tokens.length > 1) add(q.joined)
  out.sort((a, b) => a[0] - b[0])
  const merged: Range[] = []
  for (const r of out) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([r[0], r[1]])
  }
  return merged
}

const KIND_RANK: Record<HitKind, number> = { building: 0, floor: 1, room: 2 }
const DEFAULT_LIMIT = 60

/** 이보다 낮은 점수(우연한 글자 걸침)는 버린다 */
const MIN_SCORE = 20

function run(q: Query): Array<{ entry: SearchEntry; ev: EntryEval }> {
  const found: Array<{ entry: SearchEntry; ev: EntryEval }> = []
  for (const entry of buildSearchIndex()) {
    const a = evalTokens(entry, q.tokens)
    const b = q.tokens.length > 1 ? evalTokens(entry, [q.joined]) : null
    const ev = a && b ? (b.score > a.score ? b : a) : (a ?? b)
    if (ev && ev.score >= MIN_SCORE) found.push({ entry, ev })
  }
  return found
}

/** 질의 → 건물별 그룹 + 전체 건수. 빈 질의는 빈 결과 */
export function searchDetailed(query: string, limit = DEFAULT_LIMIT): SearchResponse {
  let q = parseQuery(query)
  if (!q) return { groups: [], total: 0, shown: 0 }

  let found = run(q)
  if (found.length === 0) {
    // 정확한 일치가 없으면 입력(조합) 중인 마지막 글자를 너그럽게 해석해 다시 시도
    const lenient = parseQuery(query, true)
    if (lenient) {
      q = lenient
      found = run(q)
    }
  }
  found.sort(
    (x, y) =>
      y.ev.score - x.ev.score || KIND_RANK[x.entry.kind] - KIND_RANK[y.entry.kind] || x.entry.order - y.entry.order,
  )

  const groups = new Map<BuildingId, SearchGroup>()
  const top = found.slice(0, limit)
  for (const { entry, ev } of top) {
    const h = entry.hit
    const m = ev.matched && ev.matched.field.label !== '시설명' && ev.matched.field.label !== '건물명' ? ev.matched.field : null
    const hit: SearchHit = {
      ...h,
      matchedOn: m?.label ?? '',
      matchedText: m?.text ?? '',
      matchedRanges: m ? highlightRanges(m.text, q) : [],
      nameRanges: highlightRanges(h.name, q),
      subRanges: h.sub ? highlightRanges(h.sub, q) : [],
      score: ev.score,
    }
    let g = groups.get(h.buildingId)
    if (!g) {
      g = { buildingId: h.buildingId, buildingName: h.buildingName, color: h.buildingColor, hits: [] }
      groups.set(h.buildingId, g)
    }
    g.hits.push(hit)
  }
  return { groups: Array.from(groups.values()), total: found.length, shown: top.length }
}

/** 질의 → 건물별 그룹 (점수 내림차순). 빈 질의는 빈 배열 */
export function search(query: string, limit = DEFAULT_LIMIT): SearchGroup[] {
  return searchDetailed(query, limit).groups
}

/** 질의가 비어 있을 때 보여 주는 "건물 바로가기" 목록 */
export function browseHits(): SearchHit[] {
  return buildSearchIndex()
    .filter((e) => e.kind === 'building')
    .map((e) => ({ ...e.hit, matchedOn: '', matchedText: '', matchedRanges: [], nameRanges: [], subRanges: [], score: 0 }))
}

/** 분류(카테고리) 목록 — 빈 질의 상태의 빠른 검색 칩 */
export function categoryChips(): Array<{ id: CategoryId; label: string }> {
  return (Object.keys(campus.categories) as CategoryId[]).map((id) => ({ id, label: campus.categories[id] }))
}

/** 텍스트를 [일반, 강조, 일반 …] 조각으로 분해 */
export function splitByRanges(text: string, ranges: Range[]): Array<{ text: string; hit: boolean }> {
  if (!ranges.length) return [{ text, hit: false }]
  const out: Array<{ text: string; hit: boolean }> = []
  let at = 0
  for (const [s, e] of ranges) {
    if (s > at) out.push({ text: text.slice(at, s), hit: false })
    out.push({ text: text.slice(s, e), hit: true })
    at = e
  }
  if (at < text.length) out.push({ text: text.slice(at), hit: false })
  return out
}
