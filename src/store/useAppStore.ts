// 앱 전역 상태 (zustand) + hash 동기화.
//
// ── 상태 모델 ──────────────────────────────────────────────────────────────
//  screen      'map' | 'calibrate'            #/calibrate 는 전체화면 보정 도구
//  view        'campus' | 'floor'             캠퍼스 배치도 / 층 평면도
//  buildingId  선택된 건물 (view=campus 이면 '건물 카드' 상태, view=floor 이면 현재 건물)
//  floorId     view=floor 일 때 현재 층
//  roomId      선택된 시설(방). selectRoom() 은 건물·층까지 함께 이동한다
//  panel       상세 패널 열림 + 모바일 시트 스냅(peek|half|full) — 데스크톱은 open 만 사용
//  tour        추천 투어 {active, index(0-based), autoplay}
//  gps         {status, fix, error, consented}  — 좌표는 메모리에만 (저장·전송 금지)
//  search      {open}
//  ui          {intro, showPlanLayer, legend, aboutOpen}
//  insets      지도 위 UI(패널·툴바·상단바)가 가리는 여백 — Shell 이 계산, 지도 엔진이 구독
//
// ── 투어와 내비게이션 규칙 ──────────────────────────────────────────────────
//  투어 자체의 이동(tourGoTo/Next/Prev)을 제외한 모든 내비게이션 액션(goCampus/selectBuilding/
//  selectFloor/selectRoom)은 투어를 종료한다(자유 탐색으로 전환). 단, selectRoom(id) 가 현재 투어
//  지점의 시설이면 투어를 유지한다. 투어 지점 이동 시 building→floor→room 이 자동 선택된다.
//
// ── hash ───────────────────────────────────────────────────────────────────
//  #/ · #/b/main · #/b/main/2F · #/b/main/2F/<roomId> · #/tour/<n(1-based)> · #/calibrate
//  건물/층/화면이 바뀌면 pushState(뒤로 가기 지원), 방 선택·투어 단계 이동은 replaceState.
import { create } from 'zustand'
import { floorIndex, floorsOf, getBuilding, getFloor, getRoom } from '../data'
import type { BuildingId, FloorId, Insets } from '../data/types'
import { useContent } from '../lib/content'
import { isDesktopViewport } from '../lib/env'
import { buildHash, parseHash, type Route } from './hash'

export type View = 'campus' | 'floor'
export type Screen = 'map' | 'calibrate'
export type PanelSnap = 'peek' | 'half' | 'full'

export type GpsStatus =
  | 'idle' // 아직 사용 안 함
  | 'consent' // 안내 시트 표시 중
  | 'requesting' // 권한 요청/첫 fix 대기
  | 'tracking' // watchPosition 동작 중
  | 'denied'
  | 'unsupported'
  | 'insecure' // HTTPS 아님(localhost 제외)
  | 'timeout'
  | 'error'

export interface GpsFix {
  lat: number
  lon: number
  /** 수평 정확도(m) */
  accuracy: number
  /** 진행 방향(도, 진북 기준 시계방향) — 없으면 null */
  heading: number | null
  speed: number | null
  timestamp: number
}

export interface GpsState {
  status: GpsStatus
  fix: GpsFix | null
  error: string | null
  /** 이번 세션에서 안내 시트에 동의했는가 (좌표 아님 — 영속 저장은 GPS 담당이 결정) */
  consented: boolean
}

export interface AppState {
  screen: Screen
  view: View
  buildingId: BuildingId | null
  floorId: FloorId | null
  roomId: string | null
  /** 마지막 층 이동 방향(+1 위로 / -1 아래로 / 0 없음) — 층 전환 애니메이션용 */
  floorDir: -1 | 0 | 1
  panel: { open: boolean; snap: PanelSnap }
  tour: { active: boolean; index: number; autoplay: boolean }
  gps: GpsState
  search: { open: boolean }
  ui: { intro: boolean; showPlanLayer: boolean; legend: boolean; aboutOpen: boolean }
  insets: Insets

