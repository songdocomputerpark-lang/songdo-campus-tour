/**
 * features/detail/Lightbox.tsx — 전체화면 사진 보기 (SPEC §4.4, §1)
 *
 *  · 키보드: ← → 이동 · Esc 닫기 · + − 0 확대/축소/원래대로 · Tab 은 대화상자 안에서만 순환(포커스 트랩)
 *  · 터치/마우스: 두 손가락 핀치 줌 · 더블탭(더블클릭) 확대/복귀 · 확대 상태에서 드래그 이동 · 휠/트랙패드 줌
 *    · 원래 크기에서는 좌우 스와이프로 사진 이동, 위아래로 끌어 닫기
 *  · 번호(n/N)·캡션·썸네일 줄, 확대 버튼(데스크톱)
 *  · role="dialog" aria-modal, 열릴 때 #root 를 inert 로 만들고 body 스크롤 고정, 닫으면 이전 포커스 복원
 *  · document.body 로 포털 — 사이드 패널/시트의 transform·overflow 에 갇히지 않는다.
 *
 * 이 모듈은 코드 분할 대상이므로 **default export** — 호출 측은 `lazy(() => import('./Lightbox'))` + <Suspense> (PhotoSlot 참고).
 */
import { ChevronLeft, ChevronRight, ImageOff, Minus, Plus, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PhotoItem } from '../../data/types'
import { assetUrl } from '../../lib/content'
import { prefersReducedMotion } from '../../lib/env'
import { clamp } from '../../lib/geometry'

