/**
 * features/event/EventPanel.tsx — 입학설명회 안내 패널 (#/event · #/event/<n>)
 *
 * 렌더 위치(ui/Shell.tsx): 안내 모드(event.active)로 캠퍼스 지도를 볼 때의 패널 슬롯 — 데스크톱 SidePanel / 모바일 BottomSheet(half).
 *  · 전체 안내: 날짜 배지 · 제목 · 부제 · 범례 → 출발 카드(체육관) → ★ 장소를 건물별로 묶은 목록(큰 터치 줄) → "순서대로 따라가기"
 *  · 장소 상세: "← 전체 안내" · ★n + 이름 · 위치(건물·층) · 층 구성 도해(FloorStack) · 찾아가는 방법(번호 단계) · 같은 건물의 다른 장소 · 평면도/이전·다음
 *
 * 내용은 모두 tour.json(+ floors.json)에서 온다 — 이름·층·안내 문구·찾아가는 방법·머리말을 화면이 지어내지 않는다.
 * 접근성: 목록 줄은 버튼(spotAria), 지도의 카드는 aria-hidden 복제본. 장소가 바뀌면 aria-live 로 알리고, ←/→ 이전·다음, Esc 전체 안내(Shell).
 */
import { CalendarDays, ChevronLeft, ChevronRight, Layers, MapPin, Navigation2, Route, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { floorLabel, getBuilding } from '../../data'
import { tint } from '../../lib/color'
import { DEFAULT_EVENT_TITLE, photosFor, useContent } from '../../lib/content'
import { dropUnknownEventSpot, useAppStore } from '../../store/useAppStore'
import { PhotoSlot } from '../detail/PhotoSlot'
import { SpotMark } from '../tour/SpotChip'
import { spotAria, useSpots, type Spot, type SpotIndex } from '../tour/spots'
import {
  eventLegend,
  groupStarsByBuilding,
  officialName,
  siblingsOf,
  spotByNo,
  spotNoOf,
  stepSpot,
  STRAIGHT_LINE_CAPTION,
  straightLineText,
  type SpotGroup,
} from './eventModel'
import { useEventUi } from './eventUi'
import { FloorStack } from './FloorStack'
import { useStraightLine } from './useStraightLine'

export function EventPanel() {
  const spotNo = useAppStore((s) => s.event.spotNo)
  const spots = useSpots()
  const ready = useContent((s) => s.status === 'ready')
  const spot = spotByNo(spots, spotNo)
  const rootRef = useRef<HTMLDivElement>(null)

  // 패널이 사라질 때(안내 모드 종료·평면도 등) 목록 줄의 hover 강조가 지도 카드에 남지 않게
  useEffect(() => () => useEventUi.getState().setHover(null), [])

  // 장소가 바뀌면 패널(스크롤 컨테이너) 맨 위로
  useLayoutEffect(() => {
    rootRef.current?.closest<HTMLElement>('.scroll-y, .sheet-scroll')?.scrollTo({ top: 0 })
  }, [spotNo])

  // 장소가 바뀌면 포커스를 새 제목으로 — 누른 버튼이 사라져 포커스가 body 로 떨어지는 것을 막는다(키보드·스크린리더).
  // 사용자가 지도 등 패널 밖에 포커스를 두고 있으면 건드리지 않는다. 첫 렌더는 제외.
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    const a = document.activeElement
    if (a && a !== document.body && !rootRef.current?.contains(a)) return
    rootRef.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
  }, [spotNo])

  // ←/→ : 이전/다음 장소 (본문·패널 컨트롤에 포커스가 있거나 아무 곳에도 없을 때만 — 지도 키보드 이동과 충돌하지 않게)
  useEffect(() => {
    if (!spot) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      const a = document.activeElement
      const free = !a || a === document.body || (a instanceof Element && !!a.closest('[data-event-keys]'))
      if (!free) return
      const st = useAppStore.getState()
      if (st.search.open || st.ui.aboutOpen || st.ui.intro || st.gps.status === 'consent') return
      e.preventDefault()
      st.eventStep(e.key === 'ArrowRight' ? 1 : -1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [spot])

  // 콘텐츠가 로드됐는데 없는 번호면 전체 안내로 (hash #/event/99 등) — 스토어(dropUnknownEventSpot)가 주소를 '교체'해 뒤로 가기 고리를 막는다
  const unknown = ready && spotNo !== null && !spot
  useEffect(() => {
    if (unknown) dropUnknownEventSpot()
  }, [unknown])

  const announce = spot ? `${spotAria(spot)}, ${spot.locationText}` : '입학설명회 안내 전체 목록'

  return (
    <div ref={rootRef} data-event-keys>
      {spot ? <EventDetail spot={spot} spots={spots} /> : <EventOverview spots={spots} loaded={ready} />}
      <div className="sr-only-live" role="status" aria-live="polite" aria-atomic="true">
        {announce}
      </div>
    </div>
  )
}

// ───────────────────────────── 전체 안내 ─────────────────────────────

export function DateBadge({ date, className = '' }: { date: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-gold/60 bg-gradient-to-b from-star-soft to-gold-soft py-1 pl-2 pr-3 text-[0.8125rem] font-bold leading-none text-gold-deep shadow-[0_1px_0_rgb(255_255_255/0.7)_inset,0_2px_6px_-2px_rgb(184_144_47/0.45)] ${className}`}
    >
      <CalendarDays size={14} strokeWidth={2} aria-hidden="true" />
      <span className="tnum">{date}</span>
    </span>
  )
}
function EventOverview({ spots, loaded }: { spots: SpotIndex; loaded: boolean }) {
  const event = useContent((s) => s.tour.event)
  const openEvent = useAppStore((s) => s.openEvent)
  const startTour = useAppStore((s) => s.startTour)
  const closePanel = useAppStore((s) => s.closePanel)
  const groups = useMemo(() => groupStarsByBuilding(spots), [spots])
  const start = spots.start
  const startNote = useContent((s) => (spots.start ? s.tour.stops[spots.start.index]?.note : '') ?? '')
  const title = event?.title || DEFAULT_EVENT_TITLE
  const legend = eventLegend(startNote)

  return (
    <section aria-labelledby="ev-title">
      <header data-sheet-drag className="relative px-5 pb-3 pt-2 lg:pt-6">
        <button
          type="button"
          onClick={closePanel}
          aria-label="안내 패널 닫기 (지도는 안내 모드 그대로)"
          title="패널 닫기"
          className="absolute right-2.5 top-1 grid h-11 w-11 place-items-center rounded-full text-ink-mute transition-colors hover:bg-paper-2 hover:text-ink lg:top-4"
        >
          <X size={20} strokeWidth={1.8} />
        </button>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pr-10">
          {event?.date && <DateBadge date={event.date} />}
          <span className="eyebrow text-gold-deep">Student Guide</span>
        </div>
        <h2 id="ev-title" tabIndex={-1} className="mt-2.5 text-[1.625rem] font-extrabold leading-[1.15] tracking-[-0.035em] text-navy outline-none focus:shadow-none">
          {title}
        </h2>
        {event?.subtitle && <p className="mt-1.5 text-[0.9375rem] leading-snug text-ink-soft [text-wrap:balance]">{event.subtitle}</p>}
        <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-star-deep/30 bg-star-soft/60 py-1 pl-1.5 pr-3 text-[0.8125rem] font-bold text-ink">
          <SpotMark spot={{ no: 1 }} size={20} />
          {legend}
        </p>
      </header>

      <div className="px-4 pb-8">
        {!start && groups.length === 0 ? (
          <p className="px-1 py-6 text-[0.9375rem] leading-relaxed text-ink-soft">{loaded ? '안내 장소를 준비하고 있습니다.' : '안내 장소를 불러오는 중입니다…'}</p>
        ) : (
          <>
            {start && <StartCard spot={start} note={startNote} onOpen={() => openEvent(spotNoOf(start))} />}

            <ul className="mt-3 grid gap-3" aria-label="건물별 안내 장소">
              {groups.map((g) => (
                <li key={g.buildingId}>
                  <GroupCard group={g} onOpen={(s) => openEvent(spotNoOf(s))} />
                </li>
              ))}
            </ul>

            <button type="button" onClick={() => startTour(0)} className="btn btn-ghost mt-4 min-h-[3rem] w-full">
              <Route size={18} strokeWidth={1.9} aria-hidden="true" />
              순서대로 따라가기
            </button>
            <p className="mt-4 text-[0.75rem] leading-relaxed text-ink-mute">
              지도에서 ★ 번호나 장소 이름을 눌러도 됩니다. 위치는 학교 도면 기준이며 실제와 일부 다를 수 있습니다.
            </p>
          </>
        )}
      </div>
    </section>
  )
}

function StartCard({ spot, note, onOpen }: { spot: Spot; note: string; onOpen: () => void }) {
  const setHover = useEventUi((s) => s.setHover)
  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerEnter={() => setHover(spot.roomId)}
      onPointerLeave={() => setHover(null)}
      onFocus={() => setHover(spot.roomId)}
      onBlur={() => setHover(null)}
      aria-label={`${spotAria(spot)}, ${spot.locationText}`}
      className="group relative block w-full overflow-hidden rounded-card bg-gradient-to-br from-navy to-navy-700 p-4 text-left text-white shadow-soft transition-[transform,box-shadow] duration-180 hover:shadow-float active:scale-[0.99]"
    >
      <span className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgb(var(--star)/0.3),transparent_68%)]" aria-hidden="true" />
      <span className="flex items-center gap-3.5">
        <SpotMark spot={spot} size={44} className="drop-shadow" />
        <span className="min-w-0 flex-1">
          <span className="eyebrow block !text-[0.6875rem] text-star">Start · 출발</span>
          <span className="mt-0.5 block text-[1.25rem] font-extrabold leading-tight tracking-[-0.02em]">{spot.label}</span>
          <span className="mt-0.5 block text-[0.8125rem] font-medium text-white/80">{spot.locationText}</span>
        </span>
        <ChevronRight size={20} className="shrink-0 text-white/70 transition-transform duration-180 group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
      {note && <span className="mt-3 block border-t border-white/15 pt-2.5 text-[0.875rem] leading-relaxed text-white/90 [text-wrap:pretty]">{note}</span>}
    </button>
  )
}

function GroupCard({ group, onOpen }: { group: SpotGroup; onOpen: (s: Spot) => void }) {
  const { building, spots } = group
  const setHover = useEventUi((s) => s.setHover)
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface/80 shadow-soft" aria-label={`${building.name} 안내 장소 ${spots.length}곳`}>
      <header className="flex items-center gap-2.5 px-3.5 py-2" style={{ background: tint(building.color, 0.16), borderBottom: '1px solid rgb(var(--line) / 0.9)' }}>
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full font-display text-[0.8125rem] font-semibold text-white" style={{ background: building.color }} aria-hidden="true">
          {building.code}
        </span>
        <h3 className="min-w-0 flex-1 truncate text-[0.9375rem] font-bold text-ink">{building.name}</h3>
        <span className="tnum shrink-0 text-[0.75rem] font-semibold text-ink-soft">{spots.length}곳</span>
      </header>
      <ul>
        {spots.map((s, i) => (
          <li key={s.roomId} className={i > 0 ? 'border-t border-line/70' : ''}>
            <button
              type="button"
              onClick={() => onOpen(s)}
              onPointerEnter={() => setHover(s.roomId)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(s.roomId)}
              onBlur={() => setHover(null)}
              aria-label={`${spotAria(s)}, ${s.locationText}`}
              className="group flex min-h-[3.25rem] w-full items-center gap-3 px-3.5 py-2 text-left transition-colors duration-180 hover:bg-star-soft/45 focus-visible:bg-star-soft/45"
            >
              <SpotMark spot={s} size={32} />
              <span className="min-w-0 flex-1 text-[1.0625rem] font-bold leading-tight tracking-[-0.01em] text-ink">{s.label}</span>
              <span className="tnum shrink-0 rounded-full border border-line bg-paper/80 px-2 py-0.5 text-[0.75rem] font-bold text-ink-soft">{s.floorId}</span>
              <ChevronRight size={18} className="shrink-0 text-ink-mute transition-transform duration-180 group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ───────────────────────────── 장소 상세 ─────────────────────────────

function EventDetail({ spot, spots }: { spot: Spot; spots: SpotIndex }) {
  const openEvent = useAppStore((s) => s.openEvent)
  const eventShowFloor = useAppStore((s) => s.eventShowFloor)
  const setHover = useEventUi((s) => s.setHover)
  const stop = useContent((s) => s.tour.stops[spot.index])
  const photos = useContent((s) => s.photos)
  const building = getBuilding(spot.buildingId)
  const pics = photosFor(photos, spot.roomId)
  const prev = stepSpot(spots, spotNoOf(spot), -1)
  const next = stepSpot(spots, spotNoOf(spot), 1)
  const sibs = siblingsOf(spots, spot)
  const official = officialName(spot)
  const howto = stop?.howto ?? []
  const here = spots.byBuilding.get(spot.buildingId) ?? [spot]
  const start = spot.no === null
  const no = spotNoOf(spot)

  // 상세를 보는 동안 해당 카드 줄을 강조(지도)
  useEffect(() => {
    setHover(null)
  }, [spot.roomId, setHover])

  if (!building) return null

  return (
    <article aria-labelledby="ev-spot-title">
      {/* 상단 줄: 뒤로 · 이전/다음 (시트에서는 이 영역을 잡고 끌 수 있다) */}
      <div data-sheet-drag className="flex items-center justify-between gap-2 px-3 pb-1 pt-1 lg:pt-4">
        <button
          type="button"
          onClick={() => openEvent(null)}
          className="inline-flex min-h-[3rem] items-center gap-1.5 rounded-full px-3.5 text-[0.9375rem] font-bold text-navy transition-colors hover:bg-paper-2"
        >
          <span aria-hidden="true">←</span> 전체 안내
        </button>
        <div className="flex items-center gap-1" role="group" aria-label="안내 장소 이동">
          <StepBtn dir="prev" target={prev} onGo={(s) => openEvent(spotNoOf(s))} />
          <StepBtn dir="next" target={next} onGo={(s) => openEvent(spotNoOf(s))} />
        </div>
      </div>

      <header className="px-5 pb-3 pt-1">
        <div className="flex items-center gap-3.5">
          <SpotMark spot={spot} size={52} className="drop-shadow-sm" />
          <div className="min-w-0 flex-1">
            <div className="eyebrow text-gold-deep">{start ? 'Start · 출발' : `Spot ${no} · ${building.en}`}</div>
            <h2 id="ev-spot-title" tabIndex={-1} className="mt-0.5 text-[1.75rem] font-extrabold leading-[1.1] tracking-[-0.035em] text-ink outline-none [text-wrap:balance] focus:shadow-none sm:text-[1.875rem]">
              {spot.label}
            </h2>
          </div>
        </div>
        <p className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.9375rem] font-semibold text-ink">
          <span className="inline-flex items-center gap-1.5 rounded-full py-1 pl-2 pr-3 text-white" style={{ background: building.color }}>
            <MapPin size={15} strokeWidth={2.1} aria-hidden="true" />
            {spot.locationText}
          </span>
          {official && <span className="text-[0.8125rem] font-medium text-ink-mute">도면상 명칭 · {official}</span>}
        </p>
      </header>

      <div key={spot.roomId} className="animate-fade-in px-5 pb-8">
        {pics.length > 0 && (
          <div className="mb-4 overflow-hidden rounded-card shadow-soft">
            <PhotoSlot photos={pics} alt={`${spot.locationText} ${spot.label}`} buildingId={spot.buildingId} roomId={spot.roomId} />
          </div>
        )}

        <div className="rounded-card border border-line bg-surface/70 px-3 pb-3 pt-4">
          <FloorStack building={building} target={spot} marks={here} />
        </div>

        <StraightLineNote />

        {stop?.note && <p className="mt-4 border-l-[3px] border-gold py-0.5 pl-3.5 text-[0.9375rem] leading-relaxed text-ink [text-wrap:pretty]">{stop.note}</p>}

        {howto.length > 0 && (
          <section className="mt-6" aria-labelledby="ev-howto">
            <h3 id="ev-howto" className="mb-2.5 flex items-baseline gap-2.5">
              <span className="eyebrow text-gold-deep">How to get there</span>
              <span className="text-[0.9375rem] font-bold text-ink">찾아가는 방법</span>
            </h3>
            <ol className="grid gap-2">
              {howto.map((h, i) => (
                <li key={i} className="flex gap-3 rounded-card border border-line bg-surface/70 px-3.5 py-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-navy text-[0.8125rem] font-bold text-white tnum" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="min-w-0 pt-0.5 text-[0.9375rem] leading-relaxed text-ink [text-wrap:pretty]">
                    <span className="sr-only">{i + 1}단계. </span>
                    {h}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {sibs.length > 0 && (
          <section className="mt-6" aria-labelledby="ev-sibs">
            <h3 id="ev-sibs" className="mb-2.5 text-[0.9375rem] font-bold text-ink">
              같은 건물의 다른 안내 장소
            </h3>
            <ul className="flex flex-wrap gap-2">
              {sibs.map((s) => (
                <li key={s.roomId}>
                  <button
                    type="button"
                    onClick={() => openEvent(spotNoOf(s))}
                    onPointerEnter={() => setHover(s.roomId)}
                    onPointerLeave={() => setHover(null)}
                    aria-label={`${spotAria(s)}, ${floorLabel(s.floorId)}`}
                    className="inline-flex min-h-[2.75rem] items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1.5 pr-3.5 text-[0.9375rem] font-bold text-ink shadow-soft transition-[border-color,transform] duration-180 hover:border-navy/40 active:scale-[0.98]"
                  >
                    <SpotMark spot={s} size={28} />
                    {s.label}
                    <span className="tnum text-[0.75rem] font-semibold text-ink-mute">{s.floorId}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-6 grid gap-2.5">
          <button type="button" onClick={() => eventShowFloor(no)} className="btn btn-primary min-h-[3.25rem] w-full text-[1rem]">
            <Layers size={19} strokeWidth={1.9} aria-hidden="true" />
            평면도에서 보기
          </button>
          <div className="grid grid-cols-2 gap-2.5">
            <NavCard dir="prev" target={prev} onGo={(s) => openEvent(spotNoOf(s))} />
            <NavCard dir="next" target={next} onGo={(s) => openEvent(spotNoOf(s))} />
          </div>
        </div>
        <p className="mt-4 text-[0.75rem] leading-relaxed text-ink-mute">위치는 학교 도면 기준이며 실제와 일부 다를 수 있습니다. 이동 경로나 거리는 안내하지 않습니다.</p>
      </div>
    </article>
  )
}

function StepBtn({ dir, target, onGo }: { dir: 'prev' | 'next'; target: Spot | null; onGo: (s: Spot) => void }) {
  const prev = dir === 'prev'
  return (
    <button
      type="button"
      disabled={!target}
      onClick={() => target && onGo(target)}
      aria-label={target ? `${prev ? '이전' : '다음'} 장소: ${target.label}` : prev ? '이전 장소 없음' : '다음 장소 없음'}
      title={target ? `${prev ? '이전' : '다음'}: ${target.label}` : undefined}
      className="grid h-12 w-12 place-items-center rounded-full border border-line bg-surface text-ink-soft shadow-soft transition-colors hover:border-navy/40 hover:text-navy disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-soft"
    >
      {prev ? <ChevronLeft size={20} aria-hidden="true" /> : <ChevronRight size={20} aria-hidden="true" />}
    </button>
  )
}

function NavCard({ dir, target, onGo }: { dir: 'prev' | 'next'; target: Spot | null; onGo: (s: Spot) => void }) {
  const prev = dir === 'prev'
  return (
    <button
      type="button"
      disabled={!target}
      onClick={() => target && onGo(target)}
      aria-label={target ? `${prev ? '이전' : '다음'} 장소: ${target.label}` : prev ? '이전 장소 없음' : '다음 장소 없음'}
      className={`flex min-h-[3.25rem] items-center gap-2 rounded-card border border-line bg-surface px-3 py-2 text-left shadow-soft transition-[border-color,transform] duration-180 hover:border-navy/40 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 ${
        prev ? '' : 'flex-row-reverse text-right'
      }`}
    >
      {prev ? <ChevronLeft size={18} className="shrink-0 text-ink-mute" aria-hidden="true" /> : <ChevronRight size={18} className="shrink-0 text-ink-mute" aria-hidden="true" />}
      <span className="min-w-0 flex-1">
        <span className="block text-[0.6875rem] font-semibold text-ink-mute">{prev ? '이전' : '다음'}</span>
        <span className="block truncate text-[0.9375rem] font-bold text-ink">{target ? (target.no === null ? `출발 ${target.label}` : `★${target.no} ${target.label}`) : prev ? '처음입니다' : '마지막입니다'}</span>
      </span>
    </button>
  )
}

/** GPS: "현재 위치에서 직선 약 120 m · 북서쪽" — 직선 방향이며 경로가 아니다. 추적 중이고 정확도가 충분할 때만 */
function StraightLineNote() {
  const line = useStraightLine()
  if (!line) return null
  return (
    <div className="mt-3 rounded-card border border-leaf/40 bg-leaf-soft/55 px-4 py-3" role="note">
      <p className="flex items-center gap-2 text-[0.9375rem] font-bold text-ink">
        <Navigation2 size={17} strokeWidth={2} className="shrink-0 text-leaf" aria-hidden="true" />
        {straightLineText(line.distanceM, line.bearing)}
      </p>
      <p className="mt-0.5 pl-[1.625rem] text-[0.75rem] leading-snug text-ink-mute">{STRAIGHT_LINE_CAPTION}</p>
    </div>
  )
}