  // 내비게이션
  goCampus: () => void
  selectBuilding: (id: BuildingId | null) => void
  selectFloor: (floorId: FloorId, buildingId?: BuildingId) => void
  /** 시설 선택 — 해당 건물/층으로 이동하고 상세 패널을 연다. null 이면 선택 해제 */
  selectRoom: (roomId: string | null) => void
  clearRoom: () => void
  /** 층 평면도 → 캠퍼스 지도(건물 카드 상태로) */
  exitFloor: () => void
  /** 같은 건물의 위/아래 층 (dir=+1 위) */
  stepFloor: (dir: 1 | -1) => void
  // 패널
  openPanel: (snap?: PanelSnap) => void
  closePanel: () => void
  setPanelSnap: (snap: PanelSnap) => void
  // 투어
  startTour: (index?: number) => void
  tourGoTo: (index: number) => void
  tourNext: () => void
  tourPrev: () => void
  endTour: () => void
  setAutoplay: (on: boolean) => void
  // GPS
  setGps: (patch: Partial<GpsState>) => void
  resetGps: () => void
  // 검색
  openSearch: () => void
  closeSearch: () => void
  // UI
  dismissIntro: (next?: 'tour' | 'free') => void
  setShowPlanLayer: (on: boolean) => void
  setLegend: (on: boolean) => void
  openAbout: () => void
  closeAbout: () => void
  openCalibrate: () => void
  closeCalibrate: () => void
  setInsets: (i: Insets) => void
}

const ZERO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
const INTRO_KEY = 'songdo.intro.seen'

function introSeen(): boolean {
  try {
    return sessionStorage.getItem(INTRO_KEY) === '1'
  } catch {
    return false
  }
}
function markIntroSeen(): void {
  try {
    sessionStorage.setItem(INTRO_KEY, '1')
  } catch {
    /* ignore */
  }
}

// ───────────── 투어 지점 → 내비게이션 상태 ─────────────

type NavPatch = Partial<Pick<AppState, 'screen' | 'view' | 'buildingId' | 'floorId' | 'roomId' | 'floorDir' | 'panel'>>

/** snap: 투어 중에는 사용자가 조절한 시트 높이를 유지한다(단계마다 half 로 튕기지 않도록) */
function patchForRoom(s: Pick<AppState, 'buildingId' | 'floorId'>, roomId: string, snap: PanelSnap = 'half'): NavPatch | null {
  const ref = getRoom(roomId)
  if (!ref) return null
  return {
    screen: 'map',
    view: 'floor',
    buildingId: ref.building.id,
    floorId: ref.floor.floor,
    roomId,
    floorDir: dirBetween(s, ref.building.id, ref.floor.floor),
    panel: { open: true, snap },
  }
}

/**
 * 투어를 열 때의 시트 높이. 모바일(바텀 시트)에서는 지도가 가려지지 않도록 머리글만 보이는 'peek'(콤팩트),
 * 데스크톱(사이드 패널)에서는 snap 을 쓰지 않으므로 'half'. 사진·안내문은 시트를 끌어 올리면 보인다.
 */
function tourOpenSnap(): PanelSnap {
  return isDesktopViewport() ? 'half' : 'peek'
}

/** 투어가 진행 중이면 현재 시트 높이를, 아니면 'half' */
function tourSnap(s: Pick<AppState, 'tour' | 'panel'>): PanelSnap {
  return s.tour.active ? s.panel.snap : 'half'
}

function dirBetween(s: Pick<AppState, 'buildingId' | 'floorId'>, b: BuildingId, f: FloorId): -1 | 0 | 1 {
  if (s.buildingId !== b || !s.floorId) return 0
  const d = floorIndex(f) - floorIndex(s.floorId)
  return d > 0 ? 1 : d < 0 ? -1 : 0
}

function clampIndex(i: number, n: number): number {
  if (n <= 0) return Math.max(0, i)
  return Math.min(n - 1, Math.max(0, i))
}

