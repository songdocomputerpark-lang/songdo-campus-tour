/**
 * features/tour/useTour.ts — 추천 투어 상태 훅 + 자동 진행 엔진 (SPEC §4.6)
 *
 *  - 지점 목록 = content/tour.json (순서만 — 이동 경로·거리는 다루지 않는다). 각 지점 facility 는 roomId.
 *  - 지도 이동(건물 → 층 → 방 강조)은 store 의 tourGoTo / tourNext / tourPrev / startTour 가 수행한다. 여기서는 호출만 한다.
 *  - 자동 진행: autoplay ON 이면 지점마다 12초 뒤 다음 지점으로(마지막 지점에서는 멈춤). 사진은 Gallery 가 4초 간격으로 넘긴다.
 *    사용자가 조작하면(이전/다음/점 탭/지도 드래그·휠·키/사진 조작) 즉시 일시정지(store.setAutoplay(false)).
 *    타이머는 모듈 단위 엔진 하나가 store 를 구독해 구동한다 — 훅을 여러 곳에서 써도 타이머는 하나.
 *  - 학생 안내 장소: 지점마다 표시 이름(label)·별표 번호(no, 출발 지점은 null)를 spots.ts 색인에서 받아 지도 ★ 번호와 맞춘다.
 *  - announce: aria-live 안내문 ("★3 / 9 · 본관동 · 1층 중앙현관", 출발 지점은 "출발 · 체육관동 · 4층 체육관").
 */
import { useCallback, useEffect, useMemo } from 'react'
import { campus, classroomSubtitle, floorLabel, getRoom } from '../../data'
import type { BuildingId, CategoryId, FloorId } from '../../data/types'
import { useContent } from '../../lib/content'
import { useAppStore } from '../../store/useAppStore'
import { toast } from '../../ui/Toast'
import { spotsFor } from './spots'

/** 지점당 자동 진행 시간 */
export const TOUR_STEP_MS = 12_000
/** 한 지점 안에서 사진 자동 넘김 간격 */
export const TOUR_PHOTO_MS = 4_000

export interface ResolvedStop {
  /** tour.json 안의 원래 위치(0-based) — store.tour.index 와 같은 기준 */
  index: number
  roomId: string
  /** floors.json 의 시설명 */
  name: string
  /** 표시 이름 (tour.json label, 없으면 시설명) */
  label: string
  /** 학생 안내 장소 별표 번호(1부터). 출발 지점은 null */
  no: number | null
  start: boolean
  sub: string | null
  /** 교실이면 "1학년 1반 교실 · 2025 배치도 기준" (이름 "1-1" 에서 읽음), 아니면 null */
  classroomLabel: string | null
  note: string
  buildingId: BuildingId
  buildingName: string
  buildingColor: string
  floorId: FloorId
  floorLabel: string
  /** "본관동 · 2층" */
  locationText: string
  cat: CategoryId
  categoryLabel: string
  conf: 'high' | 'medium'
}

export interface TourApi {
  active: boolean
  title: string
  stops: ResolvedStop[]
  /** tour.json 의 전체 지점 수 */
  total: number
  /** 별표(학생 안내 장소) 지점 수 — 출발 지점 제외 */
  starTotal: number
  index: number
  current: ResolvedStop | null
  /** 0..1 */
  progress: number
  autoplay: boolean
  isFirst: boolean
  isLast: boolean
  announce: string
  /** 사용자 조작으로 이동 — 자동 진행을 멈추고 이동한다 */
  next: () => void
  prev: () => void
  goTo: (i: number) => void
  /** 자동 진행만 멈춘다 (지도·사진 조작 시) */
  pause: () => void
  /** 자동 진행 켜기/끄기. 마지막 지점에서 켜면 처음부터 다시 시작한다 */
  toggleAutoplay: () => void
  setAutoplay: (on: boolean) => void
  /** 처음부터 다시 */
  restart: () => void
  /** 투어 종료 → 현재 위치에서 자유 탐색 */
  end: () => void
  /** 마지막 지점에서 "투어 마치기" — 안내 토스트와 함께 자유 탐색으로 */
  finish: () => void
}

// ───────────────────────────── 자동 진행 엔진 ─────────────────────────────

let consumers = 0
let stopEngine: (() => void) | null = null
/** 현재 지점의 12초 타이머가 시작된 시각 (진행 표시선이 같은 시계를 쓰도록 공유) */
let stepStartedAt = 0

/** 현재 지점에서 자동 진행 타이머가 흐른 시간(ms). 자동 진행 중이 아니면 0 */
export function autoplayElapsedMs(): number {
  return stepStartedAt ? Math.min(TOUR_STEP_MS, Math.max(0, performance.now() - stepStartedAt)) : 0
}

