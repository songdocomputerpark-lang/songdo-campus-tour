// 순수 SVG 지도용 pan/zoom 엔진 (외부 라이브러리 없음, 관성 없음).
//
//  - 변환: screen = world * k + (x, y).  월드 그룹(<g ref={worldRef}>)에 matrix 를 직접 setAttribute 한다
//    (React 재렌더 없음 → 60fps). 같은 요소에 CSS 변수 --k, --ik(=1/k) 를 갱신하므로, 화면 크기 고정 라벨은
//    style={{ transform: `translate(${x}px, ${y}px) scale(var(--ik))` }} 로 그릴 수 있다.
//  - 입력: 포인터 드래그(탭/드래그 임계 마우스 6px · 손가락 12px), 핀치(두 손가락), 두 손가락 탭(축소), 휠(커서 기준 줌),
//    더블클릭/더블탭 확대, 키보드(화살표/+/-/0).
//  - 드래그가 임계값을 넘으면 뒤따르는 click 은 캡처 단계에서 차단 → 요소의 onClick 은 '탭'에서만 실행된다.
//  - 빈 곳 탭 판정용: 클릭 가능한 요소에 data-hit 속성을 달아 둔다 (더블탭 확대·배경 탭 콜백에서 제외됨).
//  - 손가락 제스처(드래그·핀치) 동안에는 '정착 배율'(getSettledScale)을 고정한다 → 배율에 따라 다시 그리는 라벨·카드가
//    손가락 아래에서 사라지지 않고(iOS 는 사라진 요소로 간 터치를 잃는다), 손을 뗄 때 한 번만 다시 배치된다.
//  - animateTo(bounds, {padding}): van Wijk smooth zoom(경로 최적 줌/팬) + rAF. prefers-reduced-motion 이면 즉시 이동.
//  - insets(패널·툴바가 가리는 영역)를 고려해 '보이는 영역'의 중앙에 맞춘다. resize/insets 변화 시 마지막 대상으로 재맞춤.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { Bounds, Insets, Pt } from '../data/types'
import { clamp } from '../lib/geometry'
import { prefersReducedMotion } from '../lib/env'

export interface Transform {
  x: number
  y: number
  k: number
}
export interface ViewSize {
  w: number
  h: number
}

export interface AnimateOptions {
  /** 추가 여백(px). number = 4변 동일 */
  padding?: number | Partial<Insets>
  /** ms. 생략하면 이동 거리/줌 변화량에 따라 380~1000ms */
  duration?: number
  immediate?: boolean
  maxScale?: number
  minScale?: number
  /** 이 대상에 '따라가기' — resize/inset 변화 시 재맞춤. 기본 true */
  follow?: boolean
}

export interface PanZoomApi {
  getTransform(): Transform
  getSize(): ViewSize
  /** 변환이 바뀔 때마다 동기 호출. 반환값으로 해제 */
  subscribe(cb: (t: Transform) => void): () => void
  setTransform(t: Transform): void
  /** bounds(월드 좌표)가 보이는 영역 안에 꼭 맞도록 이동 */
  animateTo(bounds: Bounds, opts?: AnimateOptions): void
  /** 전체 콘텐츠 맞춤 */
  fit(opts?: AnimateOptions): void
  /** 점을 보이는 영역 중앙으로 (k 생략 시 현재 배율 유지) */
  focus(pt: Pt, opts?: AnimateOptions & { k?: number }): void
  /** 보이는 영역 중앙 기준 배율 변경 (애니메이션). duration 생략 시 150ms */
  zoomBy(factor: number, screenAnchor?: Pt, duration?: number): void
  /** 손가락 제스처 중에는 제스처 시작 전 배율, 그 밖에는 현재 배율 — 배율 단계에 따라 다시 그리는 레이어용 */
  getSettledScale(): number
  /** 카메라 이동 애니메이션 중인가 */
  isAnimating(): boolean
  /** 브라우저 좌표(clientX/Y) → 지도 화면 좌표 */
  clientToScreen(cx: number, cy: number): Pt
  screenToWorld(sx: number, sy: number): Pt
  worldToScreen(wx: number, wy: number): Pt
  /** 현재 화면에 보이는 월드 사각형(insets 무시, 뷰포트 전체) */
  visibleWorld(): Bounds
  /** insets 를 제외한 '보이는 영역' (화면 px) */
  availableRect(): Bounds
  isFollowing(): boolean
  stop(): void
}