/** hash 경로(Route) → 상태 조각. 초기 상태와 hashchange 양쪽에서 사용 */
function stateForRoute(route: Route, prev: Pick<AppState, 'buildingId' | 'floorId' | 'tour'>): Partial<AppState> {
  const base = { screen: 'map' as Screen, tour: { ...prev.tour, active: false, autoplay: false } }
  switch (route.kind) {
    case 'campus':
      return { ...base, view: 'campus', buildingId: null, floorId: null, roomId: null, floorDir: 0, panel: { open: false, snap: 'half' } }
    case 'building':
      return { ...base, view: 'campus', buildingId: route.building, floorId: null, roomId: null, floorDir: 0, panel: { open: true, snap: 'half' } }
    case 'floor':
      return {
        ...base,
        view: 'floor',
        buildingId: route.building,
        floorId: route.floor,
        roomId: null,
        floorDir: dirBetween(prev, route.building, route.floor),
        panel: { open: true, snap: 'peek' },
      }
    case 'room':
      return {
        ...base,
        view: 'floor',
        buildingId: route.building,
        floorId: route.floor,
        roomId: route.room,
        floorDir: dirBetween(prev, route.building, route.floor),
        panel: { open: true, snap: 'half' },
      }
    case 'tour':
      return { screen: 'map', tour: { active: true, index: route.index, autoplay: false }, panel: { open: true, snap: tourOpenSnap() } }
    case 'calibrate':
      return { screen: 'calibrate', tour: { ...prev.tour, active: false, autoplay: false } }
  }
}

const initialRoute = typeof location !== 'undefined' ? parseHash(location.hash) : ({ kind: 'campus' } as Route)

const baseState = {
  screen: 'map' as Screen,
  view: 'campus' as View,
  buildingId: null as BuildingId | null,
  floorId: null as FloorId | null,
  roomId: null as string | null,
  floorDir: 0 as -1 | 0 | 1,
  panel: { open: false, snap: 'half' as PanelSnap },
  tour: { active: false, index: 0, autoplay: false },
}

