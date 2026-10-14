/**
 * features/detail/Gallery.tsx — 사진 갤러리 (SPEC §4.4, §4.6)
 *
 *  · 스와이프(포인터 이벤트: 터치·마우스 드래그) · 좌우 화살표 · 점 인디케이터(8장 초과 시 번호만) · ← → 키보드
 *  · 자동 넘김(autoplay, 기본 off — 투어에서는 4초). 사용자 조작(스와이프·화살표·점·일시정지 버튼)·마우스 호버·포커스 중에는 멈추고,
 *    prefers-reduced-motion 이면 켜지지 않는다. autoplay 중에는 일시정지/재생 버튼을 보여 준다(WCAG 2.2.2).
 *  · 사진 탭 → onOpen(index) (호출 측이 라이트박스를 연다 — PhotoSlot 이 이미 연결해 둔다)
 *  · 이미지는 현재 ±1 장만 마운트(lazy + async decode), 로드 전 스켈레톤, 실패 시 안내 타일(전부 실패 + buildingId 가 있으면 PhotoPlaceholder)
 *  · 캡션(photo.caption)은 사진 아래쪽 그라디언트 위에 표시. photos 가 비면 null (호출 측이 PhotoPlaceholder 를 쓴다)
 *
 * 추가 선택 props(기본 계약 + 확장): onInteract(사용자 조작 알림 — 투어 자동 진행 일시정지용), onIndexChange(index, source),
 *   autoplayLoop(false 이면 마지막 사진에서 자동 넘김 정지), buildingId/roomId(이미지 로드 실패 시 대체 플레이스홀더).
 * 사용처: features/detail/PhotoSlot (시설 상세 · 건물 상세 · 투어 카드).
 */
import { ChevronLeft, ChevronRight, ImageOff, Maximize2, Pause, Play } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { BuildingId, PhotoItem } from '../../data/types'
import { assetUrl } from '../../lib/content'
import { prefersReducedMotion } from '../../lib/env'
import { PhotoPlaceholder } from './PhotoPlaceholder'

export interface GalleryProps {
  photos: PhotoItem[]
  /** 사진 대체 텍스트의 기본값 (예: "본관동 2층 1-1") */
  alt: string
  /** 자동 넘김(기본 off). 투어에서는 4초 간격 */
  autoplay?: boolean
  autoplayMs?: number
  /** 자동 넘김이 마지막 사진 뒤 처음으로 돌아갈지 (기본 true) */
  autoplayLoop?: boolean
  /** 사진 탭 → 라이트박스 */
  onOpen?: (index: number) => void
  /** 사용자가 갤러리를 직접 조작했을 때(스와이프·화살표·점·일시정지) */
  onInteract?: () => void
  /** 보이는 사진이 바뀔 때(자동 넘김 포함) */
  onIndexChange?: (index: number, source: 'user' | 'auto') => void
  /** 모든 이미지가 로드 실패했을 때 대체로 보여 줄 플레이스홀더의 건물/시설 */
  buildingId?: BuildingId
  roomId?: string
  className?: string
}

const DRAG_START_PX = 6
const MAX_DOTS = 8