function startEngine(): () => void {
  let timer: number | undefined
  let key = ''
  let attached = false

  // 지도를 직접 조작(드래그·휠·키)하면 자동 진행을 멈춘다
  const onMapInteraction = (e: Event) => {
    const t = e.target
    if (t instanceof Element && t.closest('.map-viewport')) useAppStore.getState().setAutoplay(false)
  }
  const attach = () => {
    if (attached) return
    attached = true
    document.addEventListener('pointerdown', onMapInteraction, true)
    document.addEventListener('wheel', onMapInteraction, { capture: true, passive: true })
    document.addEventListener('keydown', onMapInteraction, true)
  }
  const detach = () => {
    if (!attached) return
    attached = false
    document.removeEventListener('pointerdown', onMapInteraction, true)
    document.removeEventListener('wheel', onMapInteraction, true)
    document.removeEventListener('keydown', onMapInteraction, true)
  }

  const sync = () => {
    const { tour } = useAppStore.getState()
    const next = tour.active && tour.autoplay ? String(tour.index) : ''
    if (next === key) return
    key = next
    window.clearTimeout(timer)
    if (!next) {
      stepStartedAt = 0
      detach()
      return
    }
    attach()
    stepStartedAt = performance.now()
    timer = window.setTimeout(() => {
      const st = useAppStore.getState()
      if (!st.tour.active || !st.tour.autoplay) return
      const n = useContent.getState().tour.stops.length
      if (st.tour.index >= n - 1) st.setAutoplay(false) // 마지막 지점 → 자동 진행 종료
      else st.tourNext()
    }, TOUR_STEP_MS)
  }

  const unsub = useAppStore.subscribe(sync)
  sync()
  return () => {
    unsub()
    window.clearTimeout(timer)
    stepStartedAt = 0
    detach()
  }
}

function acquireEngine(): () => void {
  consumers += 1
  if (consumers === 1) stopEngine = startEngine()
  return () => {
    consumers -= 1
    if (consumers === 0) {
      stopEngine?.()
      stopEngine = null
    }
  }
}

// ───────────────────────────── 훅 ─────────────────────────────

export function useTour(): TourApi {
  useEffect(() => acquireEngine(), [])

  const tourData = useContent((s) => s.tour)
  const { active, index, autoplay } = useAppStore((s) => s.tour)
  const tourNext = useAppStore((s) => s.tourNext)
  const tourPrev = useAppStore((s) => s.tourPrev)
  const tourGoTo = useAppStore((s) => s.tourGoTo)
  const endTour = useAppStore((s) => s.endTour)
  const setAutoplay = useAppStore((s) => s.setAutoplay)

  const spots = spotsFor(tourData)
  const stops = useMemo<ResolvedStop[]>(
    () =>
      tourData.stops.flatMap((st, i) => {
        const ref = getRoom(st.facility)
        if (!ref) return []
        const spot = spots.byRoom.get(ref.room.id)
        return [
          {
            index: i,
            roomId: ref.room.id,
            name: ref.room.name,
            label: spot?.label ?? ref.room.name,
            no: spot && spot.index === i ? spot.no : null,
            start: !!spot && spot.index === i && spot.start,
            sub: ref.room.sub,
            classroomLabel: classroomSubtitle(ref.room),
            note: st.note,
            buildingId: ref.building.id,
            buildingName: ref.building.name,
            buildingColor: ref.building.color,
            floorId: ref.floor.floor,
            floorLabel: floorLabel(ref.floor.floor),
            locationText: `${ref.building.name} · ${floorLabel(ref.floor.floor)}`,
            cat: ref.room.cat,
            categoryLabel: campus.categories[ref.room.cat],
            conf: ref.room.conf,
          },
        ]
      }),
    [tourData, spots],
  )

  const total = tourData.stops.length
  const starTotal = spots.stars.length
  const current = useMemo(() => stops.find((s) => s.index === index) ?? null, [stops, index])
  const isFirst = index <= 0
  const isLast = total > 0 && index >= total - 1

  const pause = useCallback(() => {
    if (useAppStore.getState().tour.autoplay) setAutoplay(false)
  }, [setAutoplay])
  const next = useCallback(() => {
    pause()
    tourNext()
  }, [pause, tourNext])
  const prev = useCallback(() => {
    pause()
    tourPrev()
  }, [pause, tourPrev])
  const goTo = useCallback(
    (i: number) => {
      pause()
      tourGoTo(i)
    },
    [pause, tourGoTo],
  )
  const restart = useCallback(() => {
    pause()
    tourGoTo(0)
  }, [pause, tourGoTo])
  const toggleAutoplay = useCallback(() => {
    const st = useAppStore.getState().tour
    if (st.autoplay) return setAutoplay(false)
    const n = useContent.getState().tour.stops.length
    if (n > 1 && st.index >= n - 1) tourGoTo(0) // 끝에서 켜면 처음부터
    setAutoplay(true)
  }, [setAutoplay, tourGoTo])
  const finish = useCallback(() => {
    endTour()
    toast.info('투어를 마쳤습니다. 지도를 자유롭게 둘러보세요.', { id: 'tour-finish' })
  }, [endTour])

  const announce = current
    ? `${current.no !== null ? `★${current.no} / ${starTotal}` : current.start ? '출발' : `${index + 1} / ${total}`} · ${current.locationText} ${current.label}${isLast ? '. 마지막 지점입니다' : ''}`
    : ''

  return {
    active,
    title: tourData.title,
    stops,
    total,
    starTotal,
    index,
    current,
    progress: total > 1 ? index / (total - 1) : 0,
    autoplay,
    isFirst,
    isLast,
    announce,
    next,
    prev,
    goTo,
    pause,
    toggleAutoplay,
    setAutoplay,
    restart,
    end: endTour,
    finish,
  }
}
