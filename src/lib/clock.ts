// 시각 헬퍼 (순수 함수 — vitest 대상). 행사 식순의 "HH:MM" 해석.

/** "HH:MM"(24시간제) → 자정부터의 분. 형식이 틀리면 null ("24:00"·"9:60" 도 null) */
export function parseHm(s: unknown): number | null {
  if (typeof s !== 'string') return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  return h <= 23 && min <= 59 ? h * 60 + min : null
}

/** 자정부터의 분 → "HH:MM" */
export function formatHm(minutes: number): string {
  const t = Math.max(0, Math.floor(minutes))
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