export const useAppStore = create<AppState>()((set, get) => {
  /** 투어 종료(자유 탐색). 위치·선택은 유지 */
  const leaveTour = (): Partial<AppState> =>
    get().tour.active ? { tour: { ...get().tour, active: false, autoplay: false } } : {}

  /** 현재 투어 지점으로 지도 이동 (콘텐츠 로드 전이면 로드 완료 후 재적용됨) */
  const applyStop = (index: number) => {
    const stops = useContent.getState().tour.stops
    const stop = stops[clampIndex(index, stops.length)]
    if (!stop) return
    const patch = patchForRoom(get(), stop.facility, tourSnap(get()))
    if (patch) set(patch)
  }

  return {
    ...baseState,
    ...stateForRoute(initialRoute, baseState),
    gps: { status: 'idle', fix: null, error: null, consented: false },
    search: { open: false },
    ui: {
      // 딥링크(#/ 이외)로 들어오면 인트로 생략. 세션당 1회.
      intro: initialRoute.kind === 'campus' && !introSeen(),
      showPlanLayer: false,
      legend: false,
      aboutOpen: false,
    },
    insets: ZERO_INSETS,

    goCampus: () =>
      set({
        ...leaveTour(),
        screen: 'map',
        view: 'campus',
        buildingId: null,
        floorId: null,
        roomId: null,
        floorDir: 0,
        panel: { open: false, snap: 'half' },
      }),

    selectBuilding: (id) => {
      if (!id || !getBuilding(id)) return get().goCampus()
      set({
        ...leaveTour(),
        screen: 'map',
        view: 'campus',
        buildingId: id,
        floorId: null,
        roomId: null,
        floorDir: 0,
        panel: { open: true, snap: 'half' },
      })
    },

    selectFloor: (floorId, buildingId) => {
      const s = get()
      const bid = buildingId ?? s.buildingId
      if (!bid || !getFloor(bid, floorId)) return
      set({
        ...leaveTour(),
        screen: 'map',
        view: 'floor',
        buildingId: bid,
        floorId,
        roomId: null,
        floorDir: dirBetween(s, bid, floorId),
        panel: { open: true, snap: 'peek' },
      })
    },

    selectRoom: (roomId) => {
      if (!roomId) return get().clearRoom()
      const s = get()
      const stops = useContent.getState().tour.stops
      const keepTour = s.tour.active && stops[clampIndex(s.tour.index, stops.length)]?.facility === roomId
      const patch = patchForRoom(s, roomId, keepTour ? s.panel.snap : 'half')
      if (!patch) return
      set({ ...(keepTour ? {} : leaveTour()), ...patch })
    },

    clearRoom: () => {
      const s = get()
      if (!s.roomId) return
      set({ roomId: null, panel: { open: s.panel.open, snap: 'peek' } })
    },

    exitFloor: () =>
      set({
        ...leaveTour(),
        view: 'campus',
        floorId: null,
        roomId: null,
        floorDir: 0,
        panel: { open: !!get().buildingId, snap: 'half' },
      }),

    stepFloor: (dir) => {
      const s = get()
      if (!s.buildingId || !s.floorId) return
      const list = floorsOf(s.buildingId)
      const i = list.findIndex((f) => f.floor === s.floorId)
      const next = list[i + dir]
      if (next) get().selectFloor(next.floor, s.buildingId)
    },

    openPanel: (snap) => set((s) => ({ panel: { open: true, snap: snap ?? s.panel.snap } })),

    closePanel: () => {
      const s = get()
      if (s.tour.active) return set({ panel: { open: s.panel.open, snap: 'peek' } })
      if (s.roomId) return get().clearRoom()
      if (s.view === 'campus' && s.buildingId) return get().goCampus()
      set({ panel: { open: false, snap: s.panel.snap } })
    },

    setPanelSnap: (snap) => set((s) => (s.panel.snap === snap ? s : { panel: { ...s.panel, snap } })),

    startTour: (index = 0) => {
      const n = useContent.getState().tour.stops.length
      set({
        screen: 'map',
        tour: { active: true, index: clampIndex(index, n), autoplay: false },
        panel: { open: true, snap: tourOpenSnap() },
        search: { open: false },
        ui: { ...get().ui, intro: false, aboutOpen: false },
      })
      markIntroSeen()
      applyStop(index)
    },

    tourGoTo: (index) => {
      const s = get()
      if (!s.tour.active) return
      const n = useContent.getState().tour.stops.length
      const i = clampIndex(index, n)
      set({ tour: { ...s.tour, index: i } })
      applyStop(i)
    },
    tourNext: () => get().tourGoTo(get().tour.index + 1),
    tourPrev: () => get().tourGoTo(get().tour.index - 1),
    endTour: () => set({ tour: { ...get().tour, active: false, autoplay: false } }),
    setAutoplay: (on) => set({ tour: { ...get().tour, autoplay: on } }),

    setGps: (patch) => set({ gps: { ...get().gps, ...patch } }),
    resetGps: () => set({ gps: { status: 'idle', fix: null, error: null, consented: get().gps.consented } }),

    openSearch: () => set({ search: { open: true } }),
    closeSearch: () => set({ search: { open: false } }),

    dismissIntro: (next) => {
      markIntroSeen()
      set({ ui: { ...get().ui, intro: false } })
      if (next === 'tour') get().startTour(0)
    },
    setShowPlanLayer: (on) => set({ ui: { ...get().ui, showPlanLayer: on } }),
    setLegend: (on) => set({ ui: { ...get().ui, legend: on } }),
    openAbout: () => set({ ui: { ...get().ui, aboutOpen: true }, search: { open: false } }),
    closeAbout: () => set({ ui: { ...get().ui, aboutOpen: false } }),
    openCalibrate: () => set({ screen: 'calibrate', ui: { ...get().ui, aboutOpen: false, intro: false }, tour: { ...get().tour, active: false, autoplay: false } }),
    closeCalibrate: () => set({ screen: 'map' }),

    setInsets: (i) => {
      const c = get().insets
      if (c.top === i.top && c.right === i.right && c.bottom === i.bottom && c.left === i.left) return
      set({ insets: i })
    },
  }
})

