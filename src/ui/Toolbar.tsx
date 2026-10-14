// 하단 툴바: [전체 지도] [추천 투어] [내 위치] [정보]
//  데스크톱: 하단 중앙 떠 있는 알약 / 모바일: 하단 고정 바(안전영역 고려, 터치 타깃 ≥ 44px)
import { Info, Map as MapIcon, Route } from 'lucide-react'
import { GpsControls } from '../features/gps/GpsControls'
import { useAppStore } from '../store/useAppStore'
import { ToolbarButton } from './ToolbarButton'

export function Toolbar() {
  const view = useAppStore((s) => s.view)
  const buildingId = useAppStore((s) => s.buildingId)
  const tourActive = useAppStore((s) => s.tour.active)
  const aboutOpen = useAppStore((s) => s.ui.aboutOpen)
  const goCampus = useAppStore((s) => s.goCampus)
  const startTour = useAppStore((s) => s.startTour)
  const endTour = useAppStore((s) => s.endTour)
  const openAbout = useAppStore((s) => s.openAbout)

  const atCampus = view === 'campus' && !buildingId && !tourActive

  return (
    <nav
      id="app-toolbar"
      aria-label="주요 메뉴"
      className={[
        'glass-surface fixed z-40 grid grid-cols-4 items-stretch gap-1 px-2 pt-1.5',
        'inset-x-0 bottom-0 border-x-0 border-b-0 shadow-[0_-6px_24px_-10px_rgb(17_24_39/0.18)]',
        'lg:inset-x-auto lg:bottom-6 lg:left-1/2 lg:-translate-x-1/2 lg:grid-cols-[repeat(4,auto)] lg:rounded-full lg:border lg:p-1.5 lg:shadow-panel',
      ].join(' ')}
      style={{ paddingBottom: 'max(var(--safe-bottom), 0.375rem)' }}
    >
      <ToolbarButton icon={<MapIcon size={21} strokeWidth={1.7} />} label="전체 지도" active={atCampus} onClick={goCampus} />
      <ToolbarButton
        icon={<Route size={21} strokeWidth={1.7} />}
        label={tourActive ? '투어 종료' : '추천 투어'}
        active={tourActive}
        pressed={tourActive}
        onClick={() => (tourActive ? endTour() : startTour(0))}
      />
      <GpsControls variant="toolbar" />
      <ToolbarButton icon={<Info size={21} strokeWidth={1.7} />} label="정보" active={aboutOpen} onClick={openAbout} />
    </nav>
  )
}
