// 방 라벨 레이아웃: 공간(label 점·labelR·bbox)에 맞춰 줄바꿈과 글자 크기(월드 단위)를 미리 계산한다 (줌과 무관, 1회).
// 줌에 따른 표시/숨김·상한은 FloorPlan 에서 fontSize * k 로 판단.
//
// 줄바꿈 규칙: 단어 중간에서 끊지 않는다. 줄을 바꿀 수 있는 곳은
//  · 띄어쓰기 · 여는 괄호 앞 · 가운뎃점(·) 뒤
//  · 띄어쓰기 없는 합성어는 LABEL_BREAKS 에 적은 뜻 단위 경계 (예: 생활│안전부, 창의국제│홍보부)
// 뿐이다. 한 글자만 따로 떨어지는 줄바꿈(교장│실)은 만들지 않는다 — 그런 이름은 한 줄로 두고 글자를 줄인다.
// 예외: 아주 좁고 긴 방의 짧은 한글 이름(2~4자)은 한 글자씩 세로로 쓴다(세로쓰기, 예: 인쇄실).
import type { Room } from '../data/types'
import { boundsOf, isRectLike } from '../lib/geometry'

export interface LabelLayout {
  lines: string[]
  /** 월드 단위 글자 크기(박스에 꼭 맞는 최대값) */
  fs: number
  x: number
  y: number
  /** 부제(sub)를 넣을 수 있는 폭 (월드) */
  boxW: number
  boxH: number
}

/**
 * 띄어쓰기 없는 합성어의 줄바꿈 단위 (이 경계에서만 줄을 바꾼다). 이어 붙이면 이름과 정확히 같아야 한다.
 * 한 글자만 떨어지는 경계(교장│실, 이사장│실)는 넣지 않는다. 방 이름(src/data/floors.json)을 바꾸면 여기 키도 함께 고칠 것.
 */
export const LABEL_BREAKS: Readonly<Record<string, readonly string[]>> = {
  교육과정지원부: ['교육', '과정', '지원부'],
  진로진학상담부: ['진로', '진학', '상담부'],
  사회중점준비실: ['사회', '중점', '준비실'],
  창의국제홍보부: ['창의국제', '홍보부'], // 학교 요청으로 두 줄 (2026-10-28)
  물리학강의실: ['물리학', '강의실'],
  스마트공작실: ['스마트', '공작실'],
  과학수리부: ['과학', '수리부'],
  교육정보부: ['교육', '정보부'],
  미술관리실: ['미술', '관리실'],
  생명과학실: ['생명', '과학실'],
  생활안전부: ['생활', '안전부'],
  소모품창고: ['소모품', '창고'],
  시설관리팀: ['시설', '관리팀'],
  인문사회부: ['인문', '사회부'],
  지구과학실: ['지구', '과학실'],
  진로활동실: ['진로', '활동실'],
  체력단련실: ['체력', '단련실'],
  체육보건부: ['체육', '보건부'],
  화학강의실: ['화학', '강의실'],
  세제창고: ['세제', '창고'],
  식품창고: ['식품', '창고'],
  학생식당: ['학생', '식당'],
}

/** 글자 폭(em) 근사: 한글/한자 1.0, 영문대문자 0.66, 소문자·숫자 0.56, 기호 0.4, 공백 0.28 */
export function textEm(s: string): number {
  let w = 0
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    if (c >= 0x1100 && c <= 0xd7ff) w += 1
    else if (c >= 0x3000 && c <= 0x9fff) w += 1
    else if (ch === ' ') w += 0.28
    else if (/[A-Z]/.test(ch)) w += 0.66
    else if (/[a-z0-9]/.test(ch)) w += 0.56
    else w += 0.42
  }
  return w
}

const SPACE_EM = 0.28

/**
 * 줄바꿈 단위. glue = 앞 단위와 같은 줄이면 띄어쓰기 없이 붙는다(괄호 앞·가운뎃점 뒤·합성어 안).
 * hold = 이 단위 앞에서는 줄을 바꾸지 않는다 — 한 글자 단위('학습실 Ⅰ' 의 'Ⅰ')는 앞뒤 어느 쪽으로도 떼지 않아
 * 한 글자만 떨어진 줄을 만들지 않는다. 괄호 속 한 글자('휴게실(여)' 의 '(여)')와, '화장실(여)·샤워실' 의 '(여)·' 처럼
 * 괄호 뒤에 가운뎃점이 이어지는 단위도 괄호가 앞말과 갈라지지 않게 붙여 둔다.
 */
interface Tok {
  t: string
  glue: boolean
  hold?: boolean
}

function expand(word: string, glue: boolean): Tok[] {
  const parts = LABEL_BREAKS[word]
  if (!parts || parts.join('') !== word) return [{ t: word, glue }]
  return parts.map((t, i) => ({ t, glue: i === 0 ? glue : true }))
}

