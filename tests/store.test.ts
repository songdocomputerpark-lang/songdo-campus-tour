import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useContent } from '../src/lib/content'
import { dropUnknownEventSpot, routeFromState, useAppStore } from '../src/store/useAppStore'

const S = () => useAppStore.getState()

const TOUR = {
  title: '테스트 투어',
  stops: [
    { facility: 'main-1f-lobby', note: 'a' },
    { facility: 'main-2f-c1-1', note: 'b' },
    { facility: 'library-1f-p62', note: 'c' },
  ],
}

beforeEach(() => {
  useContent.setState({ tour: TOUR, status: 'ready' })
  S().endTour()
  S().goCampus()
  S().closeSearch()
})

describe('스토어 내비게이션', () => {
  it('기본 상태는 캠퍼스 전체', () => {
    expect(S().view).toBe('campus')
    expect(S().buildingId).toBeNull()
    expect(S().panel.open).toBe(false)
  })

  it('selectBuilding → 건물 카드(view=campus), 패널 열림', () => {
    S().selectBuilding('main')
    expect(S().view).toBe('campus')
    expect(S().buildingId).toBe('main')
    expect(S().floorId).toBeNull()
    expect(S().panel.open).toBe(true)
    expect(routeFromState(S())).toEqual({ kind: 'building', building: 'main' })
  })

  it('selectFloor → 층 평면도, 방 선택 해제', () => {
    S().selectBuilding('main')
    S().selectFloor('2F')
    expect(S().view).toBe('floor')
    expect(S().floorId).toBe('2F')
    expect(S().roomId).toBeNull()
    expect(routeFromState(S())).toEqual({ kind: 'floor', building: 'main', floor: '2F' })
  })

  it('selectFloor 는 존재하지 않는 층을 무시', () => {
    S().selectBuilding('restroom')
    S().selectFloor('4F')
    expect(S().view).toBe('campus')
    expect(S().floorId).toBeNull()
  })

  it('selectRoom → 건물·층·방 모두 이동', () => {
    S().selectRoom('library-1f-p62')
    expect(S().view).toBe('floor')
    expect(S().buildingId).toBe('library')
    expect(S().floorId).toBe('1F')
    expect(S().roomId).toBe('library-1f-p62')
    expect(S().panel.open).toBe(true)
    expect(routeFromState(S())).toEqual({ kind: 'room', building: 'library', floor: '1F', room: 'library-1f-p62' })
  })

  it('층 이동 방향(floorDir)', () => {
    S().selectFloor('2F', 'main')
    S().selectFloor('4F', 'main')
    expect(S().floorDir).toBe(1)
    S().selectFloor('1F', 'main')
    expect(S().floorDir).toBe(-1)
  })

  it('stepFloor', () => {
    S().selectFloor('2F', 'main')
    S().stepFloor(1)
    expect(S().floorId).toBe('3F')
    S().stepFloor(-1)
    S().stepFloor(-1)
    expect(S().floorId).toBe('1F')
    S().stepFloor(-1) // 본관동은 B1 없음 → 유지
    expect(S().floorId).toBe('1F')
  })

  it('clearRoom / exitFloor / goCampus', () => {
    S().selectRoom('main-2f-c1-1')
    S().clearRoom()
    expect(S().roomId).toBeNull()
    expect(S().view).toBe('floor')
    S().exitFloor()
    expect(S().view).toBe('campus')
    expect(S().buildingId).toBe('main')
    S().goCampus()
    expect(S().buildingId).toBeNull()
    expect(S().panel.open).toBe(false)
  })

  it('closePanel: 방 선택 → 해제, 건물 카드 → 전체, 층 목록 → 닫기', () => {
    S().selectRoom('main-2f-c1-1')
    S().closePanel()
    expect(S().roomId).toBeNull()
    expect(S().panel.open).toBe(true)
    S().closePanel()
    expect(S().panel.open).toBe(false)
    S().selectBuilding('gym')
    S().closePanel()
    expect(S().buildingId).toBeNull()
  })
})

