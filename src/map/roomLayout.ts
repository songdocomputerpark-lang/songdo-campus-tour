// 방 라벨 레이아웃: 공간(label 점·labelR·bbox)에 맞춰 줄바꿈과 글자 크기(월드 단위)를 미리 계산한다 (줌과 무관, 1회).
// 줌에 따른 표시/숨김·상한은 FloorPlan 에서 fontSize * k 로 판단.
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

/** 단어(공백·여는 괄호 앞) 단위 토큰 */
function tokens(name: string): string[] {
  const out: string[] = []
  let cur = ''
  for (const ch of name) {
    if (ch === ' ') {
      if (cur) out.push(cur)
      cur = ''
    } else if (ch === '(' && cur) {
      out.push(cur)
      cur = ch
    } else cur += ch
  }
  if (cur) out.push(cur)
  return out
}

/** name 을 L 줄로 가장 폭이 균형 잡히게 분할 */
export function splitLines(name: string, L: number): string[] {
  if (L <= 1) return [name]
  const toks = tokens(name)
  if (toks.length >= L) {
    // 토큰 경계 DP: 최대 줄 폭 최소화
    const n = toks.length
    const w = toks.map(textEm)
    const pre = [0]
    for (let i = 0; i < n; i++) pre.push(pre[i] + w[i] + (i > 0 ? 0.28 : 0))
    const cost = (i: number, j: number) => pre[j] - pre[i] - (i > 0 ? 0.28 : 0)
    const memo = new Map<string, { c: number; cuts: number[] }>()
    const solve = (i: number, l: number): { c: number; cuts: number[] } => {
      const key = `${i}/${l}`
      const hit = memo.get(key)
      if (hit) return hit
      let best = { c: Infinity, cuts: [] as number[] }
      if (l === 1) best = { c: cost(i, n), cuts: [] }
      else {
        for (let j = i + 1; j <= n - (l - 1); j++) {
          const rest = solve(j, l - 1)
          const c = Math.max(cost(i, j), rest.c)
          if (c < best.c) best = { c, cuts: [j, ...rest.cuts] }
        }
      }
      memo.set(key, best)
      return best
    }
    const { cuts } = solve(0, L)
    const lines: string[] = []
    let prev = 0
    for (const c of [...cuts, n]) {
      lines.push(toks.slice(prev, c).join(' '))
      prev = c
    }
    return lines
  }
  // 토큰이 부족하면 글자 단위로 균등 분할
  const chars = Array.from(name)
  const lines: string[] = []
  const per = Math.ceil(chars.length / L)
  for (let i = 0; i < chars.length; i += per) lines.push(chars.slice(i, i + per).join(''))
  return lines
}

const MAX_FS = 30
const LINE_H = 1.2

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

  let best: { lines: string[]; fs: number } | null = null
  for (let L = 1; L <= 4; L++) {
    const lines = splitLines(room.name, L)
    if (lines.length < L) break
    const widest = Math.max(...lines.map(textEm), 0.5)
    const fs = Math.min(boxW / widest, boxH / (L * LINE_H), MAX_FS)
    // 줄 수가 늘어 글자가 6% 이상 커질 때만 채택
    if (!best || fs > best.fs * 1.06) best = { lines, fs }
  }
  return { lines: best!.lines, fs: best!.fs, x: lx, y: ly, boxW, boxH }
}

export const LABEL_LINE_HEIGHT = LINE_H