export function Gallery({
  photos,
  alt,
  autoplay = false,
  autoplayMs = 4000,
  autoplayLoop = true,
  onOpen,
  onInteract,
  onIndexChange,
  buildingId,
  roomId,
  className = '',
}: GalleryProps) {
  const n = photos.length
  const [index, setIndex] = useState(0)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [instant, setInstant] = useState(false)
  const [fade, setFade] = useState(0)
  const [userPaused, setUserPaused] = useState(false)
  const [hold, setHold] = useState(false)
  const [failed, setFailed] = useState<ReadonlySet<number>>(() => new Set())
  const trackRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x0: number; y0: number; lastX: number; lastT: number; vx: number; active: boolean; width: number } | null>(null)
  const suppressClick = useRef(false)
  const reduced = useMemo(() => prefersReducedMotion(), [])

  const sig = useMemo(() => photos.map((p) => p.src).join('|'), [photos])
  useEffect(() => {
    setIndex(0)
    setOffset(0)
    setFailed(new Set())
  }, [sig])
  useEffect(() => {
    if (autoplay) setUserPaused(false)
  }, [autoplay])

  const cur = Math.min(index, Math.max(0, n - 1))
  const multi = n > 1
  const running = autoplay && multi && !userPaused && !hold && !dragging && !reduced && (autoplayLoop || cur < n - 1)

  const interact = useCallback(() => {
    setUserPaused(true)
    onInteract?.()
  }, [onInteract])

  const go = useCallback(
    (to: number, source: 'user' | 'auto') => {
      if (n < 2) return
      const next = ((to % n) + n) % n
      if (source === 'user') interact()
      if (next === cur) return
      if (Math.abs(next - cur) > 1) {
        setInstant(true)
        setFade((f) => f + 1)
      }
      setIndex(next)
      onIndexChange?.(next, source)
    },
    [n, cur, interact, onIndexChange],
  )

  // 먼 거리 이동(처음↔마지막)은 슬라이드 대신 짧은 페이드
  useEffect(() => {
    if (!instant) return
    const r = requestAnimationFrame(() => setInstant(false))
    return () => cancelAnimationFrame(r)
  }, [instant])
  useEffect(() => {
    if (fade === 0 || reduced) return
    trackRef.current?.animate?.([{ opacity: 0.15 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' })
  }, [fade, reduced])

  // 자동 넘김
  useEffect(() => {
    if (!running) return
    const t = window.setTimeout(() => go(cur + 1, 'auto'), Math.max(1200, autoplayMs))
    return () => window.clearTimeout(t)
  }, [running, cur, autoplayMs, go])

  // 이웃 사진 미리 로드
  useEffect(() => {
    if (n < 2) return
    for (const d of [1, -1]) {
      const p = photos[(((cur + d) % n) + n) % n]
      if (p) new Image().src = assetUrl(p.src)
    }
  }, [cur, n, photos])

  // ── 스와이프 (window 리스너는 안정된 함수 + 최신 상태 ref 로 구성) ──
  const latest = useRef({ cur, n, go, interact })
  latest.current = { cur, n, go, interact }
  const swipe = useMemo(() => {
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
    const move = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const dx = e.clientX - d.x0
      const dy = e.clientY - d.y0
      if (!d.active) {
        if (Math.abs(dx) > DRAG_START_PX && Math.abs(dx) > Math.abs(dy) * 1.2) {
          d.active = true
          setDragging(true)
        } else {
          if (Math.abs(dy) > 10) {
            drag.current = null
            stop()
          }
          return
        }
      }
      const now = performance.now()
      d.vx = (e.clientX - d.lastX) / Math.max(1, now - d.lastT)
      d.lastX = e.clientX
      d.lastT = now
      const { cur: c, n: total } = latest.current
      const atEdge = (c === 0 && dx > 0) || (c === total - 1 && dx < 0)
      setOffset(atEdge ? dx * 0.28 : dx)
    }
    const up = (e: PointerEvent) => {
      const d = drag.current
      drag.current = null
      stop()
      if (!d || !d.active) return
      const dx = e.clientX - d.x0
      const { cur: c, n: total, go: goTo, interact: touched } = latest.current
      const fast = Math.abs(d.vx) > 0.4
      const far = Math.abs(dx) > Math.max(44, d.width * 0.18)
      const to = fast || far ? c + (dx < 0 ? 1 : -1) : c
      suppressClick.current = true
      window.setTimeout(() => (suppressClick.current = false), 60)
      setDragging(false)
      setOffset(0)
      if (to !== c && to >= 0 && to < total) goTo(to, 'user')
      else touched()
    }
    const cancel = () => {
      drag.current = null
      stop()
      setDragging(false)
      setOffset(0)
    }
    return { move, up, cancel, stop }
  }, [])
  useEffect(() => swipe.stop, [swipe])

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!multi) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if ((e.target as Element).closest('[data-gal-ctl]')) return
    drag.current = {
      x0: e.clientX,
      y0: e.clientY,
      lastX: e.clientX,
      lastT: performance.now(),
      vx: 0,
      active: false,
      width: rootRef.current?.clientWidth || 320,
    }
    window.addEventListener('pointermove', swipe.move)
    window.addEventListener('pointerup', swipe.up)
    window.addEventListener('pointercancel', swipe.cancel)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!multi) return
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      go(cur - 1, 'user')
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      go(cur + 1, 'user')
    }
  }

  const markFailed = useCallback((i: number) => {
    setFailed((s) => (s.has(i) ? s : new Set(s).add(i)))
  }, [])

  if (n === 0) return null
  if (failed.size >= n && buildingId) {
    return <PhotoPlaceholder buildingId={buildingId} roomId={roomId} label="사진을 불러오지 못했습니다" className={`rounded-card ${className}`} />
  }

  const caption = photos[cur]?.caption
  const aspect = /(^|\s)(aspect-|h-|min-h-)/.test(className) ? '' : 'aspect-[16/9]'
  const showDots = multi && n <= MAX_DOTS
  const hasBottom = !!caption || showDots

  return (
    <div
      ref={rootRef}
      role="region"
      aria-roledescription="carousel"
      aria-label={`${alt} 사진 ${n}장`}
      className={`group relative isolate touch-pan-y select-none overflow-hidden rounded-card bg-paper-2 ${aspect} ${dragging ? 'cursor-grabbing' : ''} ${className}`}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHold(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHold(false)}
      onFocusCapture={(e) => (e.target as Element).matches(':focus-visible') && setHold(true)}
      onBlurCapture={() => setHold(false)}
    >
      <div
        ref={trackRef}
        className="absolute inset-0 flex"
        aria-live={running ? 'off' : 'polite'}
        style={{
          transform: `translate3d(calc(${-cur * 100}% + ${offset}px), 0, 0)`,
          transition: dragging || instant ? 'none' : 'transform 420ms var(--ease-out)',
          willChange: 'transform',
        }}
      >
        {photos.map((p, i) => (
          <Slide
            key={`${p.src}#${i}`}
            photo={p}
            alt={alt}
            i={i}
            n={n}
            active={i === cur}
            mount={Math.abs(i - cur) <= 1}
            eager={i === cur}
            onFail={markFailed}
          />
        ))}
      </div>

      {/* 사진 크게 보기 — 전체 영역을 덮는 투명 버튼 (키보드·스크린리더 접근 경로) */}
      {onOpen && (
        <button
          type="button"
          onClick={() => {
            if (suppressClick.current) return
            onOpen(cur)
          }}
          aria-label={`${alt} 사진 ${multi ? `${cur + 1}/${n} ` : ''}크게 보기`}
          className="absolute inset-0 z-10 cursor-zoom-in rounded-card focus-visible:outline-offset-[-3px]"
        />
      )}

      {hasBottom && <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[11] h-[46%] bg-gradient-to-t from-[rgb(11_18_32/0.62)] via-[rgb(11_18_32/0.2)] to-transparent" aria-hidden="true" />}

      {/* 좌상단: 번호 + 자동 넘김 일시정지 */}
      {multi && (
        <div className="pointer-events-none absolute left-2.5 top-2.5 z-20 flex items-center gap-1.5">
          <span className="tnum rounded-full bg-[rgb(11_18_32/0.5)] px-2.5 py-0.5 text-[0.6875rem] font-semibold tracking-wide text-white backdrop-blur-sm">
            {cur + 1} / {n}
          </span>
          {autoplay && !reduced && (
            <button
              type="button"
              data-gal-ctl
              aria-pressed={userPaused}
              aria-label={userPaused ? '사진 자동 넘김 재생' : '사진 자동 넘김 일시정지'}
              onClick={() => (userPaused ? setUserPaused(false) : interact())}
              className="pointer-events-auto grid h-7 w-7 place-items-center rounded-full bg-[rgb(11_18_32/0.5)] text-white backdrop-blur-sm transition-colors hover:bg-[rgb(11_18_32/0.72)]"
            >
              {userPaused ? <Play size={12} fill="currentColor" aria-hidden="true" /> : <Pause size={12} fill="currentColor" aria-hidden="true" />}
            </button>
          )}
        </div>
      )}

      {/* 우상단: 크게 보기 힌트 */}
      {onOpen && (
        <span className="pointer-events-none absolute right-2.5 top-2.5 z-20 grid h-7 w-7 place-items-center rounded-full bg-[rgb(11_18_32/0.5)] text-white backdrop-blur-sm" aria-hidden="true">
          <Maximize2 size={13} />
        </span>
      )}

      {/* 좌우 화살표 */}
      {multi && (
        <>
          <Arrow dir="prev" label={`이전 사진 (${((cur - 1 + n) % n) + 1}/${n})`} onClick={() => go(cur - 1, 'user')} />
          <Arrow dir="next" label={`다음 사진 (${((cur + 1) % n) + 1}/${n})`} onClick={() => go(cur + 1, 'user')} />
        </>
      )}

      {/* 하단: 캡션 + 점 */}
      {hasBottom && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end gap-3 px-3.5 pb-2.5 pt-6">
          {caption ? <p className="min-w-0 flex-1 text-[0.8125rem] font-medium leading-snug text-white [text-shadow:0_1px_6px_rgb(0_0_0/0.45)] line-clamp-2">{caption}</p> : <span className="flex-1" />}
          {showDots && (
            <div className="pointer-events-auto -mb-0.5 flex shrink-0 items-center" role="group" aria-label="사진 선택">
              {photos.map((p, i) => (
                <button
                  key={`${p.src}#${i}`}
                  type="button"
                  data-gal-ctl
                  onClick={() => go(i, 'user')}
                  aria-label={`사진 ${i + 1}번 보기`}
                  aria-current={i === cur ? 'true' : undefined}
                  className="group/dot grid h-6 w-5 place-items-center"
                >
                  <span className={`block h-1.5 rounded-full bg-white transition-[width,opacity] duration-280 ${i === cur ? 'w-4 opacity-100' : 'w-1.5 opacity-55 group-hover/dot:opacity-90'}`} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Arrow({ dir, label, onClick }: { dir: 'prev' | 'next'; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      data-gal-ctl
      onClick={onClick}
      aria-label={label}
      className={`absolute top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center transition-opacity duration-180 ${
        dir === 'prev' ? 'left-0.5' : 'right-0.5'
      } [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100`}
    >
      <span className="grid h-8 w-8 place-items-center rounded-full bg-[rgb(11_18_32/0.5)] text-white backdrop-blur-sm transition-colors hover:bg-[rgb(11_18_32/0.78)]">
        {dir === 'prev' ? <ChevronLeft size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
      </span>
    </button>
  )
}

interface SlideProps {
  photo: PhotoItem
  alt: string
  i: number
  n: number
  active: boolean
  mount: boolean
  eager: boolean
  onFail: (i: number) => void
}

function Slide({ photo, alt, i, n, active, mount, eager, onFail }: SlideProps) {
  const [loaded, setLoaded] = useState(false)
  const [bad, setBad] = useState(false)
  const ref = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el && el.complete && el.naturalWidth > 0) setLoaded(true)
  }, [mount])

  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-label={`${i + 1} / ${n}`}
      aria-hidden={active ? undefined : true}
      className="relative h-full w-full shrink-0 grow-0 basis-full"
    >
      {!loaded && !bad && <div className="absolute inset-0 animate-pulse bg-paper-3/70" aria-hidden="true" />}
      {mount && !bad && (
        <img
          ref={ref}
          src={assetUrl(photo.src)}
          alt={photo.caption || `${alt} 사진 ${i + 1}`}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setBad(true)
            onFail(i)
          }}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-420 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      {bad && (
        <div className="absolute inset-0 grid place-items-center bg-paper-2 text-center text-ink-mute">
          <div className="grid justify-items-center gap-1.5 px-6">
            <ImageOff size={22} strokeWidth={1.5} aria-hidden="true" />
            <span className="text-[0.8125rem]">사진을 불러오지 못했습니다</span>
          </div>
        </div>
      )}
    </div>
  )
}