describe('투어', () => {
  it('startTour 는 첫 지점으로 이동하고 hash 경로는 tour', () => {
    S().startTour(0)
    expect(S().tour).toEqual({ active: true, index: 0, autoplay: false })
    expect(S().roomId).toBe('main-1f-lobby')
    expect(routeFromState(S())).toEqual({ kind: 'tour', index: 0 })
  })

  it('다음/이전/이동 + 범위 고정', () => {
    S().startTour(0)
    S().tourNext()
    expect(S().roomId).toBe('main-2f-c1-1')
    expect(S().floorId).toBe('2F')
    S().tourNext()
    expect(S().buildingId).toBe('library')
    S().tourNext() // 마지막에서 더 가지 않음
    expect(S().tour.index).toBe(2)
    S().tourGoTo(-5)
    expect(S().tour.index).toBe(0)
    S().tourPrev()
    expect(S().tour.index).toBe(0)
  })

  it('투어 지점이 아닌 곳을 직접 선택하면 투어가 종료된다', () => {
    S().startTour(1)
    S().selectRoom('main-2f-c1-1') // 현재 지점과 동일 → 유지
    expect(S().tour.active).toBe(true)
    S().selectRoom('gym-2f-p84')
    expect(S().tour.active).toBe(false)
    expect(S().roomId).toBe('gym-2f-p84')
  })

  it('goCampus / endTour 는 투어를 끝낸다', () => {
    S().startTour(0)
    S().goCampus()
    expect(S().tour.active).toBe(false)
    S().startTour(0)
    S().endTour()
    expect(S().tour.active).toBe(false)
    expect(S().roomId).toBe('main-1f-lobby') // 현재 위치 유지(자유 탐색)
  })

  it('콘텐츠가 늦게 로드돼도 투어 지점으로 이동한다', () => {
    useContent.setState({ tour: { title: 't', stops: [] } })
    S().startTour(1)
    expect(S().roomId).toBeNull()
    useContent.setState({ tour: TOUR })
    expect(S().roomId).toBe('main-2f-c1-1')
  })

  it('투어 단계가 바뀌어도 사용자가 조절한 시트 높이(snap)를 유지한다', () => {
    S().startTour(0)
    expect(S().panel.snap).toBe('half')
    S().setPanelSnap('peek')
    S().tourNext()
    expect(S().panel.snap).toBe('peek')
    S().tourNext()
    expect(S().panel.snap).toBe('peek')
    S().endTour()
    S().selectRoom('gym-2f-p84') // 투어 밖의 시설 선택은 half 로 연다
    expect(S().panel.snap).toBe('half')
  })

  it('모바일(데스크톱 아님)에서는 투어가 머리글만 보이는 peek 로 열리고, 단계 이동에서도 유지된다', () => {
    const g = globalThis as { window?: unknown }
    g.window = { matchMedia: () => ({ matches: false }) } // 뷰포트 < 1024px
    try {
      S().startTour(0)
      expect(S().tour.active).toBe(true)
      expect(S().panel).toEqual({ open: true, snap: 'peek' })
      S().tourNext()
      expect(S().panel.snap).toBe('peek')
      S().setPanelSnap('half') // 사용자가 끌어 올리면 그 높이를 유지
      S().tourNext()
      expect(S().panel.snap).toBe('half')
    } finally {
      delete g.window
    }
  })

  it('투어 중 다른 시설을 고르면 투어가 끝나고 시트는 half 로 열린다', () => {
    S().startTour(0)
    S().setPanelSnap('peek')
    S().selectRoom('gym-2f-p84')
    expect(S().tour.active).toBe(false)
    expect(S().panel.snap).toBe('half')
  })

  it('autoplay 토글', () => {
    S().startTour(0)
    S().setAutoplay(true)
    expect(S().tour.autoplay).toBe(true)
  })
})

describe('기타 상태', () => {
  it('검색/정보/GPS/인셋', () => {
    S().openSearch()
    expect(S().search.open).toBe(true)
    S().openAbout()
    expect(S().ui.aboutOpen).toBe(true)
    expect(S().search.open).toBe(false)
    S().closeAbout()
    S().setGps({ status: 'tracking', fix: { lat: 1, lon: 2, accuracy: 5, heading: null, speed: null, timestamp: 0 } })
    expect(S().gps.status).toBe('tracking')
    S().resetGps()
    expect(S().gps.fix).toBeNull()
    const before = S().insets
    S().setInsets({ top: 1, right: 2, bottom: 3, left: 4 })
    expect(S().insets).toEqual({ top: 1, right: 2, bottom: 3, left: 4 })
    S().setInsets({ top: 1, right: 2, bottom: 3, left: 4 }) // 같은 값은 상태 교체 없음
    expect(S().insets).not.toBe(before)
  })
})

