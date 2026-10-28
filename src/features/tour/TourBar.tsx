/**
 * features/tour/TourBar.tsx — 추천 투어 패널 (SPEC §4.6)
 *
 * 렌더 위치(ui/Shell.tsx): `tour.active` 이면 상세 패널 슬롯 전체 — 데스크톱 SidePanel(420px) / 모바일 BottomSheet(peek·half·full).
 *  - layout='sheet' : 투어는 콤팩트 peek 로 열린다 — 시트 높이 = 핸들 + 머리글 블록("n/N · 자동 진행 · 닫기 / ‹ 지점명 · 위치 › / 진행 바(단계 점)").
 *                     머리글 높이는 onPeekHeight 로 Shell 에 알려 시트 peek 높이·지도 insets 에 쓴다(교실 부제 한 줄이 있으면 그만큼 커진다).
 *                     본문(안내 문구 → 사진 → 전체 지점)은 시트를 half·full 로 끌어 올리면 보인다.
 *  - layout='panel' : 머리글 → 큰 단계 번호 + 자동 진행 + 진행 바 → 사진 → 안내 → 이전/다음 → 전체 지점.
 *
 * 동작
 *  - 진행 바: 가는 선 위의 단계 점(탭하면 그 지점으로). 자동 진행 중에는 현재 점에서 다음 점으로 12초 동안 금빛 선이 차오른다.
 *  - 단계 이동 → store.tourGoTo/Next/Prev 가 지도를 건물 → 층 → 방 강조로 이동시킨다(여기서는 호출만).
 *  - 자동 진행(12초, 사진 4초) · 사용자 조작 시 일시정지는 useTour 엔진이 담당. 사진/지도를 만지면 멈춘다.
 *  - 마지막 지점: "투어 마치기"(→ 자유 탐색) + 처음부터 다시. 이동 경로·거리·소요 시간은 표시하지 않는다.
 *  - 접근성: 단계 안내는 role="status" aria-live, 점은 aria-current="step", 자동 진행은 role="switch".
 *    투어 중 ←/→ 키로 이전/다음(포커스가 본문·투어 컨트롤일 때만 — 지도 키보드 이동과 충돌하지 않게).
 *  - 학생 안내 장소: 번호는 지도 ★ 번호(출발 지점 = "출발"), 제목은 안내 이름(label). 시설명이 다르면 부제에 함께 적는다.
 */
