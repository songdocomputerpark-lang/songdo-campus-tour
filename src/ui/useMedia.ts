// 반응형 훅. 데스크톱 = 너비 ≥ 1024px (SPEC §5), 폰 = 너비 < 640px
import { useSyncExternalStore } from 'react'
import { DESKTOP_QUERY, NARROW_QUERY } from '../lib/env'

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

export { DESKTOP_QUERY }
export function useIsDesktop(): boolean {
  return useMedia(DESKTOP_QUERY)
}
/** 폰 폭(< 640px) */
export function useIsNarrow(): boolean {
  return useMedia(NARROW_QUERY)
}
export function useCoarsePointer(): boolean {
  return useMedia('(pointer: coarse)')
}