/** 줄을 바꿀 수 있는 단위로 나눈다: 띄어쓰기 · 여는 괄호 앞 · 가운뎃점 뒤 · LABEL_BREAKS 의 뜻 단위 */
function tokens(name: string): Tok[] {
  const out: Tok[] = []
  let cur = ''
  let glue = false // 지금 모으는 단위(cur)가 앞 단위에 붙는가
  const flush = (nextGlue: boolean) => {
    if (cur) out.push(...expand(cur, glue))
    cur = ''
    glue = nextGlue
  }
  for (const ch of name) {
    if (ch === ' ') flush(false)
    else if (ch === '(' && cur) {
      flush(true)
      cur = ch
    } else if (ch === '·') {
      cur += ch
      flush(true)
    } else cur += ch
  }
  flush(false)
  out.forEach((k, i) => {
    const single = Array.from(k.t).length === 1
    if (single || /^\(.\)$/u.test(k.t) || (k.glue && k.t.startsWith('(') && k.t.endsWith('·'))) k.hold = true
    if (single && out[i + 1]) out[i + 1].hold = true
  })
  return out
}

function joinToks(toks: Tok[]): string {
  return toks.map((k, i) => (i > 0 && !k.glue ? ' ' : '') + k.t).join('')
}

/**
 * name 을 L 줄로 가장 폭이 균형 잡히게 나눈다(줄을 바꿀 수 있는 곳에서만).
 * 그런 곳이 L-1 개보다 적으면 L 줄을 만들 수 없으므로 더 적은 줄을 돌려준다(호출 쪽에서 줄 수로 판단).
 */
export function splitLines(name: string, L: number): string[] {
  if (L <= 1) return [name]
  const toks = tokens(name)
  const n = toks.length
  if (n < L) return toks.length > 1 ? toks.map((k) => k.t) : [name]
  // 경계 DP: 가장 넓은 줄의 폭을 최소화
  const w = toks.map((k) => textEm(k.t))
  const pre = [0]
  for (let i = 0; i < n; i++) pre.push(pre[i] + w[i] + (i > 0 && !toks[i].glue ? SPACE_EM : 0))
  const cost = (i: number, j: number) => pre[j] - pre[i] - (i > 0 && !toks[i].glue ? SPACE_EM : 0)
  const memo = new Map<string, { c: number; cuts: number[] }>()
  const solve = (i: number, l: number): { c: number; cuts: number[] } => {
    const key = `${i}/${l}`
    const hit = memo.get(key)
    if (hit) return hit
    let best = { c: Infinity, cuts: [] as number[] }
    if (l === 1) best = { c: cost(i, n), cuts: [] }
    else {
      for (let j = i + 1; j <= n - (l - 1); j++) {
        if (toks[j].hold) continue
        const rest = solve(j, l - 1)
        const c = Math.max(cost(i, j), rest.c)
        if (c < best.c) best = { c, cuts: [j, ...rest.cuts] }
      }
    }
    memo.set(key, best)
    return best
  }
  const { c: widest, cuts } = solve(0, L)
  if (!Number.isFinite(widest)) return [name] // 바꿀 수 있는 곳이 모자라 L 줄을 만들 수 없음
  const lines: string[] = []
  let prev = 0
  for (const c of [...cuts, n]) {
    lines.push(joinToks(toks.slice(prev, c)))
    prev = c
  }
  return lines
}

const MAX_FS = 30
const LINE_H = 1.2

const isHangul = (ch: string) => {
  const c = ch.codePointAt(0) ?? 0
  return c >= 0xac00 && c <= 0xd7a3
}

export function layoutLabel(room: Room): LabelLayout {
  const b = boundsOf(room.poly)
  const [lx, ly] = room.label
  let halfW: number
  let halfH: number
  if (isRectLike(room.poly)) {
    halfW = Math.max(4, Math.min(lx - b.x, b.x + b.w - lx))
    halfH = Math.max(4, Math.min(ly - b.y, b.y + b.h - ly))
  } else {
    halfW = halfH = Math.max(4, room.labelR * 0.92)
  }
  const boxW = halfW * 2 * 0.9
  const boxH = halfH * 2 * 0.8
  // 좁고 긴 방(세로가 가로의 1.5배 이상)은 짧은 줄을 쌓아 쓰므로 가로 여백을 조금 덜 둔다
  const tall = boxH >= boxW * 1.5
  const fitW = tall ? halfW * 2 * 0.95 : boxW
  // 줄 끝 가운뎃점(샤워실·)은 폭에 넣지 않는다(문장 부호 걸치기)
  const lineEm = (s: string) => textEm(s.endsWith('·') ? s.slice(0, -1) : s)

  let best: { lines: string[]; fs: number } | null = null
  for (let L = 1; L <= 4; L++) {
    const lines = splitLines(room.name, L)
    if (lines.length < L) break
    const widest = Math.max(...lines.map(lineEm), 0.5)
    const fs = Math.min(fitW / widest, boxH / (L * LINE_H), MAX_FS)
    // 줄 수가 늘어 글자가 6% 이상 커질 때만 채택
    if (!best || fs > best.fs * 1.06) best = { lines, fs }
  }
  // 세로쓰기: 아주 좁고 긴 방의 짧은 한글 이름은 한 글자씩 — 가로로 한 줄일 때보다 글자가 1.5배 이상 커질 때만
  const chars = Array.from(room.name)
  if (chars.length >= 2 && chars.length <= 4 && chars.every(isHangul) && tall) {
    const fs = Math.min(boxW, boxH / (chars.length * LINE_H), MAX_FS)
    if (fs >= best!.fs * 1.5) best = { lines: chars, fs }
  }
  return { lines: best!.lines, fs: best!.fs, x: lx, y: ly, boxW, boxH }
}

export const LABEL_LINE_HEIGHT = LINE_H
