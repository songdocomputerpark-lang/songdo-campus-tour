// 입학설명회 안내 화면의 일시적 UI 상태 (목록 ↔ 지도 카드 강조, 설명회 장소 확대). 주소·내비게이션 상태가 아니므로 앱 스토어와 분리한다.
import { create } from 'zustand'

interface EventUiState {
  /** 목록 줄/지도 카드 줄에 마우스·포커스가 있는 시설(roomId) */
  hoverRoom: string | null
  setHover: (roomId: string | null) => void
  /**
   * 식순 탭에서 '장소' 줄을 누른 횟수. 0 = 캠퍼스 전체 맞춤, 1 이상 = 설명회 장소(체육관동)로 확대.
   * 누를 때마다 값이 바뀌어 지도 카메라가 다시 날아간다(손으로 옮긴 뒤에도).
   */
  venueFocus: number
  focusVenue: () => void
  clearVenueFocus: () => void
}

export const useEventUi = create<EventUiState>((set, get) => ({
  hoverRoom: null,
  setHover: (roomId) => {
    if (get().hoverRoom !== roomId) set({ hoverRoom: roomId })
  },
  venueFocus: 0,
  focusVenue: () => set({ venueFocus: get().venueFocus + 1 }),
  clearVenueFocus: () => {
    if (get().venueFocus !== 0) set({ venueFocus: 0 })
  },
}))
