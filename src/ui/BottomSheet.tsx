// 모바일(<1024px) 바텀 시트. 스냅: peek · half · full. 핸들(또는 data-sheet-drag 영역)을 끌어 이동,
// 탭하면 peek → half → full 순환, peek 아래로 충분히 내리면 onClose.
//  - 시트는 툴바 바로 위(bottomReserve)에 붙고, 상단 바(topReserve) 아래까지 확장된다.
//  - 콘텐츠 스크롤은 half·full 에서만 가능(peek 에서는 머리글만 보임). peek 높이는 기본 SHEET_PEEK, 투어는 머리글에 맞춘 값(peek prop).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { viewportHeight } from '../lib/env'
import type { PanelSnap } from '../store/useAppStore'

export const SHEET_PEEK = 164
/** 핸들 영역 높이 — peek 높이 = 핸들 + 머리글 */
export const SHEET_HANDLE_H = 24
const HANDLE_H = SHEET_HANDLE_H

export interface SheetMetrics {
  peek: number
  half: number
  full: number
}
/**
 * 가용 높이(뷰포트 − 상단바 − 툴바)로부터 스냅별 시트 높이(px).
 * peekPx: 내용에 맞춘 peek 높이(예: 투어 머리글만 보이는 콤팩트 시트). 생략하면 SHEET_PEEK.
 */
export function sheetMetrics(viewportH: number, topReserve: number, bottomReserve: number, peekPx: number = SHEET_PEEK): SheetMetrics {
  const avail = Math.max(240, viewportH - topReserve - bottomReserve)
  const full = avail - 6
  const peek = Math.min(Math.round(peekPx), Math.round(full * 0.5))
  const half = Math.max(peek + 90, Math.round(avail * 0.52))
  return { peek, half: Math.min(half, full - 40), full }
}

interface Props {
  open: boolean
  snap: PanelSnap
  onSnapChange: (s: PanelSnap) => void
  onClose: () => void
  topReserve: number
  bottomReserve: number
  /** peek 스냅의 높이(px) — 생략하면 SHEET_PEEK. Shell 이 insets 계산에 쓰는 값과 같아야 한다 */
  peek?: number
  label: string
  children: ReactNode
}

export function BottomSheet({ open, snap, onSnapChange, onClose, topReserve, bottomReserve, peek, label, children }: Props) {
  const [vh, setVh] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight))
  useEffect(() => {
    const on = () => setVh(viewportHeight())
    on()
    window.addEventListener('resize', on)
    window.visualViewport?.addEventListener('resize', on)
    return () => {
      window.removeEventListener('resize', on)
      window.visualViewport?.removeEventListener('resize', on)
    }
  }, [])

  const m = sheetMetrics(vh, topReserve, bottomReserve, peek)
  const translateOf = (s: PanelSnap) => m.full - m[s]
  const rest = open ? translateOf(snap) : m.full + 28

  const [dragY, setDragY] = useState<number | null>(null)
  const drag = useRef<{ id: number; startY: number; base: number; moved: boolean; handle: boolean; lastY: number; lastT: number; vel: number } | null>(null)
  const rootRef = useRef<HTMLElement>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    const t = e.target as Element
    if (!t.closest('[data-sheet-drag]')) return
    if (t.closest('button, a, input, select, textarea') && !t.closest('[data-sheet-handle]')) return
    // setPointerCapture 이후 pointerup 의 target 은 섹션이 되므로, 핸들 여부는 pointerdown 시점에 기록한다
    drag.current = { id: e.pointerId, startY: e.clientY, base: rest, moved: false, handle: !!t.closest('[data-sheet-handle]'), lastY: e.clientY, lastT: performance.now(), vel: 0 }
    rootRef.current?.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dy = e.clientY - d.startY
    if (!d.moved && Math.abs(dy) < 5) return
    d.moved = true
    const now = performance.now()
    d.vel = (e.clientY - d.lastY) / Math.max(1, now - d.lastT)
    d.lastY = e.clientY
    d.lastT = now
    let y = d.base + dy
    if (y < 0) y = y * 0.25 // 위쪽 고무줄
    setDragY(Math.min(y, m.full + 40))
  }
  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    try {
      rootRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    if (!d.moved) {
      setDragY(null)
      if (d.handle) onSnapChange(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek')
      return
    }
    const y = dragY ?? d.base
    const projected = y + d.vel * 220
    setDragY(null)
    if (projected > translateOf('peek') + 70) {
      onClose()
      return
    }
    const cands: PanelSnap[] = ['full', 'half', 'peek']
    let best: PanelSnap = 'half'
    let bd = Infinity
    for (const c of cands) {
      const dd = Math.abs(projected - translateOf(c))
      if (dd < bd) {
        bd = dd
        best = c
      }
    }
    onSnapChange(best)
  }

  const inert = open ? {} : ({ inert: '' } as Record<string, string>)
  const dragging = dragY !== null
  return (
    <section
      ref={rootRef}
      aria-label={label}
      aria-hidden={open ? undefined : true}
      {...inert}
      className="glass-surface fixed inset-x-0 z-30 overflow-hidden rounded-t-[1.5rem] border-b-0 shadow-[0_-10px_36px_-10px_rgb(17_24_39/0.22)]"
      style={{
        bottom: bottomReserve,
        height: m.full,
        transform: `translateY(${dragY ?? rest}px)`,
        transition: dragging ? 'none' : `transform 380ms var(--ease-out), visibility 0s linear ${open ? '0s' : '380ms'}`,
        visibility: open ? 'visible' : 'hidden',
        willChange: 'transform',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div data-sheet-drag data-sheet-handle className="grid place-items-center" style={{ height: HANDLE_H }}>
        <button
          type="button"
          aria-label={`패널 크기 조절 (현재 ${snap === 'peek' ? '작게' : snap === 'half' ? '중간' : '크게'})`}
          className="grid h-6 w-24 place-items-center rounded-full"
          tabIndex={open ? 0 : -1}
          // 키보드(Enter/Space)로 누른 경우만(detail 0). 포인터 탭은 endDrag 에서 처리한다
          onClick={(e) => {
            if (e.detail === 0) onSnapChange(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek')
          }}
        >
          <span className="block h-1 w-10 rounded-full bg-ink/25" />
        </button>
      </div>
      <div
        className="sheet-scroll"
        style={{
          height: m.full - HANDLE_H,
          overflowY: snap === 'peek' && !dragging ? 'hidden' : 'auto',
          overscrollBehavior: 'contain',
          paddingBottom: m.full - m[snap] + 16,
        }}
      >
        {children}
      </div>
    </section>
  )
}