export interface PanZoomOptions {
  /** 클램프·최소 배율 기준이 되는 전체 콘텐츠 영역(월드) */
  content: Bounds
  insets: Insets
  /** 절대 최대 배율 (기본 8) */
  maxScale?: number
  /** 최소 배율 = 맞춤 배율 × 이 값 (기본 0.7) */
  minScaleFactor?: number
  /** 전체 맞춤 시 여백 px (기본 24) */
  fitPadding?: number
  /** 첫 크기 측정 시 맞출 대상 (기본 content) */
  initialBounds?: Bounds
  /**
   * 세로로 긴 화면(보이는 영역 종횡비 < PORTRAIT_ASPECT)에서 '맞춤'(첫 맞춤 · fit() · 키 0)이 content 대신 맞출 영역.
   * 폰 세로 화면에서 핵심 영역이 화면 폭을 채우도록 한다. 크기/insets 가 바뀌면 방향을 다시 판정한다.
   */
  portraitFit?: Bounds
  /** 사용자가 직접 조작을 시작할 때 */
  onInteract?: () => void
}

/** 보이는 영역 가로/세로 비가 이보다 작으면 세로 화면으로 본다 */
export const PORTRAIT_ASPECT = 0.9
/** 세로 화면 맞춤의 추가 여백(px) — portraitFit 영역 자체에 이미 여백이 들어 있다 */
const PORTRAIT_PADDING = 6
const DRAG_THRESHOLD = 6
/** 손가락은 누르는 동안 조금씩 흔들린다 — 이 안에서 떼면 '탭'(선택)으로 본다 */
const TOUCH_DRAG_THRESHOLD = 12
const DOUBLE_TAP_MS = 320
/** 더블탭 확대 배율 · 두 손가락 탭 축소 배율 · 탭 확대 애니메이션 길이(ms) */
const DOUBLE_TAP_ZOOM = 2
const TWO_FINGER_TAP_ZOOM = 1 / 2
export const TAP_ZOOM_MS = 260
/** 이미 고른 건물·장소·방을 한 번 더 눌렀을 때 확대 배율 (CampusMap · EventLayer · FloorPlan) */
export const RETAP_ZOOM = 1.6
/** 두 손가락 탭: 이 시간 안에, 이만큼 덜 움직이고 떼면 축소 */
const TWO_FINGER_TAP_MS = 300
const TWO_FINGER_TAP_SLOP = 10
const RHO = Math.SQRT2

interface PointerRec {
  x: number
  y: number
  sx: number
  sy: number
}

interface Target {
  bounds: Bounds
  opts: AnimateOptions
  /** '맞춤' 대상 — 세로 화면이면 portraitFit 으로 대체된다 */
  fit?: boolean
}

interface Internal {
  t: Transform
  size: ViewSize
  raf: number
  subs: Set<(t: Transform) => void>
  target: Target | null
  following: boolean
  pointers: Map<number, PointerRec>
  dragging: boolean
  pinch: { d0: number; k0: number; w: Pt; m0: Pt; t0: number; moved: boolean } | null
  /** 두 손가락 탭 후보(첫 손가락을 뗀 시각·중점) — 나머지 손가락도 곧 떼면 축소 */
  twoTap: { t: number; x: number; y: number } | null
  start: Transform
  suppressClick: boolean
  lastTap: { t: number; x: number; y: number } | null
  lastType: string
  zoomGoal: Transform | null
  sized: boolean
  /** 손가락 제스처 밖에서 마지막으로 정해진 배율 */
  settledK: number
}

