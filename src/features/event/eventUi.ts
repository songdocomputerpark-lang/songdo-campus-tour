// 입학설명회 안내 화면의 일시적 UI 상태 (목록 ↔ 지도 카드 강조). 주소·내비게이션 상태가 아니므로 앱 스토어와 분리한다.
import { create } from 'zustand'

interface EventUiState {
  /** 목록 줄/지도 카드 줄에 마우스·포커스가 있는 시설(roomId) */
  hoverRoom: string | null
  setHover: (roomId: string | null) => void
}

export const useEventUi = create<EventUiState>((set, get) => ({
  hoverRoom: null,
  setHover: (roomId) => {
    if (get().hoverRoom !== roomId) set({ hoverRoom: roomId })
  },
}))
