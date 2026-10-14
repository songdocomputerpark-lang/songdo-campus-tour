// 데스크톱(≥1024px) 우측 슬라이드 패널 — 폭 420px(= var(--panel-w), 대형 디스플레이에서 rem 으로 비례 확대)
import type { ReactNode } from 'react'

export function SidePanel({ open, label, children }: { open: boolean; label: string; children: ReactNode }) {
  const inert = open ? {} : ({ inert: '' } as Record<string, string>)
  return (
    <aside
      aria-label={label}
      aria-hidden={open ? undefined : true}
      {...inert}
      className="glass-surface fixed bottom-6 right-6 top-6 z-30 flex w-[var(--panel-w)] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-panel shadow-panel"
      style={{
        transform: open ? 'none' : 'translateX(calc(100% + 2rem))',
        opacity: open ? 1 : 0,
        visibility: open ? 'visible' : 'hidden',
        transition: `transform 420ms var(--ease-out), opacity 280ms ease, visibility 0s linear ${open ? '0s' : '420ms'}`,
      }}
    >
      <div className="scroll-y min-h-0 flex-1">{children}</div>
    </aside>
  )
}