function easeInOutCubic(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2
}
function easeOutCubic(u: number): number {
  return 1 - Math.pow(1 - u, 3)
}

/** van Wijk & Nuij (2003) smooth zoom 경로. view = [cx, cy, width] (월드 단위) */
function zoomPath(p0: [number, number, number], p1: [number, number, number]) {
  const [ux0, uy0, w0] = p0
  const [ux1, uy1, w1] = p1
  const dx = ux1 - ux0
  const dy = uy1 - uy0
  const d2 = dx * dx + dy * dy
  const rho2 = RHO * RHO
  const rho4 = rho2 * rho2
  let S: number
  let at: (t: number) => [number, number, number]
  if (d2 < 1e-6) {
    S = Math.log(w1 / w0) / RHO
    at = (t) => [ux0 + t * dx, uy0 + t * dy, w0 * Math.exp(RHO * t * S)]
  } else {
    const d1 = Math.sqrt(d2)
    const b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1)
    const b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1)
    const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0)
    const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1)
    S = (r1 - r0) / RHO
    at = (t) => {
      const s = t * S
      const coshr0 = Math.cosh(r0)
      const u = (w0 / (rho2 * d1)) * (coshr0 * Math.tanh(RHO * s + r0) - Math.sinh(r0))
      return [ux0 + u * dx, uy0 + u * dy, (w0 * coshr0) / Math.cosh(RHO * s + r0)]
    }
  }
  return { at, S: Math.abs(S) }
}

function padInsets(p: number | Partial<Insets> | undefined): Insets {
  if (p == null) return { top: 0, right: 0, bottom: 0, left: 0 }
  if (typeof p === 'number') return { top: p, right: p, bottom: p, left: p }
  return { top: p.top ?? 0, right: p.right ?? 0, bottom: p.bottom ?? 0, left: p.left ?? 0 }
}

function isOnHit(target: EventTarget | null): boolean {
  return !!(target as Element | null)?.closest?.('[data-hit]')
}

/**
 * 이미 고른 건물·장소·방을 한 번 더 눌렀을 때: 그 점(월드 좌표)을 중심으로 한 단계 확대한다.
 * 점이 보이는 영역 밖이면 가운데로 데려오며 확대. 카메라가 이동 중이면 무시(선택 직후 두 번 누름이 이동을 끊지 않게).
 */
export function retapZoom(api: PanZoomApi, at: Pt): void {
  if (api.isAnimating()) return
  const [sx, sy] = api.worldToScreen(at[0], at[1])
  const a = api.availableRect()
  if (sx < a.x || sx > a.x + a.w || sy < a.y || sy > a.y + a.h) api.focus(at, { k: api.getTransform().k * RETAP_ZOOM })
  else api.zoomBy(RETAP_ZOOM, [sx, sy], TAP_ZOOM_MS)
}

