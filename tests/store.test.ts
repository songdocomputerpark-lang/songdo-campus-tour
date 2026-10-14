import { beforeEach, describe, expect, it } from 'vitest'
import { useContent } from '../src/lib/content'
import { routeFromState, useAppStore } from '../src/store/useAppStore'

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
