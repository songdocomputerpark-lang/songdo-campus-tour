// 첫 사용 안내 칩 (캠퍼스 배치도 화면): "건물을 누르면 층별 시설을 둘러볼 수 있어요"
//  · 사용자가 처음 건물을 고를 때까지(또는 칩의 닫기를 누를 때까지) 보이고, 그 뒤로는 세션 동안 다시 나타나지 않는다(sessionStorage).
//  · 투어 중 · 인트로가 떠 있는 동안에는 숨긴다.
//  · 위치: 모바일 = 상단 바 바로 아래 중앙 / 데스크톱 = 하단 툴바 위 중앙.
//  · 모션: 서서히 나타나고(fade-up) 아이콘이 부드럽게 눌렸다 떼어진다. '동작 줄이기' 설정이면 정지 상태로 보여 준다.
import { MousePointerClick, Pointer, X } from 'lucide-react'
import { useEffect, useSyncExternalStore } from 'react'
import { useAppStore } from '../store/useAppStore'

const KEY = 'songdo.hint.building.seen'

function readSeen(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

let seen = readSeen()
const listeners = new Set<() => void>()

function markSeen(): void {
  if (seen) return
  seen = true
  try {
    sessionStorage.setItem(KEY, '1')
  } catch {
    /* 저장소를 못 쓰는 환경 — 이 페이지가 열려 있는 동안만 기억한다 */
  }
  listeners.forEach((l) => l())
}

function useHintSeen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => seen,
    () => true,
  )
}

export function FirstUseHint({ isDesktop }: { isDesktop: boolean }) {
  const hintSeen = useHintSeen()
  const view = useAppStore((s) => s.view)
  const buildingId = useAppStore((s) => s.buildingId)
  const tourActive = useAppStore((s) => s.tour.active)
  const eventActive = useAppStore((s) => s.event.active)
  const introOpen = useAppStore((s) => s.ui.intro)

  // 건물을 처음 고르면(딥링크·투어로 건물이 열린 경우 포함) 안내는 더 이상 필요 없다
  useEffect(() => {
    if (buildingId) markSeen()
  }, [buildingId])

  const show = !hintSeen && view === 'campus' && !buildingId && !tourActive && !eventActive && !introOpen
  if (!show) return null

  return (
    <div
      className="pointer-events-none absolute left-1/2 z-20 flex -translate-x-1/2 justify-center"
      style={isDesktop ? { bottom: '6.5rem', width: 'min(34rem, calc(100vw - 8rem))' } : { top: 'calc(var(--safe-top) + 3.75rem)', width: 'min(24rem, calc(100vw - 1.5rem))' }}
    >
      <aside
        aria-label="사용 안내"
        className="glass-surface pointer-events-auto flex max-w-full animate-fade-up items-center gap-2.5 rounded-full py-1.5 pl-2 pr-1.5 shadow-float"
        style={{ animationDelay: '700ms' }}
      >
        <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold-soft text-gold-deep" aria-hidden="true">
          <span className="absolute inset-0 rounded-full bg-gold/35 motion-reduce:hidden motion-safe:animate-hint-ring" />
          {isDesktop ? <MousePointerClick size={17} strokeWidth={1.9} className="relative" /> : <Pointer size={17} strokeWidth={1.9} className="relative motion-safe:animate-hint-tap" />}
        </span>
        <p className="min-w-0 flex-1 break-keep text-[0.8125rem] font-semibold leading-snug text-ink [text-wrap:balance]">건물을 누르면 층별 시설을 둘러볼 수 있어요</p>
        <button
          type="button"
          onClick={markSeen}
          aria-label="안내 닫기"
          title="닫기"
          className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-mute transition-colors duration-180 before:absolute before:-inset-1.5 before:content-[''] hover:bg-paper-2 hover:text-ink"
        >
          <X size={16} strokeWidth={1.9} />
        </button>
      </aside>
    </div>
  )
}
