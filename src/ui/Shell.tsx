// 앱 셸: 반응형 레이아웃 조립 (SPEC §5)
//  데스크톱(≥1024): 지도 전체화면 · 좌상단 브랜드(+브레드크럼) · 상단 중앙 검색 · 우측 상세 패널(420px) · 하단 중앙 툴바 · 우하단 지도 조작
//  모바일(<1024): 얇은 상단 바(엠블럼·브레드크럼·검색) · 하단 툴바(안전영역) · 하단 시트(peek/half/full 드래그 스냅)
//  패널 슬롯 내용 우선순위: 투어(TourBar) > 시설(DetailPanel) > 건물 상세(BuildingDetail) > 층 목록(FloorList)
//  지도 카메라는 Shell 이 계산한 insets(패널·툴바가 가리는 여백)를 받아 보이는 영역 중앙에 맞춘다.
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AboutModal } from '../features/about/AboutModal'
import { BuildingDetail } from '../features/detail/BuildingDetail'
import { DetailPanel } from '../features/detail/DetailPanel'
import { GpsControls } from '../features/gps/GpsControls'
import { SearchBox } from '../features/search/SearchBox'
import { TourBar } from '../features/tour/TourBar'
import { remPx } from '../lib/env'
import { Compass, useNorthDeg } from '../map/Compass'
import { MapStage } from '../map/MapStage'
import { classroomSubtitle, getBuilding, getFloor, getRoom, floorLabel } from '../data'
import { useAppStore } from '../store/useAppStore'
import { Brand, Emblem } from './Brand'
import { BottomSheet, SHEET_HANDLE_H, SHEET_PEEK, sheetMetrics } from './BottomSheet'
import { Breadcrumb } from './Breadcrumb'
import { FirstUseHint } from './FirstUseHint'
import { FloorList } from './FloorList'
import { Intro } from './Intro'
import { MapChrome } from './MapChrome'
import { SidePanel } from './SidePanel'
import { ToastHost } from './Toast'
import { Toolbar } from './Toolbar'
import { useIsDesktop, useIsNarrow } from './useMedia'

const Calibrate = lazy(() => import('../features/gps/Calibrate'))

export function Shell() {
  const screen = useAppStore((s) => s.screen)
  if (screen === 'calibrate') {
    return (
      <>
        <Suspense fallback={<div className="fixed inset-0 grid place-items-center bg-paper text-ink-mute">보정 화면을 불러오는 중…</div>}>
          <Calibrate />
        </Suspense>
        <ToastHost />
      </>
    )
  }
  return <MapShell />
}

type PanelKind = 'tour' | 'room' | 'building' | 'floor'

/** 투어 콤팩트 시트: 머리글 높이를 아직 못 쟀을 때의 기본값(px). 실제 값은 TourBar 가 알려 준다 */
const TOUR_HEADER_FALLBACK = 122
/** 교실 시설 상세는 머리글에 부제 한 줄이 더 있어 peek 를 그만큼 키운다 */
const CLASSROOM_PEEK_EXTRA = 18

function useSafeInsets() {
  const [safe, setSafe] = useState({ top: 0, bottom: 0 })
  useLayoutEffect(() => {
    const probe = document.createElement('div')
    probe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)'
    document.body.appendChild(probe)
    const read = () => {
      const cs = getComputedStyle(probe)
      setSafe({ top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 })
    }
    read()
    window.addEventListener('resize', read)
    window.addEventListener('orientationchange', read)
    return () => {
      window.removeEventListener('resize', read)
      window.removeEventListener('orientationchange', read)
      probe.remove()
    }
  }, [])
  return safe
}

function useViewportH(): number {
  const [h, setH] = useState(() => window.visualViewport?.height ?? window.innerHeight)
  useEffect(() => {
    const on = () => setH(window.visualViewport?.height ?? window.innerHeight)
    window.addEventListener('resize', on)
    window.visualViewport?.addEventListener('resize', on)
    return () => {
      window.removeEventListener('resize', on)
      window.visualViewport?.removeEventListener('resize', on)
    }
  }, [])
  return h
}