import { Check, ChevronDown, ChevronLeft, ChevronRight, ListOrdered, Pause, Play, RotateCcw, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { assetUrl, photosFor, useContent } from '../../lib/content'
import { prefersReducedMotion } from '../../lib/env'
import { useAppStore } from '../../store/useAppStore'
import { PanelHeader } from '../../ui/PanelHeader'
import { PhotoSlot } from '../detail/PhotoSlot'
import { SpotMark } from './SpotChip'
import { autoplayElapsedMs, TOUR_PHOTO_MS, TOUR_STEP_MS, useTour, type ResolvedStop, type TourApi } from './useTour'

export interface TourBarProps {
  /** 'panel' = 데스크톱 사이드 패널 안, 'sheet' = 모바일 바텀 시트 안 */
  layout: 'panel' | 'sheet'
  /** sheet 전용: 머리글 블록(TOUR n/N · 지점명 · 위치 · 이전/다음 · 진행 점)의 높이(px) — 시트가 이 높이로 peek 한다 */
  onPeekHeight?: (headerPx: number) => void
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 스크린리더가 변화를 확실히 읽도록 약간 늦게 채운다 */
function useDeferredText(text: string, ms = 120): string {
  const [v, setV] = useState('')
  useEffect(() => {
    if (!text) {
      setV('')
      return
    }
    const id = window.setTimeout(() => setV(text), ms)
    return () => window.clearTimeout(id)
  }, [text, ms])
  return v
}

export function TourBar({ layout, onPeekHeight }: TourBarProps) {
  const t = useTour()
  const contentStatus = useContent((s) => s.status)
  const facilities = useContent((s) => s.facilities)
  const photos = useContent((s) => s.photos)
  const cur = t.current
  const pics = useMemo(() => photosFor(photos, cur?.roomId), [photos, cur?.roomId])
  const live = useDeferredText(t.active ? t.announce : '')

  // 다음 지점의 첫 사진을 미리 받아 둔다 (자동 진행 중 깜빡임 방지)
  useEffect(() => {
    if (!t.active) return
    const nx = t.stops.find((s) => s.index === t.index + 1)
    const p = nx ? photos[nx.roomId]?.[0] : undefined
    if (p) {
      const img = new Image()
      img.decoding = 'async'
      img.src = assetUrl(p.src)
    }
  }, [t.active, t.index, t.stops, photos])

  // ←/→ : 이전/다음 지점 (본문이나 투어 컨트롤에 포커스가 있을 때만)
  const { next, prev } = t
  useEffect(() => {
    if (!t.active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      const a = document.activeElement
      const free = !a || a === document.body || (a instanceof Element && !!a.closest('[data-tour-keys]'))
      if (!free) return
      const st = useAppStore.getState()
      if (st.search.open || st.ui.aboutOpen || st.ui.intro) return
      e.preventDefault()
      if (e.key === 'ArrowRight') next()
      else prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [t.active, next, prev])

  if (!t.active) return null
  const isSheet = layout === 'sheet'

  if (t.total === 0 || !cur) {
    return (
      <section aria-label="안내 코스" data-layout={layout}>
        <PanelHeader eyebrow="Campus Course" title={t.title || '안내 코스'} onClose={t.end} closeLabel="투어 종료" />
        <div className="px-5 pb-6">
          <p className="text-[0.9375rem] leading-relaxed text-ink-soft">
            {t.total === 0 ? (contentStatus === 'ready' ? '안내 코스를 준비하고 있습니다.' : '투어 정보를 불러오는 중입니다…') : '이 지점의 정보를 찾을 수 없습니다.'}
          </p>
          <div className="mt-4 flex gap-2">
            {t.total > 0 && (
              <button type="button" className="btn btn-ghost" onClick={t.next}>
                다음 지점
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={t.end}>
              자유롭게 둘러보기
            </button>
          </div>
        </div>
      </section>
    )
  }

  const summary = facilities[cur.roomId]?.summary ?? ''
  const nextStop = t.stops.find((s) => s.index === t.index + 1) ?? null
  const alt = `${cur.locationText} ${cur.name}`

  const photo = (
    // 사진을 만지면(스와이프·탭·키) 자동 진행을 멈춘다
    <div key={cur.roomId} onPointerDownCapture={t.pause} onKeyDownCapture={t.pause} className="overflow-hidden rounded-card shadow-soft">
      <PhotoSlot
        photos={pics}
        alt={alt}
        buildingId={cur.buildingId}
        roomId={cur.roomId}
        autoplay={t.autoplay}
        autoplayMs={TOUR_PHOTO_MS}
        autoplayLoop={false}
        onInteract={t.pause}
      />
    </div>
  )

  const info = (
    <div className={isSheet ? '' : 'mt-4'}>
      {(cur.no !== null || cur.start) && (
        <div className="mb-3 flex items-center gap-2.5 rounded-card border border-gold-200 bg-gold-50 px-3 py-2.5">
          <SpotMark spot={cur} size={28} />
          <p className="min-w-0 text-[0.875rem] leading-snug text-ink">
            {cur.start ? (
              <>
                <b className="font-bold">출발 지점</b> · 여기에서 코스를 시작합니다
              </>
            ) : (
              <>
                <b className="font-bold">학생 안내 장소 {cur.no}</b> · 재학생이 이곳에서 직접 안내합니다
              </>
            )}
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <span className="chip">{cur.categoryLabel}</span>
        {cur.conf === 'medium' && <span className="chip border-gold-200 bg-gold-50 text-gold-deep">명칭 대응 검토 중</span>}
      </div>
      {cur.note ? (
        <figure className="relative mt-3 rounded-card border border-line bg-white py-3.5 pl-5 pr-4 shadow-soft">
          <span className="absolute bottom-3.5 left-0 top-3.5 w-[3px] rounded-full bg-gold" aria-hidden="true" />
          <figcaption className="eyebrow mb-1 text-gold-deep">About this stop · 안내</figcaption>
          <p className="text-[0.9375rem] leading-relaxed text-ink [text-wrap:pretty]">{cur.note}</p>
        </figure>
      ) : (
        !summary && <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-mute">학교에서 소개 내용을 준비하고 있습니다.</p>
      )}
      {summary && <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-soft [text-wrap:pretty]">{summary}</p>}
    </div>
  )

  return (
    <section aria-label="안내 코스" data-layout={layout}>
      <div className="sr-only-live" role="status" aria-live="polite" aria-atomic="true">
        {live}
      </div>
      <span id="tour-autoplay-help" className="sr-only-live">
        자동 진행을 켜면 지점마다 {TOUR_STEP_MS / 1000}초 뒤 다음 지점으로 이동합니다. 지도나 사진을 조작하면 멈춥니다.
      </span>

      {isSheet ? <SheetHeader t={t} cur={cur} nextStop={nextStop} onPeekHeight={onPeekHeight} /> : <PanelTop t={t} cur={cur} />}

      <div className="px-5 pb-6">
        {isSheet ? (
          <>
            <div className="mt-3">{info}</div>
            <div className="mt-4">{photo}</div>
          </>
        ) : (
          <>
            {photo}
            {info}
            <Controls t={t} nextStop={nextStop} />
          </>
        )}

        {t.isLast && <FinishCard t={t} />}
        <StopList t={t} />

        <button type="button" onClick={t.end} className="mt-4 inline-flex min-h-[2.75rem] items-center gap-1.5 text-[0.8125rem] font-semibold text-ink-mute transition-colors hover:text-navy">
          <X size={14} aria-hidden="true" /> 투어 종료 · 자유 탐색
        </button>
      </div>

    </section>
  )
}

// ───────────────────────────── 머리글 ─────────────────────────────

function SheetHeader({
  t,
  cur,
  nextStop,
  onPeekHeight,
}: {
  t: TourApi
  cur: ResolvedStop
  nextStop: ResolvedStop | null
  onPeekHeight?: (headerPx: number) => void
}) {
  // 시트의 콤팩트(peek) 높이 = 핸들 + 이 머리글. 글자 크기·교실 부제 유무에 따라 달라지므로 실제 높이를 알린다
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !onPeekHeight) return
    const report = () => onPeekHeight(Math.ceil(el.getBoundingClientRect().height))
    report()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [onPeekHeight])

  return (
    // 시트를 스크롤해 본문을 읽는 동안에도 이전/다음·진행 바가 항상 손에 닿도록 머리글을 고정한다
    <div ref={ref} data-sheet-drag className="sticky top-0 z-10 bg-surface/[0.97] px-5 pb-1 pt-0.5">
      <div className="flex h-11 items-center gap-2">
        <span className="eyebrow text-gold-deep">Tour</span>
        <span className="font-display text-[1.25rem] font-semibold leading-none text-navy lining-nums tabular-nums">
          {pad(t.index + 1)}
          <span className="text-ink-mute"> / {pad(t.total)}</span>
        </span>
        <div className="ml-auto flex items-center gap-1">
          <AutoplayToggle t={t} compact />
          <button
            type="button"
            onClick={t.end}
            aria-label="투어 종료"
            className="-mr-2.5 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-mute transition-colors hover:bg-paper-2 hover:text-ink"
          >
            <X size={20} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2" data-tour-keys>
        <NavButton dir="prev" t={t} />
        <div data-sheet-drag className="min-w-0 flex-1 px-1 text-center">
          <h2 className="truncate text-[1.0625rem] font-bold leading-tight text-ink" title={cur.name}>
            {cur.name}
          </h2>
          <p className="mt-0.5 flex items-center justify-center gap-1.5 truncate text-[0.8125rem] leading-snug text-ink-mute">
            <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: cur.buildingColor }} aria-hidden="true" />
            {cur.locationText}
          </p>
          {cur.classroomLabel && <p className="truncate text-[0.75rem] leading-snug text-ink-soft">{cur.classroomLabel}</p>}
        </div>
        <NavButton dir="next" t={t} nextStop={nextStop} />
      </div>

      <StepDots t={t} />
    </div>
  )
}

function PanelTop({ t, cur }: { t: TourApi; cur: ResolvedStop }) {
  return (
    <>
      <PanelHeader
        eyebrow="Recommended Tour"
        title={cur.name}
        subtitle={
          <>
            {cur.locationText}
            {cur.sub && <span className="text-ink-mute"> · {cur.sub}</span>}
            {cur.classroomLabel && <span className="mt-0.5 block text-ink-soft">{cur.classroomLabel}</span>}
          </>
        }
        accent={cur.buildingColor}
        onClose={t.end}
        closeLabel="투어 종료"
      />
      <div className="px-5 pb-3">
        <div className="mb-1 flex items-end justify-between gap-3">
          <div>
            <div className="font-display leading-none lining-nums tabular-nums">
              <span className="text-[2.25rem] font-semibold text-navy">{pad(t.index + 1)}</span>
              <span className="ml-1.5 text-[1.0625rem] text-ink-mute">/ {pad(t.total)}</span>
            </div>
            <div className="mt-1.5 text-[0.75rem] text-ink-mute">{t.title}</div>
          </div>
          <AutoplayToggle t={t} />
        </div>
        <StepDots t={t} />
      </div>
    </>
  )
}

// ───────────────────────────── 부품 ─────────────────────────────

function NavButton({ dir, t, nextStop }: { dir: 'prev' | 'next'; t: TourApi; nextStop?: ResolvedStop | null }) {
  const common = 'grid h-11 w-11 shrink-0 place-items-center rounded-full transition-[background-color,box-shadow,transform,opacity] duration-180 active:scale-95'
  if (dir === 'prev') {
    return (
      <button
        type="button"
        onClick={t.prev}
        aria-disabled={t.isFirst}
        aria-label="이전 지점"
        className={`${common} border border-sky-200 bg-white text-navy hover:border-primary/45 hover:bg-sky-50 ${t.isFirst ? 'cursor-not-allowed opacity-40' : ''}`}
      >
        <ChevronLeft size={21} strokeWidth={1.9} />
      </button>
    )
  }
  return t.isLast ? (
    <button type="button" onClick={t.finish} aria-label="투어 마치기, 자유 탐색으로" className={`${common} bg-primary text-white shadow-[0_6px_16px_-6px_rgb(var(--primary)/0.5)] hover:bg-primary-hover`}>
      <Check size={21} strokeWidth={2.1} />
    </button>
  ) : (
    <button
      type="button"
      onClick={t.next}
      aria-label={nextStop ? `다음 지점, ${nextStop.name}` : '다음 지점'}
      className={`${common} bg-primary text-white shadow-[0_6px_16px_-6px_rgb(var(--primary)/0.5)] hover:bg-primary-hover`}
    >
      <ChevronRight size={21} strokeWidth={1.9} />
    </button>
  )
}

function AutoplayToggle({ t, compact = false }: { t: TourApi; compact?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={t.autoplay}
      aria-label="자동 진행"
      aria-describedby="tour-autoplay-help"
      title={`자동 진행 — ${TOUR_STEP_MS / 1000}초마다 다음 지점`}
      onClick={t.toggleAutoplay}
      className={`relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[0.8125rem] font-semibold transition-colors duration-180 before:absolute before:-inset-1.5 before:content-[''] ${
        t.autoplay ? 'border-primary/40 bg-primary-soft text-primary-hover' : 'border-sky-200 bg-white text-navy hover:border-primary/45 hover:bg-sky-50'
      }`}
    >
      {t.autoplay ? <Pause size={13} fill="currentColor" aria-hidden="true" /> : <Play size={13} fill="currentColor" aria-hidden="true" />}
      <span>{compact ? '자동' : '자동 진행'}</span>
    </button>
  )
}

/** 가는 선 위의 단계 점. 자동 진행 중에는 현재 점 → 다음 점 구간에 금빛 선이 12초 동안 차오른다 */
function StepDots({ t }: { t: TourApi }) {
  const n = t.total
  const byIndex = useMemo(() => new Map(t.stops.map((s) => [s.index, s])), [t.stops])
  const edge = `${50 / n}%`
  return (
    <div className="relative h-7" role="group" aria-label={`투어 진행 — 전체 ${n}곳 중 ${t.index + 1}번째`} data-tour-keys>
      <span className="absolute h-[2px] rounded-full bg-line-strong/70" style={{ left: edge, right: edge, top: 'calc(50% - 1px)' }} aria-hidden="true" />
      <span
        className="absolute h-[2px] rounded-full bg-primary transition-[width] duration-[420ms] ease-out"
        style={{ left: edge, width: `${(t.index / n) * 100}%`, top: 'calc(50% - 1px)' }}
        aria-hidden="true"
      />
      <Countdown running={t.autoplay && t.index < n - 1} k={t.index} left={`${((t.index + 0.5) / n) * 100}%`} width={`${100 / n}%`} />
      <ol className="relative z-10 flex h-full">
        {Array.from({ length: n }, (_, i) => {
          const st = byIndex.get(i)
          const isCur = i === t.index
          const passed = i < t.index
          return (
            <li key={i} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => t.goTo(i)}
                aria-label={`${i + 1}번째 지점${st ? ` ${st.name}` : ''}`}
                aria-current={isCur ? 'step' : undefined}
                title={st ? `${i + 1}. ${st.name}` : undefined}
                className="group grid h-full w-full place-items-center"
              >
                <span
                  className={`block rounded-full transition-[transform,background-color,border-color,box-shadow] duration-[280ms] ease-out ${
                    isCur
                      ? 'h-3.5 w-3.5 bg-gold shadow-[0_0_0_2px_rgb(var(--surface)),0_0_0_3.5px_rgb(var(--primary))]'
                      : passed
                        ? 'h-2 w-2 bg-primary group-hover:scale-150'
                        : 'h-2 w-2 border border-line-strong bg-surface group-hover:scale-150 group-hover:border-primary'
                  }`}
                />
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** 현재 점에서 다음 점까지 TOUR_STEP_MS 동안 차오르는 선 (Web Animations API — 모션 최소화 설정이면 그리지 않는다) */
function Countdown({ running, k, left, width }: { running: boolean; k: number; left: string; width: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !running || prefersReducedMotion() || typeof el.animate !== 'function') return
    const anim = el.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: TOUR_STEP_MS, easing: 'linear', fill: 'forwards' })
    anim.currentTime = autoplayElapsedMs() // 렌더가 늦어져도 타이머와 같은 시계로 맞춘다
    return () => anim.cancel()
  }, [running, k])
  return (
    <span
      ref={ref}
      className="absolute h-[2px] origin-left rounded-full bg-gold"
      style={{ left, width, top: 'calc(50% - 1px)', visibility: running ? 'visible' : 'hidden', transform: 'scaleX(0)' }}
      aria-hidden="true"
    />
  )
}

function Controls({ t, nextStop }: { t: TourApi; nextStop: ResolvedStop | null }) {
  return (
    <div className="mt-5" data-tour-keys>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={t.prev}
          aria-disabled={t.isFirst}
          aria-label="이전 지점"
          className={`btn btn-ghost w-12 shrink-0 px-0 ${t.isFirst ? 'cursor-not-allowed opacity-40' : ''}`}
        >
          <ChevronLeft size={20} strokeWidth={1.9} />
        </button>
        {t.isLast ? (
          <button type="button" className="btn btn-primary flex-1" onClick={t.finish}>
            <Check size={18} strokeWidth={2.1} aria-hidden="true" /> 투어 마치기 · 자유 탐색
          </button>
        ) : (
          <button type="button" className="btn btn-primary flex-1" onClick={t.next}>
            다음 지점 <ChevronRight size={18} strokeWidth={1.9} aria-hidden="true" />
          </button>
        )}
      </div>
      {nextStop && (
        <p className="mt-2.5 truncate text-center text-[0.75rem] text-ink-mute">
          다음 · <span className="font-semibold text-ink-soft">{nextStop.name}</span> ({nextStop.locationText})
        </p>
      )}
    </div>
  )
}

function FinishCard({ t }: { t: TourApi }) {
  return (
    <div className="mt-5 rounded-card border border-mint-200 bg-gradient-to-br from-mint-50 to-white p-4 text-navy shadow-soft">
      <div className="eyebrow text-mint-ink">Tour complete</div>
      <p className="mt-1 text-[1rem] font-semibold">추천 투어를 모두 둘러보셨어요</p>
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-soft">이제 지도를 자유롭게 탐색해 보세요. 궁금한 곳은 검색으로 바로 찾을 수 있어요.</p>
      <button
        type="button"
        onClick={t.restart}
        className="mt-3 inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-full border border-mint-200 bg-white px-4 text-[0.875rem] font-semibold text-navy transition-colors hover:bg-mint-50"
      >
        <RotateCcw size={15} aria-hidden="true" /> 처음부터 다시
      </button>
    </div>
  )
}

function StopList({ t }: { t: TourApi }) {
  return (
    <details className="group mt-5 overflow-hidden rounded-card border border-line bg-white shadow-soft">
      <summary className="flex min-h-[2.75rem] cursor-pointer list-none items-center gap-2 px-4 text-[0.875rem] font-semibold text-ink-soft [&::-webkit-details-marker]:hidden">
        <ListOrdered size={16} aria-hidden="true" />
        전체 지점 <span className="tnum font-normal text-ink-mute">{t.total}곳</span>
        <ChevronDown size={16} className="ml-auto text-ink-mute transition-transform duration-180 group-open:rotate-180" aria-hidden="true" />
      </summary>
      <ol className="border-t border-line py-1" data-tour-keys>
        {t.stops.map((s) => {
          const isCur = s.index === t.index
          return (
            <li key={s.index}>
              <button
                type="button"
                onClick={() => t.goTo(s.index)}
                aria-current={isCur ? 'step' : undefined}
                className={`flex min-h-[2.75rem] w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-sky-50 ${isCur ? 'bg-primary-soft/60' : ''}`}
              >
                <span
                  className={`tnum grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.75rem] font-bold ${isCur ? 'bg-primary text-white' : 'bg-paper-2 text-ink-soft'}`}
                  aria-hidden="true"
                >
                  {s.index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.875rem] font-semibold text-ink">{s.name}</span>
                  <span className="block truncate text-[0.75rem] text-ink-mute">{s.locationText}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </details>
  )
}