export function usePanZoom(options: PanZoomOptions) {
  const optsRef = useRef(options)
  optsRef.current = options
  const containerRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<SVGGElement>(null)
  const stRef = useRef<Internal | null>(null)
  if (!stRef.current) {
    stRef.current = {
      t: { x: 0, y: 0, k: 1 },
      size: { w: 0, h: 0 },
      raf: 0,
      subs: new Set(),
      target: null,
      following: true,
      pointers: new Map(),
      dragging: false,
      pinch: null,
      twoTap: null,
      start: { x: 0, y: 0, k: 1 },
      suppressClick: false,
      lastTap: null,
      lastType: 'mouse',
      zoomGoal: null,
      sized: false,
      settledK: 1,
    }
  }

  const { api, I } = useMemo(() => {
    const S = stRef.current as Internal

    const avail = (padding?: number | Partial<Insets>): Bounds => {
      const base = optsRef.current.insets
      const p = padInsets(padding)
      const left = base.left + p.left
      const top = base.top + p.top
      const right = base.right + p.right
      const bottom = base.bottom + p.bottom
      const w = Math.max(48, S.size.w - left - right)
      const h = Math.max(48, S.size.h - top - bottom)
      return { x: left, y: top, w, h }
    }

    const fitScale = (): number => {
      const o = optsRef.current
      const a = avail(o.fitPadding ?? 24)
      return Math.min(a.w / Math.max(1e-6, o.content.w), a.h / Math.max(1e-6, o.content.h))
    }
    const minK = () => fitScale() * (optsRef.current.minScaleFactor ?? 0.7)
    const maxK = () => Math.max(optsRef.current.maxScale ?? 8, fitScale() * 1.5)

    const applyDom = () => {
      const g = worldRef.current
      if (!g) return
      const { x, y, k } = S.t
      g.setAttribute('transform', `matrix(${k} 0 0 ${k} ${x} ${y})`)
      g.style.setProperty('--k', String(k))
      g.style.setProperty('--ik', String(1 / k))
    }

    const clampT = (t: Transform): Transform => {
      if (S.size.w === 0) return t
      const o = optsRef.current
      const k = clamp(t.k, minK(), maxK())
      let { x, y } = t
      const cb = o.content
      const m = Math.min(S.size.w, S.size.h) * 0.3
      const left = x + cb.x * k
      const right = left + cb.w * k
      const top = y + cb.y * k
      const bottom = top + cb.h * k
      if (right < m) x += m - right
      if (left > S.size.w - m) x -= left - (S.size.w - m)
      if (bottom < m) y += m - bottom
      if (top > S.size.h - m) y -= top - (S.size.h - m)
      return { x, y, k }
    }

    const commit = (t: Transform, doClamp = true) => {
      S.t = doClamp ? clampT(t) : t
      if (!S.dragging) S.settledK = S.t.k
      applyDom()
      S.subs.forEach((cb) => cb(S.t))
    }

    /** 손가락 제스처가 끝났을 때: 정착 배율을 갱신하고 구독자에게 알린다(라벨·카드 재배치는 이때 한 번) */
    const settle = () => {
      S.settledK = S.t.k
      S.subs.forEach((cb) => cb(S.t))
    }

    const cancelAnim = () => {
      if (S.raf) cancelAnimationFrame(S.raf)
      S.raf = 0
      S.zoomGoal = null
    }

    /** 현재 → target 변환으로 부드럽게 이동 (van Wijk) */
    const animateView = (target: Transform, duration?: number, immediate = false) => {
      cancelAnim()
      const { w: vw, h: vh } = S.size
      const from = S.t
      if (immediate || prefersReducedMotion() || vw === 0 || vh === 0) {
        commit(target)
        return
      }
      if (Math.abs(from.x - target.x) < 0.5 && Math.abs(from.y - target.y) < 0.5 && Math.abs(from.k / target.k - 1) < 0.002) {
        commit(target)
        return
      }
      const view = (t: Transform): [number, number, number] => [(vw / 2 - t.x) / t.k, (vh / 2 - t.y) / t.k, vw / t.k]
      const path = zoomPath(view(from), view(target))
      const dur = duration ?? clamp(path.S * 700, 380, 1000)
      const t0 = performance.now()
      const step = (now: number) => {
        const u = clamp((now - t0) / dur, 0, 1)
        if (u >= 1) {
          S.raf = 0
          commit(target)
          return
        }
        const [cx, cy, w] = path.at(easeInOutCubic(u))
        const k = vw / w
        commit({ k, x: vw / 2 - cx * k, y: vh / 2 - cy * k }, false)
        S.raf = requestAnimationFrame(step)
      }
      S.raf = requestAnimationFrame(step)
    }

    /** 앵커(화면 좌표)에 고정된 월드점을 유지하며 배율 애니메이션 */
    const animateZoomAt = (sx: number, sy: number, goal: Transform, duration = 150) => {
      if (S.raf) cancelAnimationFrame(S.raf)
      const from = S.t
      if (prefersReducedMotion()) {
        commit(goal)
        return
      }
      S.zoomGoal = goal
      const wx = (sx - goal.x) / goal.k
      const wy = (sy - goal.y) / goal.k
      const t0 = performance.now()
      const step = (now: number) => {
        const u = clamp((now - t0) / duration, 0, 1)
        const e = easeOutCubic(u)
        const k = from.k * Math.pow(goal.k / from.k, e)
        commit({ k, x: sx - wx * k, y: sy - wy * k }, false)
        if (u < 1) S.raf = requestAnimationFrame(step)
        else {
          S.raf = 0
          S.zoomGoal = null
          commit(S.t)
        }
      }
      S.raf = requestAnimationFrame(step)
    }

    /** 맞춤 대상이면 세로 화면에서 portraitFit 으로 대체 (여백도 줄인다) */
    const resolveTarget = (t: Target): { bounds: Bounds; opts: AnimateOptions } => {
      const pf = optsRef.current.portraitFit
      if (t.fit && pf && S.size.w > 0) {
        const a = avail()
        if (a.w / a.h < PORTRAIT_ASPECT) return { bounds: pf, opts: { ...t.opts, padding: PORTRAIT_PADDING } }
      }
      return t
    }

    const transformFor = (bounds: Bounds, o: AnimateOptions = {}): Transform => {
      const a = avail(o.padding)
      let k = Math.min(a.w / Math.max(1e-6, bounds.w), a.h / Math.max(1e-6, bounds.h))
      k = clamp(k, o.minScale ?? minK(), o.maxScale ?? maxK())
      const cx = bounds.x + bounds.w / 2
      const cy = bounds.y + bounds.h / 2
      return { k, x: a.x + a.w / 2 - cx * k, y: a.y + a.h / 2 - cy * k }
    }

    const targetTransform = (t: Target): Transform => {
      const r = resolveTarget(t)
      return transformFor(r.bounds, r.opts)
    }

    const interact = () => {
      S.following = false
      cancelAnim()
      optsRef.current.onInteract?.()
    }

    const zoomAtPoint = (sx: number, sy: number, factor: number, animate: boolean, duration?: number) => {
      const base = S.zoomGoal ?? S.t
      const k = clamp(base.k * factor, minK(), maxK())
      const wx = (sx - base.x) / base.k
      const wy = (sy - base.y) / base.k
      const goal = { k, x: sx - wx * k, y: sy - wy * k }
      if (animate) animateZoomAt(sx, sy, goal, duration)
      else {
        cancelAnim()
        commit(goal)
      }
    }

    const goTo = (target: Target) => {
      S.target = target
      S.following = target.opts.follow !== false
      if (S.size.w === 0) return // 크기 측정 후 ResizeObserver 가 target 으로 맞춘다
      animateView(targetTransform(target), target.opts.duration, target.opts.immediate)
    }

    const api: PanZoomApi = {
      getTransform: () => S.t,
      getSize: () => S.size,
      subscribe: (cb) => {
        S.subs.add(cb)
        return () => {
          S.subs.delete(cb)
        }
      },
      setTransform: (t) => {
        cancelAnim()
        commit(t)
      },
      animateTo: (bounds, o = {}) => goTo({ bounds, opts: o }),
      fit: (o = {}) => goTo({ bounds: optsRef.current.content, opts: { padding: optsRef.current.fitPadding ?? 24, ...o }, fit: true }),
      focus: (pt, o = {}) => {
        const a = avail(o.padding)
        const k = clamp(o.k ?? S.t.k, o.minScale ?? minK(), o.maxScale ?? maxK())
        S.target = null
        S.following = false
        animateView({ k, x: a.x + a.w / 2 - pt[0] * k, y: a.y + a.h / 2 - pt[1] * k }, o.duration, o.immediate)
      },
      zoomBy: (factor, anchor, duration) => {
        const a = avail()
        const sx = anchor ? anchor[0] : a.x + a.w / 2
        const sy = anchor ? anchor[1] : a.y + a.h / 2
        S.following = false
        zoomAtPoint(sx, sy, factor, true, duration)
      },
      getSettledScale: () => S.settledK,
      isAnimating: () => S.raf !== 0,
      clientToScreen: (cx, cy) => {
        const r = containerRef.current?.getBoundingClientRect()
        return r ? [cx - r.left, cy - r.top] : [cx, cy]
      },
      screenToWorld: (sx, sy) => [(sx - S.t.x) / S.t.k, (sy - S.t.y) / S.t.k],
      worldToScreen: (wx, wy) => [wx * S.t.k + S.t.x, wy * S.t.k + S.t.y],
      visibleWorld: () => ({ x: -S.t.x / S.t.k, y: -S.t.y / S.t.k, w: S.size.w / S.t.k, h: S.size.h / S.t.k }),
      availableRect: () => avail(),
      isFollowing: () => S.following,
      stop: cancelAnim,
    }

    const I = { avail, transformFor, targetTransform, commit, settle, interact, zoomAtPoint, animateView, clampT, cancelAnim }
    return { api, I }
  }, [])

  // 변환을 DOM 에 반영 (마운트/재마운트 시)
  useLayoutEffect(() => {
    const S = stRef.current as Internal
    const g = worldRef.current
    if (g) {
      g.setAttribute('transform', `matrix(${S.t.k} 0 0 ${S.t.k} ${S.t.x} ${S.t.y})`)
      g.style.setProperty('--k', String(S.t.k))
      g.style.setProperty('--ik', String(1 / S.t.k))
    }
  })

  // 입력 이벤트 + 리사이즈
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const S = stRef.current as Internal
    const rectOf = () => el.getBoundingClientRect()
    const local = (e: { clientX: number; clientY: number }): Pt => {
      const r = rectOf()
      return [e.clientX - r.left, e.clientY - r.top]
    }

    const setDragging = (on: boolean) => {
      S.dragging = on
      if (on) el.setAttribute('data-dragging', 'true')
      else el.removeAttribute('data-dragging')
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if ((e.target as Element | null)?.closest?.('[data-no-pan]')) return
      // 새 터치의 첫 손가락인데 지난 포인터가 남아 있으면(가리키던 요소가 사라져 pointerup 을 못 받은 경우 등) 비우고 새로 시작한다.
      // 그대로 두면 다음 한 손가락이 '핀치'로 오인되어 이동·탭이 먹통이 된다.
      if (e.isPrimary && S.pointers.size > 0) {
        S.pointers.clear()
        S.pinch = null
        S.twoTap = null
        if (S.dragging) {
          setDragging(false)
          I.settle()
        }
      }
      S.lastType = e.pointerType
      I.cancelAnim()
      const [x, y] = local(e)
      S.pointers.set(e.pointerId, { x, y, sx: x, sy: y })
      if (S.pointers.size === 1) {
        S.start = { ...S.t }
        S.suppressClick = false
        S.twoTap = null
      } else if (S.pointers.size === 2) {
        const [p1, p2] = Array.from(S.pointers.values())
        const d0 = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1
        const mx = (p1.x + p2.x) / 2
        const my = (p1.y + p2.y) / 2
        S.pinch = { d0, k0: S.t.k, w: [(mx - S.t.x) / S.t.k, (my - S.t.y) / S.t.k], m0: [mx, my], t0: performance.now(), moved: false }
        S.suppressClick = true
        S.lastTap = null
        I.interact()
        if (!S.dragging) setDragging(true)
        // 두 손가락을 지도 컨테이너로 붙잡는다 — 처음 닿은 카드·라벨이 다시 그려져 사라져도 핀치가 끊기지 않는다
        for (const id of S.pointers.keys()) {
          try {
            el.setPointerCapture(id)
          } catch {
            /* ignore */
          }
        }
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      const rec = S.pointers.get(e.pointerId)
      if (!rec) return
      const [x, y] = local(e)
      rec.x = x
      rec.y = y
      if (S.pointers.size >= 2 && S.pinch) {
        const [p1, p2] = Array.from(S.pointers.values())
        const d = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1
        const mx = (p1.x + p2.x) / 2
        const my = (p1.y + p2.y) / 2
        if (!S.pinch.moved && (Math.abs(d - S.pinch.d0) > TWO_FINGER_TAP_SLOP || Math.hypot(mx - S.pinch.m0[0], my - S.pinch.m0[1]) > TWO_FINGER_TAP_SLOP)) {
          S.pinch.moved = true
        }
        const k = d / S.pinch.d0 * S.pinch.k0
        const t = I.clampT({ k, x: mx - S.pinch.w[0] * k, y: my - S.pinch.w[1] * k })
        // clamp 로 k 가 바뀌면 앵커가 어긋나므로 k 기준으로 재계산
        I.commit({ k: t.k, x: mx - S.pinch.w[0] * t.k, y: my - S.pinch.w[1] * t.k }, false)
        return
      }
      if (S.pointers.size === 1) {
        const dx = x - rec.sx
        const dy = y - rec.sy
        if (!S.dragging) {
          if (Math.hypot(dx, dy) < (e.pointerType === 'touch' ? TOUCH_DRAG_THRESHOLD : DRAG_THRESHOLD)) return
          setDragging(true)
          S.suppressClick = true
          I.interact()
          try {
            el.setPointerCapture(e.pointerId)
          } catch {
            /* ignore */
          }
        }
        I.commit({ k: S.start.k, x: S.start.x + dx, y: S.start.y + dy })
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      const rec = S.pointers.get(e.pointerId)
      if (!rec) return
      S.pointers.delete(e.pointerId)
      if (S.pinch && S.pointers.size < 2) {
        // 거의 움직이지 않고 곧바로 뗀 두 손가락 = '두 손가락 탭'(축소) 후보
        if (!S.pinch.moved && e.type === 'pointerup' && performance.now() - S.pinch.t0 < TWO_FINGER_TAP_MS) {
          S.twoTap = { t: performance.now(), x: S.pinch.m0[0], y: S.pinch.m0[1] }
        }
        S.pinch = null
        // 핀치 후 남은 손가락으로 이어서 드래그하지 않도록 기준 갱신
        const rest = Array.from(S.pointers.values())[0]
        if (rest) {
          rest.sx = rest.x
          rest.sy = rest.y
          S.start = { ...S.t }
        }
      }
      if (S.pointers.size === 0) {
        const wasDrag = S.dragging
        setDragging(false)
        if (wasDrag) I.settle()
        if (S.suppressClick) {
          // 직후 발생하는 click 을 막고, 다음 매크로태스크에서 해제
          window.setTimeout(() => {
            S.suppressClick = false
          }, 60)
        }
        const tt = S.twoTap
        S.twoTap = null
        if (tt && e.type === 'pointerup' && performance.now() - tt.t < TWO_FINGER_TAP_MS && Math.hypot(rec.x - rec.sx, rec.y - rec.sy) < TWO_FINGER_TAP_SLOP) {
          I.zoomAtPoint(tt.x, tt.y, TWO_FINGER_TAP_ZOOM, true, TAP_ZOOM_MS)
          return
        }
        if (!wasDrag && e.type === 'pointerup' && e.pointerType !== 'mouse' && !isOnHit(e.target)) {
          const [x, y] = local(e)
          const now = performance.now()
          const lt = S.lastTap
          if (lt && now - lt.t < DOUBLE_TAP_MS && Math.hypot(x - lt.x, y - lt.y) < 40) {
            S.lastTap = null
            S.following = false
            I.zoomAtPoint(x, y, DOUBLE_TAP_ZOOM, true, TAP_ZOOM_MS)
          } else {
            S.lastTap = { t: now, x, y }
          }
        }
      }
    }

    const onClickCapture = (e: MouseEvent) => {
      if (S.suppressClick) {
        e.stopPropagation()
        e.preventDefault()
      }
    }

    const onDblClick = (e: MouseEvent) => {
      if (S.lastType !== 'mouse') return
      if (isOnHit(e.target)) return
      const [x, y] = local(e)
      S.following = false
      I.zoomAtPoint(x, y, DOUBLE_TAP_ZOOM, true, TAP_ZOOM_MS)
    }

    // iOS Safari: 지도 위 두 손가락 동작이 페이지 확대(gesture 이벤트)로 새지 않게 막는다 (pointer 이벤트·탭에는 영향 없음)
    const onGesture = (e: Event) => e.preventDefault()

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      S.following = false
      optsRef.current.onInteract?.()
      const [x, y] = local(e)
      let dy = e.deltaY
      if (e.deltaMode === 1) dy *= 16
      else if (e.deltaMode === 2) dy *= 400
      const discrete = e.deltaMode !== 0 || Math.abs(dy) >= 50
      const factor = Math.exp(-dy * (e.ctrlKey ? 0.012 : discrete ? 0.0016 : 0.0022))
      if (discrete && !e.ctrlKey) I.zoomAtPoint(x, y, factor, true)
      else {
        if (S.raf) {
          cancelAnimationFrame(S.raf)
          S.raf = 0
          S.zoomGoal = null
        }
        I.zoomAtPoint(x, y, factor, false)
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const step = e.shiftKey ? 180 : 70
      let handled = true
      switch (e.key) {
        case 'ArrowLeft':
          I.commit({ ...S.t, x: S.t.x + step })
          break
        case 'ArrowRight':
          I.commit({ ...S.t, x: S.t.x - step })
          break
        case 'ArrowUp':
          I.commit({ ...S.t, y: S.t.y + step })
          break
        case 'ArrowDown':
          I.commit({ ...S.t, y: S.t.y - step })
          break
        case '+':
        case '=':
          api.zoomBy(1.4)
          break
        case '-':
        case '_':
          api.zoomBy(1 / 1.4)
          break
        case '0':
          api.fit()
          break
        default:
          handled = false
      }
      if (handled) {
        e.preventDefault()
        if (e.key.startsWith('Arrow')) {
          S.following = false
          if (S.raf) cancelAnimationFrame(S.raf)
          S.raf = 0
        }
      }
    }

    // 크기 변화: 따라가기 중이면 같은 대상으로 즉시 재맞춤, 아니면 중심 유지
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect
      const prev = S.size
      S.size = { w: cr.width, h: cr.height }
      if (cr.width === 0 || cr.height === 0) return
      const o = optsRef.current
      if (!S.sized) {
        S.sized = true
        const tgt: Target = S.target ?? { bounds: o.initialBounds ?? o.content, opts: { padding: o.fitPadding ?? 24 }, fit: true }
        S.target = tgt
        I.commit(I.targetTransform(tgt), false)
        return
      }
      if (S.following && S.target) {
        api.stop()
        I.commit(I.targetTransform(S.target), false)
      } else if (prev.w > 0 && prev.h > 0) {
        I.commit({ ...S.t, x: S.t.x + (S.size.w - prev.w) / 2, y: S.t.y + (S.size.h - prev.h) / 2 })
      }
    })
    ro.observe(el)

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    el.addEventListener('click', onClickCapture, true)
    el.addEventListener('dblclick', onDblClick)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('keydown', onKeyDown)
    el.addEventListener('gesturestart', onGesture)
    el.addEventListener('gesturechange', onGesture)
    return () => {
      ro.disconnect()
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
      el.removeEventListener('click', onClickCapture, true)
      el.removeEventListener('dblclick', onDblClick)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('keydown', onKeyDown)
      el.removeEventListener('gesturestart', onGesture)
      el.removeEventListener('gesturechange', onGesture)
      api.stop()
      S.sized = false
    }
  }, [api, I])

  // insets 변화 → 따라가기 중이면 같은 대상으로 부드럽게 재맞춤
  const { top, right, bottom, left } = options.insets
  useEffect(() => {
    const S = stRef.current as Internal
    if (S.size.w === 0 || !S.following || !S.target) return
    I.animateView(I.targetTransform(S.target), 420)
  }, [I, top, right, bottom, left])

  return { containerRef, worldRef, api }
}