function MapShell() {
  const isDesktop = useIsDesktop()
  const narrow = useIsNarrow()
  const view = useAppStore((s) => s.view)
  const buildingId = useAppStore((s) => s.buildingId)
  const floorId = useAppStore((s) => s.floorId)
  const roomId = useAppStore((s) => s.roomId)
  const tourActive = useAppStore((s) => s.tour.active)
  const panelOpen = useAppStore((s) => s.panel.open)
  const snap = useAppStore((s) => s.panel.snap)
  const setPanelSnap = useAppStore((s) => s.setPanelSnap)
  const closePanel = useAppStore((s) => s.closePanel)
  const setInsets = useAppStore((s) => s.setInsets)
  const openSearch = useAppStore((s) => s.openSearch)
  const northDeg = useNorthDeg()

  const kind: PanelKind | null = tourActive ? 'tour' : roomId ? 'room' : view === 'campus' && buildingId ? 'building' : view === 'floor' ? 'floor' : null
  const visible = panelOpen && kind !== null
  const lastKind = useRef<PanelKind>('building')
  if (kind) lastKind.current = kind
  const shownKind = kind ?? lastKind.current

  // ── 전역 단축키 ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      const st = useAppStore.getState()
      const modalOpen = st.search.open || st.ui.aboutOpen || st.gps.status === 'consent' || st.ui.intro
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        openSearch()
        return
      }
      if (e.key === '/' && !typing && !modalOpen && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        openSearch()
        return
      }
      if (e.key === 'Escape' && !modalOpen && !e.defaultPrevented && !typing) {
        if (st.tour.active) st.endTour() // 투어 중 Esc = 투어 종료(자유 탐색). 선택된 시설은 유지
        else if (st.roomId) st.clearRoom()
        else if (st.view === 'floor') st.exitFloor()
        else if (st.buildingId) st.goCampus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openSearch])

  // ── 레이아웃 측정 → 지도 insets ──
  const safe = useSafeInsets()
  const vh = useViewportH()
  const [toolbarH, setToolbarH] = useState(72)
  useLayoutEffect(() => {
    const el = document.getElementById('app-toolbar')
    if (!el) return
    const ro = new ResizeObserver(() => setToolbarH(el.getBoundingClientRect().height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const topBarH = 56 + safe.top

  // 모바일 시트 peek 높이: 투어는 머리글만 보이는 콤팩트 높이, 교실 상세는 부제 한 줄만큼 더 크게, 그 밖은 기본값
  const [tourHeaderH, setTourHeaderH] = useState(TOUR_HEADER_FALLBACK)
  const onTourPeek = useCallback((h: number) => {
    if (h > 0) setTourHeaderH((prev) => (prev === h ? prev : h))
  }, [])
  const roomRef = getRoom(roomId)
  const peekPx = isDesktop
    ? undefined
    : shownKind === 'tour'
      ? SHEET_HANDLE_H + tourHeaderH + 2
      : shownKind === 'room' && roomRef && classroomSubtitle(roomRef.room)
        ? SHEET_PEEK + CLASSROOM_PEEK_EXTRA
        : undefined
  const metrics = sheetMetrics(vh, topBarH, toolbarH, peekPx)
  const sheetVisible = visible ? Math.min(metrics[snap], metrics.half) : 0

  const rem = isDesktop ? remPx() : 16
  const panelPx = 26.25 * rem + 2.5 * rem // 패널 폭 + 좌우 여백
  const insets = useMemo(
    () =>
      isDesktop
        ? { top: Math.round(4.9 * rem), bottom: Math.round(6.2 * rem), left: Math.round(1.5 * rem), right: Math.round(visible ? panelPx : 1.5 * rem) }
        : { top: topBarH + 8, bottom: toolbarH + sheetVisible + 8, left: 10, right: view === 'floor' ? (narrow ? 54 : 62) : 10 },
    [isDesktop, narrow, rem, visible, panelPx, topBarH, toolbarH, sheetVisible, view],
  )
  useEffect(() => setInsets(insets), [insets, setInsets])

  // ── 접근성: 현재 위치 안내 + 문서 제목 ──
  const building = getBuilding(buildingId)
  const floor = view === 'floor' ? getFloor(buildingId, floorId) : undefined
  const where = floor && building ? `${building.name} ${floorLabel(floor.floor)} 평면도` : building ? `${building.name} 건물 안내` : '캠퍼스 전체 지도'
  useEffect(() => {
    document.title = `${where} · 송도고등학교 캠퍼스 투어`
  }, [where])

  const content =
    shownKind === 'tour' ? <TourBar layout={isDesktop ? 'panel' : 'sheet'} onPeekHeight={isDesktop ? undefined : onTourPeek} /> : shownKind === 'room' ? <DetailPanel /> : shownKind === 'building' ? <BuildingDetail /> : <FloorList />
  const panelLabel = shownKind === 'tour' ? '추천 투어' : shownKind === 'room' ? '시설 상세 안내' : shownKind === 'building' ? '건물 안내' : '층 시설 목록'

  return (
    <div className="fixed inset-0 overflow-hidden bg-paper">
      <MapStage insets={insets} />

      <MapChrome
        isDesktop={isDesktop}
        rightShift={isDesktop && visible ? panelPx - 1.5 * rem : 0}
        bottomLift={toolbarH + sheetVisible}
        compactControls={!isDesktop && visible && snap !== 'peek'}
      />

      {/* 상단: 데스크톱 = 브랜드 + 브레드크럼 + 검색 / 모바일 = 얇은 바 */}
      {isDesktop ? (
        <>
          <div className="absolute left-6 top-6 z-30 flex flex-col items-start gap-2">
            <Brand />
            <div className="glass-surface rounded-full px-2 py-0.5 shadow-float">
              <Breadcrumb />
            </div>
          </div>
          <SearchBox variant="bar" className="absolute left-1/2 top-6 z-30 -translate-x-1/2" />
        </>
      ) : (
        <header
          className="glass-surface fixed inset-x-0 top-0 z-30 flex items-center gap-2 border-x-0 border-t-0 px-3"
          style={{ height: topBarH, paddingTop: 'var(--safe-top)' }}
        >
          <Emblem size={30} />
          <Breadcrumb className="min-w-0 flex-1" />
          <Compass deg={northDeg} size="sm" />
          <SearchBox variant="icon" />
        </header>
      )}

      {/* GPS 상태 칩 슬롯 — 래퍼는 포인터를 막지 않는다(자식이 pointer-events-auto 를 지정) */}
      <div
        className="pointer-events-none absolute left-1/2 z-20 flex -translate-x-1/2 justify-center"
        style={{ top: isDesktop ? '5.5rem' : 'calc(var(--safe-top) + 3.75rem)', width: 'min(34rem, calc(100vw - 8rem))' }}
      >
        <GpsControls variant="status" />
      </div>

      <FirstUseHint isDesktop={isDesktop} />

      {isDesktop ? (
        <SidePanel open={visible} label={panelLabel}>
          {content}
        </SidePanel>
      ) : (
        <BottomSheet
          open={visible}
          snap={snap}
          onSnapChange={setPanelSnap}
          onClose={closePanel}
          topReserve={topBarH}
          bottomReserve={toolbarH}
          peek={peekPx}
          label={panelLabel}
        >
          {content}
        </BottomSheet>
      )}

      <Toolbar />
      <AboutModal />
      <ToastHost />
      <Intro />
      <div className="sr-only-live" aria-live="polite" role="status">
        {where}
      </div>
    </div>
  )
}
