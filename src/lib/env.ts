// 환경/접근성 헬퍼
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/** 실제 CSS px 단위의 rem 크기(대형 디스플레이에서 html font-size 가 커짐) */
export function remPx(): number {
  try {
    return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  } catch {
    return 16
  }
}

/** 데스크톱 레이아웃 기준 (SPEC §5) */
export const DESKTOP_QUERY = '(min-width: 1024px)'
/** 폰 폭 — 이보다 좁으면 지도 UI(라벨·여백)를 촘촘하게 쓴다 */
export const NARROW_QUERY = '(max-width: 639px)'

function matches(query: string, fallback: boolean): boolean {
  try {
    return window.matchMedia(query).matches
  } catch {
    return fallback
  }
}
/** 현재 뷰포트가 데스크톱 레이아웃인가 (window 가 없는 환경에서는 true) */
export function isDesktopViewport(): boolean {
  return matches(DESKTOP_QUERY, true)
}
/** 현재 뷰포트가 폰 폭(< 640px)인가 */
export function isNarrowViewport(): boolean {
  return matches(NARROW_QUERY, false)
}

/** 지도 위 화면고정 UI 배율(--ui-scale, 대형 디스플레이에서 증가). 뷰포트 폭이 바뀔 때만 다시 읽는다 */
let uiScaleCache: { w: number; v: number } | null = null
export function uiScale(): number {
  try {
    const w = window.innerWidth
    if (!uiScaleCache || uiScaleCache.w !== w) {
      const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'))
      uiScaleCache = { w, v: v > 0 ? v : 1 }
    }
    return uiScaleCache.v
  } catch {
    return 1
  }
}
