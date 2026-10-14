// 지도 위 HTML 오버레이 묶음: 나침반 · 축척 · 확대/축소/맞춤 · (층 화면) 층 선택기 / 도면 보기 / 범례 / 목록
// 위치는 레이아웃(데스크톱/모바일), 패널 점유 폭(rightShift), 모바일 시트 높이(bottomLift)에 따라 달라진다.
import { Layers, List, Palette } from 'lucide-react'
import { campus, getBuilding, getFloor } from '../data'
import { Compass, useNorthDeg } from '../map/Compass'
import { FloorSelector } from '../map/FloorSelector'
import { Legend } from '../map/Legend'
import { useRegisteredMap } from '../map/mapBus'
import { MapControls } from '../map/MapControls'
import { ScaleBar } from '../map/ScaleBar'
import { useAppStore } from '../store/useAppStore'

interface Props {
  isDesktop: boolean
  /** 데스크톱: 우측 패널이 차지하는 폭(px) */
  rightShift: number
  /** 모바일: 툴바 + 시트가 차지하는 하단 높이(px) */
  bottomLift: number
  /** 모바일: 시트가 half/full 이면 조작 버튼을 숨겨 겹침 방지 */
  compactControls: boolean
}

function ToolButton({ icon, label, pressed, onClick, disabled }: { icon: React.ReactNode; label: string; pressed?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      className={`glass-surface flex h-11 items-center justify-center gap-2 rounded-full shadow-float transition-colors duration-180 lg:px-4 w-11 lg:w-auto ${
        pressed ? '!bg-navy text-white' : 'text-ink-soft hover:text-navy'
      } ${disabled ? 'opacity-45' : ''}`}
    >
      {icon}
      <span className="hidden text-[0.8125rem] font-semibold lg:inline">{label}</span>
      <span className="sr-only lg:hidden">{label}</span>
    </button>
  )
}

export function MapChrome({ isDesktop, rightShift, bottomLift, compactControls }: Props) {
  const view = useAppStore((s) => s.view)
  const buildingId = useAppStore((s) => s.buildingId)
  const floorId = useAppStore((s) => s.floorId)
  const showPlan = useAppStore((s) => s.ui.showPlanLayer)
  const legend = useAppStore((s) => s.ui.legend)
  const setShowPlan = useAppStore((s) => s.setShowPlanLayer)
  const setLegend = useAppStore((s) => s.setLegend)
  const openPanel = useAppStore((s) => s.openPanel)
  const panelOpen = useAppStore((s) => s.panel.open)
  const hasRoom = useAppStore((s) => !!s.roomId)
  const clearRoom = useAppStore((s) => s.clearRoom)
  const campusApi = useRegisteredMap('campus')
  const floorApi = useRegisteredMap('floor')

  const building = getBuilding(buildingId)
  const floor = view === 'floor' ? getFloor(buildingId, floorId) : undefined
  const api = view === 'floor' ? floorApi : campusApi
  const deg = useNorthDeg()

  const slide = { transition: 'right 420ms var(--ease-out), bottom 380ms var(--ease-out), opacity 240ms ease' }
  const rightPos = isDesktop ? `calc(1.5rem + ${rightShift}px)` : '0.75rem'

  return (
    <>
      {/* 나침반 (모바일은 상단 바 안에 Shell 이 렌더) */}
      {isDesktop && (
        <div className="pointer-events-auto absolute z-20" style={{ ...slide, right: rightPos, top: '1.5rem' }}>
          <Compass deg={deg} />
        </div>
      )}

      {/* 층 도구 */}
      {floor && building && (
        <div
          className="absolute z-20 flex flex-col gap-2"
          style={{
            ...slide,
            ...(isDesktop ? { right: rightPos, top: '5.25rem', alignItems: 'flex-end' } : { left: '0.75rem', top: 'calc(var(--safe-top) + 3.75rem)' }),
          }}
        >
          {floor.image && <ToolButton icon={<Layers size={19} strokeWidth={1.7} />} label="도면 보기" pressed={showPlan} onClick={() => setShowPlan(!showPlan)} />}
          <ToolButton icon={<Palette size={19} strokeWidth={1.7} />} label="범례" pressed={legend} onClick={() => setLegend(!legend)} />
          <ToolButton
            icon={<List size={19} strokeWidth={1.7} />}
            label="목록으로 보기"
            pressed={panelOpen && !hasRoom}
            onClick={() => {
              if (hasRoom) clearRoom()
              openPanel(isDesktop ? undefined : 'half')
            }}
          />
        </div>
      )}

      {/* 층 선택기 */}
      {floor && building && (
        <div
          className="absolute z-20"
          style={
            isDesktop
              ? { left: '1.5rem', bottom: '1.5rem' }
              : { right: '0.75rem', top: 'calc(var(--safe-top) + 3.5rem)', bottom: bottomLift, display: 'flex', alignItems: 'center', pointerEvents: 'none', transition: 'bottom 380ms var(--ease-out)' }
          }
        >
          <div className="pointer-events-auto">
            <FloorSelector />
          </div>
        </div>
      )}

      {/* 범례 */}
      {floor && building && legend && (
        <div
          className="absolute z-20 w-[min(16rem,calc(100vw-5.5rem))]"
          style={isDesktop ? { left: '6.25rem', bottom: '1.5rem' } : { left: '0.75rem', bottom: bottomLift + 12, transition: 'bottom 380ms var(--ease-out)' }}
        >
          <Legend floor={floor} building={building} />
        </div>
      )}

      {/* 축척 (캠퍼스 화면) */}
      {view === 'campus' && (
        <div
          className="absolute z-10"
          style={isDesktop ? { left: '1.5rem', bottom: '1.75rem' } : { left: '1rem', bottom: bottomLift + 14, transition: 'bottom 380ms var(--ease-out)' }}
        >
          <ScaleBar api={campusApi} metersPerPx={campus.geo.metersPerPx} />
        </div>
      )}

      {/* 확대·축소·맞춤 */}
      <div
        className="absolute z-20"
        style={{
          ...slide,
          right: rightPos,
          bottom: isDesktop ? '1.5rem' : bottomLift + 12,
          opacity: !isDesktop && compactControls ? 0 : 1,
          pointerEvents: !isDesktop && compactControls ? 'none' : undefined,
        }}
      >
        <MapControls api={api} />
      </div>
    </>
  )
}