// 콘텐츠(tour.json) 가 늦게 로드되면 투어 지점 이동을 재적용
useContent.subscribe((s, prev) => {
  if (s.tour !== prev.tour) {
    const st = useAppStore.getState()
    if (st.tour.active) {
      const stop = s.tour.stops[clampIndex(st.tour.index, s.tour.stops.length)]
      const patch = stop ? patchForRoom(st, stop.facility, tourSnap(st)) : null
      if (patch) useAppStore.setState({ ...patch, tour: { ...st.tour, index: clampIndex(st.tour.index, s.tour.stops.length) } })
    }
  }
})

// ───────────── hash 동기화 ─────────────

export function routeFromState(s: Pick<AppState, 'screen' | 'tour' | 'view' | 'buildingId' | 'floorId' | 'roomId'>): Route {
  if (s.screen === 'calibrate') return { kind: 'calibrate' }
  if (s.tour.active) return { kind: 'tour', index: s.tour.index }
  if (s.buildingId && s.floorId && s.view === 'floor') {
    if (s.roomId) return { kind: 'room', building: s.buildingId, floor: s.floorId, room: s.roomId }
    return { kind: 'floor', building: s.buildingId, floor: s.floorId }
  }
  if (s.buildingId) return { kind: 'building', building: s.buildingId }
  return { kind: 'campus' }
}

function levelKey(s: AppState): string {
  if (s.screen === 'calibrate') return 'calibrate'
  if (s.tour.active) return 'tour'
  return `${s.view}|${s.buildingId ?? ''}|${s.floorId ?? ''}`
}

function sameHash(a: string, b: string): boolean {
  const norm = (h: string) => (h === '' || h === '#' || h === '#/' ? '#/' : h)
  return norm(a) === norm(b)
}

/** 앱 시작 시 1회 호출. 반환값은 해제 함수 */
export function initHashSync(): () => void {
  let lastKey = levelKey(useAppStore.getState())
  let applying = false // hashchange 처리 중에는 store→hash 쓰기를 건너뛴다(루프·중복 push 방지)

  const write = (forceReplace = false) => {
    if (applying) return
    const s = useAppStore.getState()
    const hash = buildHash(routeFromState(s))
    const key = levelKey(s)
    if (sameHash(location.hash, hash)) {
      lastKey = key
      return
    }
    if (forceReplace || key === lastKey) history.replaceState(null, '', hash)
    else history.pushState(null, '', hash)
    lastKey = key
  }

  const unsub = useAppStore.subscribe(() => write())

  const onHashChange = () => {
    applying = true
    const route = parseHash(location.hash)
    const s = useAppStore.getState()
    useAppStore.setState(stateForRoute(route, s))
    // 투어 hash 로 들어왔고 콘텐츠가 이미 로드된 경우 지점 이동 적용
    if (route.kind === 'tour') {
      const stops = useContent.getState().tour.stops
      const stop = stops[clampIndex(route.index, stops.length)]
      const cur = useAppStore.getState()
      const patch = stop ? patchForRoom(cur, stop.facility, tourSnap(cur)) : null
      if (patch) useAppStore.setState(patch)
    }
    applying = false
    write(true)
  }
  window.addEventListener('hashchange', onHashChange)

  // 초기 hash 가 투어/정규화 대상이면 상태에 반영 + hash 정규화(replace)
  if (initialRoute.kind === 'tour') {
    const stops = useContent.getState().tour.stops
    const stop = stops[clampIndex(initialRoute.index, stops.length)]
    const cur = useAppStore.getState()
    const patch = stop ? patchForRoom(cur, stop.facility, tourSnap(cur)) : null
    if (patch) useAppStore.setState(patch)
  }
  write(true)

  return () => {
    unsub()
    window.removeEventListener('hashchange', onHashChange)
  }
}
