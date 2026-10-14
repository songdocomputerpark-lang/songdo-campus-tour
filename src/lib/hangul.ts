// 한글 초성 추출 + 검색 매처. (ㄷㅅㄱ → 도서관, 공백 무시, 대소문자 무시)

const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'] as const
const HANGUL_BASE = 0xac00
const HANGUL_END = 0xd7a3

/** 호환 자모 초성 자음(ㄱ~ㅎ) 인가 */
export function isChoseongJamo(ch: string): boolean {
  return (CHO as readonly string[]).includes(ch)
}

/** 완성형 한글이면 초성 자모, 아니면 null */
export function choseongOf(ch: string): string | null {
  const code = ch.charCodeAt(0)
  if (code < HANGUL_BASE || code > HANGUL_END) return null
  return CHO[Math.floor((code - HANGUL_BASE) / 588)]
}

/** 문자열의 초성만 추출 (한글이 아닌 글자는 그대로, 공백은 제거) — "도서관" → "ㄷㅅㄱ" */
export function extractChoseong(s: string): string {
  let out = ''
  for (const ch of s) {
    if (/\s/.test(ch)) continue
    out += choseongOf(ch) ?? ch.toLowerCase()
  }
  return out
}

/** 검색용 정규화: 소문자, 공백/구두점 제거 (한글·영문·숫자·자모만 유지) */
export function normalizeQuery(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(/[\s·・\-_.,()[\]{}'"`~!?:;/\\]+/g, '')
}

/** 질의가 초성 자음으로만 이루어졌는가 (예: "ㄷㅅㄱ") */
export function isChoseongQuery(q: string): boolean {
  const n = normalizeQuery(q)
  return n.length > 0 && Array.from(n).every(isChoseongJamo)
}

function charMatches(q: string, t: string): boolean {
  if (q === t) return true
  if (isChoseongJamo(q)) return choseongOf(t) === q
  return false
}

/**
 * 정규화된 target 안에서 정규화된 query 가 (초성 혼합 허용) 부분 일치하는 시작 위치를 반환. 없으면 -1.
 * "ㄷㅅㄱ" ↔ "도서관", "도ㅅ관" ↔ "도서관" 모두 허용.
 */
export function indexOfHangul(targetNorm: string, queryNorm: string): number {
  if (!queryNorm) return 0
  const t = Array.from(targetNorm)
  const q = Array.from(queryNorm)
  for (let i = 0; i + q.length <= t.length; i++) {
    let ok = true
    for (let j = 0; j < q.length; j++) {
      if (!charMatches(q[j], t[i + j])) {
        ok = false
        break
      }
    }
    if (ok) return i
  }
  return -1
}

/** target 이 query 에 매치되는가 (공백 무시, 초성 허용) */
export function hangulMatch(target: string, query: string): boolean {
  const qn = normalizeQuery(query)
  if (!qn) return false
  return indexOfHangul(normalizeQuery(target), qn) >= 0
}

/**
 * 점수 (높을수록 좋음, 0=불일치): 완전일치 100 > 접두 80 > 부분 60 > 초성 부분 40.
 * 검색 인덱스에서 필드 가중치와 곱해 사용.
 */
export function hangulScore(target: string, query: string): number {
  const qn = normalizeQuery(query)
  if (!qn) return 0
  const tn = normalizeQuery(target)
  if (tn === qn) return 100
  const idx = indexOfHangul(tn, qn)
  if (idx < 0) return 0
  const exactText = tn.includes(qn)
  if (idx === 0) return exactText ? 80 : 50
  return exactText ? 60 : 40
}