describe('입학설명회 안내(event)', () => {
  const EVENT_TOUR = {
    title: '설명회',
    event: { title: '입학설명회 안내', date: '2026. 10. 31.(토)', subtitle: '부제' },
    stops: [
      { facility: 'gym-4f-p91', note: '출발', label: '체육관', start: true },
      { facility: 'main-1f-lobby', note: 'a', label: '중앙현관' },
      { facility: 'library-1f-p62', note: 'b', label: '도서관' },
      { facility: 'library-2f-p68', note: 'c', label: '아우름터' },
    ],
  }
  beforeEach(() => {
    useContent.setState({ tour: EVENT_TOUR, status: 'ready' })
    S().goCampus()
  })

  it('openEvent: 안내 모드 + 패널 열림, hash 경로는 event', () => {
    S().openEvent()
    expect(S().event).toEqual({ active: true, spotNo: null })
    expect(S().view).toBe('campus')
    expect(S().buildingId).toBeNull()
    expect(S().panel.open).toBe(true)
    expect(routeFromState(S())).toEqual({ kind: 'event', spot: null })
    S().openEvent(2)
    expect(S().event.spotNo).toBe(2)
    expect(routeFromState(S())).toEqual({ kind: 'event', spot: 2 })
  })

  it('eventStep: 출발(0) → ★1 → … → 끝에서 멈춤, 전체 안내에서 다음 = 출발', () => {
    S().openEvent(null)
    S().eventStep(1)
    expect(S().event.spotNo).toBe(0)
    S().eventStep(-1) // 출발 앞은 없음
    expect(S().event.spotNo).toBe(0)
    S().eventStep(1)
    expect(S().event.spotNo).toBe(1)
    S().eventStep(1)
    S().eventStep(1)
    expect(S().event.spotNo).toBe(3)
    S().eventStep(1) // 마지막에서 더 가지 않음
    expect(S().event.spotNo).toBe(3)
    S().eventStep(-1)
    expect(S().event.spotNo).toBe(2)
  })

  it('eventShowFloor: 안내 모드를 유지한 채 평면도로, exitFloor 는 그 장소의 안내로 돌아간다', () => {
    S().openEvent(2)
    S().eventShowFloor(2)
    expect(S().view).toBe('floor')
    expect(S().roomId).toBe('library-1f-p62')
    expect(S().event).toEqual({ active: true, spotNo: 2 })
    expect(routeFromState(S())).toEqual({ kind: 'room', building: 'library', floor: '1F', room: 'library-1f-p62' })
    S().exitFloor()
    expect(S().view).toBe('campus')
    expect(S().event).toEqual({ active: true, spotNo: 2 })
    expect(routeFromState(S())).toEqual({ kind: 'event', spot: 2 })
  })

  it('평면도에서 안내 장소의 다른 방을 고르면 돌아갈 번호가 따라간다 (층 이동은 안내 모드 유지)', () => {
    S().openEvent(1)
    S().eventShowFloor(1)
    S().selectRoom('library-2f-p68')
    expect(S().event).toEqual({ active: true, spotNo: 3 })
    S().selectFloor('1F', 'library')
    expect(S().event.active).toBe(true)
  })

  it('closePanel: 장소 → 전체 안내 → 패널만 닫기(안내 모드 유지)', () => {
    S().openEvent(3)
    S().closePanel()
    expect(S().event).toEqual({ active: true, spotNo: null })
    expect(S().panel.open).toBe(true)
    S().closePanel()
    expect(S().panel.open).toBe(false)
    expect(S().event.active).toBe(true)
  })

  it('goCampus · selectBuilding · startTour 는 안내 모드를 끝낸다', () => {
    S().openEvent(1)
    S().goCampus()
    expect(S().event.active).toBe(false)
    S().openEvent(1)
    S().selectBuilding('main')
    expect(S().event.active).toBe(false)
    S().openEvent(1)
    S().startTour(0)
    expect(S().event.active).toBe(false)
    expect(S().tour.active).toBe(true)
    S().openEvent(null) // 안내를 열면 투어는 끝난다
    expect(S().tour.active).toBe(false)
    expect(S().event.active).toBe(true)
  })

  it('없는 번호는 콘텐츠가 로드되면 전체 안내로 되돌린다', () => {
    S().openEvent(99)
    useContent.setState({ tour: { ...EVENT_TOUR, stops: [...EVENT_TOUR.stops] } }) // 콘텐츠 다시 로드
    expect(S().event).toEqual({ active: true, spotNo: null })
  })

  it('dropUnknownEventSpot: 콘텐츠가 준비된 뒤에만, 없는 번호만 전체 안내로 (있는 번호는 그대로)', () => {
    S().openEvent(2)
    dropUnknownEventSpot()
    expect(S().event.spotNo).toBe(2)
    S().openEvent(99)
    useContent.setState({ status: 'loading' })
    dropUnknownEventSpot() // 아직 로드 중이면 판단하지 않는다 (딥링크 #/event/5 를 지우지 않게)
    expect(S().event.spotNo).toBe(99)
    useContent.setState({ status: 'ready' })
    dropUnknownEventSpot()
    expect(S().event).toEqual({ active: true, spotNo: null })
    S().goCampus()
    dropUnknownEventSpot() // 안내 모드가 아니면 아무 일도 하지 않는다
    expect(S().event.active).toBe(false)
  })

  it('탭: #/event 는 기본(null → 식순), setEventTab 은 #/event/program · #/event/spots 로 쓰인다', () => {
    S().openEvent()
    expect(S().eventTab).toBeNull()
    expect(routeFromState(S())).toEqual({ kind: 'event', spot: null })
    S().setEventTab('spots')
    expect(S().event).toEqual({ active: true, spotNo: null })
    expect(S().eventTab).toBe('spots')
    expect(routeFromState(S())).toEqual({ kind: 'event', spot: null, tab: 'spots' })
    S().setEventTab('program')
    expect(routeFromState(S())).toEqual({ kind: 'event', spot: null, tab: 'program' })
  })

  it('탭: 장소 상세로 갔다가 전체 안내로 돌아오면 보던 탭 그대로 · 새로 들어오면 기본으로', () => {
    S().openEvent(null, 'spots')
    expect(S().eventTab).toBe('spots')
    S().openEvent(2) // 장소 상세 — 탭은 그대로 두되 주소에는 쓰지 않는다
    expect(S().eventTab).toBe('spots')
    expect(routeFromState(S())).toEqual({ kind: 'event', spot: 2 })
    S().openEvent(null)
    expect(routeFromState(S())).toEqual({ kind: 'event', spot: null, tab: 'spots' })
    S().goCampus()
    S().openEvent() // 새로 들어오면 기본 탭
    expect(S().eventTab).toBeNull()
    expect(routeFromState(S())).toEqual({ kind: 'event', spot: null })
  })

  it('탭: 평면도를 다녀와도(안내 모드 유지) 탭이 유지된다', () => {
    S().openEvent(null, 'program')
    S().openEvent(2)
    S().eventShowFloor(2)
    S().exitFloor()
    expect(S().event).toEqual({ active: true, spotNo: 2 })
    S().openEvent(null)
    expect(S().eventTab).toBe('program')
  })

  describe('주소 정리: 없는 장소 번호만 #/event 로 교체한다 (탭 주소는 건드리지 않는다)', () => {
    const replaceState = vi.fn()
    const useHash = (hash: string) => {
      vi.stubGlobal('location', { hash })
      vi.stubGlobal('history', { replaceState })
    }
    beforeEach(() => replaceState.mockClear())
    afterEach(() => vi.unstubAllGlobals())

    it('#/event/99 는 교체, #/event/program · #/event/spots 는 그대로', () => {
      for (const [hash, replaced] of [['#/event/99', true], ['#/event/program', false], ['#/event/spots', false], ['#/event/spots/', false]] as const) {
        replaceState.mockClear()
        useHash(hash)
        S().goCampus()
        S().openEvent(99) // 없는 번호 (안내 장소는 0~3)
        dropUnknownEventSpot()
        expect(S().event).toEqual({ active: true, spotNo: null })
        expect(replaceState.mock.calls.length > 0, hash).toBe(replaced)
        if (replaced) expect(replaceState).toHaveBeenCalledWith(null, '', '#/event')
      }
    })

    it('탭이 있는 전체 안내(spotNo = null)에서는 아무 일도 하지 않는다', () => {
      useHash('#/event/spots')
      S().openEvent(null, 'spots')
      dropUnknownEventSpot()
      expect(S().event).toEqual({ active: true, spotNo: null })
      expect(S().eventTab).toBe('spots')
      expect(replaceState).not.toHaveBeenCalled()
    })
  })

  it('dismissIntro("event") 는 안내를 연다', () => {
    S().dismissIntro('event')
    expect(S().event.active).toBe(true)
    expect(S().ui.intro).toBe(false)
  })
})