export interface LightboxProps {
  photos: PhotoItem[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
  alt: string
}

interface View {
  s: number
  x: number
  y: number
}
const HOME: View = { s: 1, x: 0, y: 0 }
const MAX_SCALE = 6
const DOUBLE_TAP_SCALE = 2.6
const MAX_THUMBS = 24

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; x0: number; y0: number; moved: boolean }
  | { kind: 'swipe'; sx: number; sy: number; mode: 'undecided' | 'h' | 'v'; lastX: number; lastY: number; lastT: number; vx: number; vy: number }
  | { kind: 'pinch'; d0: number; s0: number; cx: number; cy: number }

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Lightbox({ photos, index, onIndexChange, onClose, alt }: LightboxProps) {
  const n = photos.length
  const i = clamp(index, 0, Math.max(0, n - 1))
  const photo = photos[i]

  const [view, setView] = useState<View>(HOME)
  const [smooth, setSmooth] = useState(false)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [stage, setStage] = useState({ w: 0, h: 0 })
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [drag, setDrag] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const thumbsRef = useRef<HTMLDivElement>(null)
  const ptrs = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<Gesture | null>(null)
  const lastTap = useRef({ t: 0, x: 0, y: 0 })
  const dir = useRef(0)
  const reduced = useMemo(() => prefersReducedMotion(), [])

  // 이미지가 stage 안에 들어가는 크기 (원본의 2배까지만 확대해 맞춤)
  const fit = useMemo(() => {
    if (!natural || stage.w <= 0 || stage.h <= 0) return null
    const k = Math.min(stage.w / natural.w, stage.h / natural.h, 2)
    return { w: natural.w * k, h: natural.h * k }
  }, [natural, stage])

  const live = useRef({ view, fit, stage, n, i })
  live.current = { view, fit, stage, n, i }

  const clampView = useCallback((v: View): View => {
    const { fit: f, stage: st } = live.current
    if (!f) return { s: v.s, x: 0, y: 0 }
    const mx = Math.max(0, (f.w * v.s - st.w) / 2)
    const my = Math.max(0, (f.h * v.s - st.h) / 2)
    return { s: v.s, x: clamp(v.x, -mx, mx), y: clamp(v.y, -my, my) }
  }, [])

  const zoomAt = useCallback(
    (cur: View, nextS: number, px: number, py: number): View => {
      const s = clamp(nextS, 1, MAX_SCALE)
      if (s <= 1.001) return HOME
      const k = s / cur.s
      return clampView({ s, x: px - (px - cur.x) * k, y: py - (py - cur.y) * k })
    },
    [clampView],
  )

  const applySmooth = useCallback((v: View) => {
    setSmooth(true)
    setView(v)
  }, [])

  const go = useCallback(
    (delta: number) => {
      const { n: total, i: cur } = live.current
      if (total < 2) return
      dir.current = delta
      onIndexChange((((cur + delta) % total) + total) % total)
    },
    [onIndexChange],
  )

  // 모달 effect 는 마운트 때 한 번만 실행되어야 하므로(포커스 복원·inert), 콜백은 ref 로 최신값을 읽는다.
  const cb = useRef({ onClose, go, applySmooth, zoomAt })
  cb.current = { onClose, go, applySmooth, zoomAt }

  // 사진이 바뀌면 보기 상태 초기화 + 진입 모션
  useLayoutEffect(() => {
    setView(HOME)
    setSmooth(false)
    setNatural(null)
    setStatus('loading')
    setDrag({ x: 0, y: 0 })
    setDragging(false)
    ptrs.current.clear()
    gesture.current = null
  }, [photo?.src])
  useEffect(() => {
    if (status !== 'ready' || reduced || !dir.current) return
    imgRef.current?.animate?.([{ transform: `translate3d(${dir.current * 44}px,0,0)` }, { transform: 'translate3d(0,0,0)' }], { duration: 300, easing: 'cubic-bezier(.22,.8,.24,1)' })
    dir.current = 0
  }, [status, reduced])

  // stage 크기 측정
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const read = () => setStage({ w: el.clientWidth, h: el.clientHeight })
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    setView((v) => (v.s > 1 ? clampView(v) : v))
  }, [fit, stage, clampView])

  // 이웃 사진 미리 로드
  useEffect(() => {
    if (n < 2) return
    for (const d of [1, -1]) {
      const p = photos[(((i + d) % n) + n) % n]
      if (p) new Image().src = assetUrl(p.src)
    }
  }, [i, n, photos])

  // 현재 썸네일을 보이는 위치로
  useEffect(() => {
    const el = thumbsRef.current?.querySelector<HTMLElement>('[aria-current="true"]')
    el?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: reduced ? 'auto' : 'smooth' })
  }, [i, reduced])

  // ── 모달 동작: 포커스 트랩 · 스크롤 잠금 · 배경 inert · 키보드 ──
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null
    const appRoot = document.getElementById('root')
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    appRoot?.setAttribute('inert', '')
    closeRef.current?.focus({ preventScroll: true })

    const onKey = (e: KeyboardEvent) => {
      // 뒤쪽 앱의 전역 단축키(/, ⌘K, Esc …)가 반응하지 않도록 이 대화상자에서 소비한다.
      e.stopPropagation()
      const root = rootRef.current
      const { onClose: close, go: nav, applySmooth: smoothTo, zoomAt: zoom } = cb.current
      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          close()
          return
        case 'ArrowLeft':
          e.preventDefault()
          nav(-1)
          return
        case 'ArrowRight':
          e.preventDefault()
          nav(1)
          return
        case '+':
        case '=':
          e.preventDefault()
          smoothTo(zoom(live.current.view, live.current.view.s * 1.6, 0, 0))
          return
        case '-':
        case '_':
          e.preventDefault()
          smoothTo(zoom(live.current.view, live.current.view.s / 1.6, 0, 0))
          return
        case '0':
          e.preventDefault()
          smoothTo(HOME)
          return
        case 'Tab': {
          if (!root) return
          const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement)
          if (items.length === 0) {
            e.preventDefault()
            return
          }
          const first = items[0]
          const last = items[items.length - 1]
          const active = document.activeElement
          if (e.shiftKey && (active === first || !root.contains(active))) {
            e.preventDefault()
            last.focus()
          } else if (!e.shiftKey && (active === last || !root.contains(active))) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prevOverflow
      appRoot?.removeAttribute('inert')
      if (prevFocus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true })
    }
  }, [])

  // 휠/트랙패드 핀치 줌 — passive:false 가 필요해서 네이티브 리스너
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const px = e.clientX - rect.left - rect.width / 2
      const py = e.clientY - rect.top - rect.height / 2
      const unit = e.deltaMode === 1 ? 16 : 1
      const factor = Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.012 : 0.0018))
      setSmooth(false)
      setView((v) => zoomAt(v, v.s * factor, px, py))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  // ── 포인터 제스처 ──
  const rel = (e: { clientX: number; clientY: number }) => {
    const r = stageRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 }
  }
  const pinchState = (): { d: number; mx: number; my: number } | null => {
    const pts = Array.from(ptrs.current.values())
    if (pts.length < 2) return null
    const [a, b] = pts
    return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    stageRef.current?.setPointerCapture(e.pointerId)
    const p = rel(e)
    ptrs.current.set(e.pointerId, p)
    setSmooth(false)
    const v = live.current.view
    if (ptrs.current.size >= 2) {
      const ps = pinchState()!
      gesture.current = { kind: 'pinch', d0: Math.max(1, ps.d), s0: v.s, cx: (ps.mx - v.x) / v.s, cy: (ps.my - v.y) / v.s }
      setDragging(false)
      setDrag({ x: 0, y: 0 })
    } else if (v.s > 1.001) {
      gesture.current = { kind: 'pan', sx: p.x, sy: p.y, x0: v.x, y0: v.y, moved: false }
    } else {
      gesture.current = { kind: 'swipe', sx: p.x, sy: p.y, mode: 'undecided', lastX: p.x, lastY: p.y, lastT: performance.now(), vx: 0, vy: 0 }
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!ptrs.current.has(e.pointerId)) return
    const p = rel(e)
    ptrs.current.set(e.pointerId, p)
    const g = gesture.current
    if (!g) return
    if (g.kind === 'pinch') {
      const ps = pinchState()
      if (!ps) return
      const s = clamp(g.s0 * (ps.d / g.d0), 0.8, MAX_SCALE)
      setView(s < 1 ? { s, x: 0, y: 0 } : clampView({ s, x: ps.mx - g.cx * s, y: ps.my - g.cy * s }))
    } else if (g.kind === 'pan') {
      if (Math.hypot(p.x - g.sx, p.y - g.sy) > 4) g.moved = true
      setView(clampView({ s: live.current.view.s, x: g.x0 + (p.x - g.sx), y: g.y0 + (p.y - g.sy) }))
    } else {
      const dx = p.x - g.sx
      const dy = p.y - g.sy
      const now = performance.now()
      g.vx = (p.x - g.lastX) / Math.max(1, now - g.lastT)
      g.vy = (p.y - g.lastY) / Math.max(1, now - g.lastT)
      g.lastX = p.x
      g.lastY = p.y
      g.lastT = now
      if (g.mode === 'undecided') {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        g.mode = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
        setDragging(true)
      }
      setDrag(g.mode === 'h' ? { x: live.current.n > 1 ? dx : dx * 0.3, y: 0 } : { x: 0, y: dy })
    }
  }

  const finish = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    if (!ptrs.current.has(e.pointerId)) return
    const g = gesture.current
    ptrs.current.delete(e.pointerId)
    try {
      stageRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    if (!g) return

    if (g.kind === 'pinch') {
      // 손가락 하나가 남으면 이동 모드로 전환, 다 떼면 종료. 원래보다 작아졌으면 복귀.
      const v = live.current.view
      if (ptrs.current.size === 0) gesture.current = null
      else {
        const [, p] = Array.from(ptrs.current.entries())[0]
        gesture.current = v.s > 1.001 ? { kind: 'pan', sx: p.x, sy: p.y, x0: v.x, y0: v.y, moved: true } : null
      }
      if (v.s < 1) applySmooth(HOME)
      return
    }

    gesture.current = null
    if (g.kind === 'pan') {
      if (!g.moved && !cancelled) registerTap(e, g)
      return
    }

    // swipe 모드 (원래 크기)
    setDragging(false)
    if (g.mode === 'undecided') {
      setDrag({ x: 0, y: 0 })
      if (!cancelled) registerTap(e, g)
      return
    }
    const { n: total } = live.current
    setSmooth(true)
    if (g.mode === 'h') {
      const dx = drag.x
      if (!cancelled && total > 1 && (Math.abs(dx) > 70 || Math.abs(g.vx) > 0.5)) {
        const d = (Math.abs(dx) > 20 ? dx : g.vx) < 0 ? 1 : -1
        setDrag({ x: 0, y: 0 })
        go(d)
        return
      }
    } else if (!cancelled && (Math.abs(drag.y) > 110 || Math.abs(g.vy) > 0.7)) {
      onClose()
      return
    }
    setDrag({ x: 0, y: 0 })
  }

  /** 탭 처리: 더블탭 = 확대 토글, 이미지 바깥 탭 = 닫기 */
  const registerTap = (e: React.PointerEvent<HTMLDivElement>, g: Gesture) => {
    const p = rel(e)
    const now = performance.now()
    const lt = lastTap.current
    const isDouble = now - lt.t < 320 && Math.hypot(p.x - lt.x, p.y - lt.y) < 36
    lastTap.current = isDouble ? { t: 0, x: 0, y: 0 } : { t: now, x: p.x, y: p.y }
    if (isDouble) {
      const v = live.current.view
      applySmooth(v.s > 1.05 ? HOME : zoomAt(v, DOUBLE_TAP_SCALE, p.x, p.y))
      return
    }
    // 이미지 영역 밖(빈 배경)을 탭하면 닫기 — 한 번 더 탭이 이어지지 않을 때만
    const img = imgRef.current
    if (img && g.kind === 'swipe') {
      const r = img.getBoundingClientRect()
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      if (!inside) {
        window.setTimeout(() => {
          if (lastTap.current.t === now) onClose()
        }, 330)
      }
    }
  }

  if (!photo) return null
  const caption = photo.caption
  const dismissP = dragging && drag.y !== 0 ? Math.min(1, Math.abs(drag.y) / 320) : 0
  const imgStyle: React.CSSProperties = fit
    ? { width: fit.w, height: fit.h }
    : { maxWidth: '100%', maxHeight: '100%' }
  const tx = view.x + drag.x
  const ty = view.y + drag.y
  const zoomed = view.s > 1.001
  const showThumbs = n > 1 && n <= MAX_THUMBS

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} 사진 보기`}
      className="fixed inset-0 z-[55] flex animate-fade-in flex-col text-white"
      style={{
        background: `rgb(7 11 21 / ${0.97 * (1 - dismissP * 0.7)})`,
        WebkitBackdropFilter: 'blur(16px)',
        backdropFilter: 'blur(16px)',
      }}
    >
      {/* 상단 바 */}
      <div
        className="relative z-20 flex items-center gap-3 px-3 pb-2 pt-[calc(var(--safe-top)+0.5rem)] sm:px-5"
        style={{ opacity: 1 - dismissP * 1.4, transition: dragging ? 'none' : 'opacity 200ms ease' }}
      >
        <div className="min-w-0 flex-1 pl-1">
          <div className="text-[0.75rem] font-semibold tracking-[0.12em] text-white/60">
            <span className="tnum">{n > 1 ? `${i + 1} / ${n}` : 'PHOTO'}</span>
          </div>
          <div className="truncate text-[0.9375rem] font-semibold text-white">{alt}</div>
        </div>
        <div className="hidden items-center gap-1 sm:flex" role="group" aria-label="확대 조절">
          <LbButton label="축소 (−)" onClick={() => applySmooth(zoomAt(view, view.s / 1.6, 0, 0))} disabled={!zoomed}>
            <Minus size={18} />
          </LbButton>
          <span className="tnum w-12 text-center text-[0.8125rem] font-semibold text-white/80" aria-live="off">
            {Math.round(view.s * 100)}%
          </span>
          <LbButton label="확대 (+)" onClick={() => applySmooth(zoomAt(view, view.s * 1.6, 0, 0))} disabled={view.s >= MAX_SCALE - 0.01}>
            <Plus size={18} />
          </LbButton>
          <LbButton label="원래 크기로 (0)" onClick={() => applySmooth(HOME)} disabled={!zoomed}>
            <RotateCcw size={16} />
          </LbButton>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="사진 보기 닫기 (Esc)"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/12 text-white transition-colors hover:bg-white/22 focus-visible:outline-white"
        >
          <X size={22} strokeWidth={1.8} />
        </button>
      </div>

      {/* 사진 영역 */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={stageRef}
          className="absolute inset-0 grid touch-none select-none place-items-center overflow-hidden"
          style={{ cursor: zoomed ? (dragging ? 'grabbing' : 'grab') : 'zoom-in' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => finish(e, false)}
          onPointerCancel={(e) => finish(e, true)}
        >
          {status === 'loading' && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden="true">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
            </div>
          )}
          {status === 'error' ? (
            <div className="grid justify-items-center gap-2 px-8 text-center text-white/70">
              <ImageOff size={30} strokeWidth={1.4} aria-hidden="true" />
              <p className="text-[0.9375rem]">사진을 불러오지 못했습니다.</p>
            </div>
          ) : (
            <img
              key={photo.src}
              ref={imgRef}
              src={assetUrl(photo.src)}
              alt={caption || `${alt} 사진 ${i + 1}`}
              draggable={false}
              decoding="async"
              onLoad={(e) => {
                setNatural({ w: e.currentTarget.naturalWidth || 1, h: e.currentTarget.naturalHeight || 1 })
                setStatus('ready')
              }}
              onError={() => setStatus('error')}
              className="block max-w-none rounded-[2px] shadow-[0_20px_60px_-12px_rgb(0_0_0/0.6)]"
              style={{
                ...imgStyle,
                opacity: status === 'ready' && fit ? 1 : 0,
                transform: `translate3d(${tx}px, ${ty}px, 0) scale(${view.s})`,
                transition: dragging || !smooth ? 'opacity 260ms ease' : 'transform 240ms var(--ease-out), opacity 260ms ease',
                willChange: 'transform',
              }}
            />
          )}
        </div>

        {n > 1 && (
          <>
            <NavButton side="left" label={`이전 사진 (${((i - 1 + n) % n) + 1}/${n}, ←)`} onClick={() => go(-1)} faded={dismissP > 0.05} />
            <NavButton side="right" label={`다음 사진 (${((i + 1) % n) + 1}/${n}, →)`} onClick={() => go(1)} faded={dismissP > 0.05} />
          </>
        )}
      </div>

      {/* 하단: 캡션 + 썸네일 */}
      <div
        className="relative z-20 px-4 pb-[calc(var(--safe-bottom)+0.75rem)] pt-3 text-center"
        style={{ opacity: 1 - dismissP * 1.4, transition: dragging ? 'none' : 'opacity 200ms ease' }}
      >
        {caption && <p className="mx-auto mb-2.5 max-w-2xl text-[0.9375rem] leading-relaxed text-white/90">{caption}</p>}
        {showThumbs && (
          <div ref={thumbsRef} className="sheet-scroll mx-auto flex w-max max-w-full items-center gap-2 overflow-x-auto px-1 py-1" role="group" aria-label="사진 목록">
            {photos.map((p, k) => (
              <button
                key={`${p.src}#${k}`}
                type="button"
                onClick={() => {
                  dir.current = k > i ? 1 : -1
                  onIndexChange(k)
                }}
                aria-label={`사진 ${k + 1}번 보기`}
                aria-current={k === i ? 'true' : undefined}
                className={`relative h-11 w-[3.75rem] shrink-0 overflow-hidden rounded-lg transition-[opacity,box-shadow] duration-180 focus-visible:outline-white ${
                  k === i ? 'opacity-100 ring-2 ring-gold' : 'opacity-55 hover:opacity-90'
                }`}
              >
                <img src={assetUrl(p.src)} alt="" loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
        {!caption && !showThumbs && n === 1 && <p className="text-[0.75rem] text-white/45">두 번 탭하면 확대됩니다</p>}
      </div>

      <div className="sr-only-live" aria-live="polite" role="status">
        {`${i + 1} / ${n}${caption ? `, ${caption}` : ''}`}
      </div>
    </div>,
    document.body,
  )
}

function LbButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid h-10 w-10 place-items-center rounded-full text-white transition-colors hover:bg-white/15 focus-visible:outline-white disabled:opacity-35 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

function NavButton({ side, label, onClick, faded }: { side: 'left' | 'right'; label: string; onClick: () => void; faded: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`absolute top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-[rgb(0_0_0/0.4)] text-white ring-1 ring-white/25 backdrop-blur-sm transition-[opacity,background-color] duration-180 hover:bg-[rgb(0_0_0/0.65)] focus-visible:outline-white sm:h-14 sm:w-14 ${
        side === 'left' ? 'left-2 sm:left-5' : 'right-2 sm:right-5'
      } ${faded ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      tabIndex={faded ? -1 : 0}
    >
      {side === 'left' ? <ChevronLeft size={26} strokeWidth={1.6} /> : <ChevronRight size={26} strokeWidth={1.6} />}
    </button>
  )
}

export { Lightbox }
