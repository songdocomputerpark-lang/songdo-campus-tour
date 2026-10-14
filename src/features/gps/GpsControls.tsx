/**
 * features/gps/GpsControls.tsx — 내 위치 컨트롤 (SPEC §4.7)
 *
 * ui/Toolbar.tsx 와 ui/Shell.tsx 가 서로 다른 variant 로 마운트한다.
 *  · variant="toolbar" : 하단 툴바의 "내 위치" 버튼. 꺼짐 → 켜기(첫 사용 시 ConsentSheet), 추적 중 → 내 위치로 이동.
 *       상태 점: 정상 추적 'live'(초록) / 신호 대기·정확도 낮음·학교 밖 'warn'(금색).
 *  · variant="status"  : 지도 위 상단 중앙 상태 칩(위치는 Shell 이 지정, 래퍼는 pointer-events-none).
 *       - 대기:        "현재 위치를 찾는 중…" [취소]
 *       - 정상:        "추정 위치 ±N m" [내 위치로 이동] [추적 중지]
 *       - 정확도 > 50 m: "정확도가 낮습니다 — 실외에서 잠시 기다려 주세요"
 *       - 300 m 이상:  "학교 밖에 계십니다 · 약 X km" (지도의 마커는 숨김)
 *       - 층 평면도 화면: "가장 가까운 건물: ○○동" 칩(탭 → 그 건물) + "실내 층은 자동으로 인식하지 않습니다"
 * 오류(권한 거부·미지원·시간 초과·HTTPS 아님)는 useGeolocation 이 친절한 토스트로 안내하며 자유 탐색은 그대로 유지된다.
 */
import { Building2, ChevronRight, LoaderCircle, LocateFixed, LocateOff, MapPinOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { nearestBuilding } from '../../data'
import { useAppStore } from '../../store/useAppStore'
import { toast } from '../../ui/Toast'
import { ToolbarButton } from '../../ui/ToolbarButton'
import { formatDistance, formatUncertainty, LOW_ACCURACY_M, type FixAssessment } from './assess'
import { ConsentSheet } from './ConsentSheet'
import { useAutoCenter, useFixAssessment, useGeolocation, useRecenter } from './useGeolocation'
import { useGeoTransform } from '../../lib/calibration'

export interface GpsControlsProps {
  variant: 'toolbar' | 'status'
}

export function GpsControls({ variant }: GpsControlsProps) {
  return variant === 'toolbar' ? <GpsToolbarButton /> : <GpsStatusChips />
}

// ───────────── 하단 툴바 버튼 ─────────────

function GpsToolbarButton() {
  const { gps, request, start } = useGeolocation()
  const setGps = useAppStore((s) => s.setGps)
  const recenter = useRecenter()
  const a = useFixAssessment()

  const tracking = gps.status === 'tracking'
  const requesting = gps.status === 'requesting'
  const dot = tracking ? (a?.quality === 'good' ? 'live' : 'warn') : requesting || gps.status === 'timeout' || gps.status === 'error' ? 'warn' : null

  const onClick = () => {
    if (tracking) return recenter()
    if (requesting) {
      toast.info('현재 위치를 찾고 있어요. 잠시만 기다려 주세요.', { id: 'gps-note' })
      return
    }
    request()
  }

  return (
    <>
      <ToolbarButton
        icon={<LocateFixed size={21} strokeWidth={1.7} />}
        label="내 위치"
        active={tracking}
        dot={dot}
        title={tracking ? '내 위치로 이동' : '내 위치 보기'}
        onClick={onClick}
      />
      <ConsentSheet open={gps.status === 'consent'} onAccept={start} onCancel={() => setGps({ status: 'idle' })} />
    </>
  )
}

// ───────────── 상단 중앙 상태 칩 ─────────────

type Tone = 'live' | 'warn' | 'mute' | 'busy'

function ToneMark({ tone }: { tone: Tone }) {
  if (tone === 'busy') return <LoaderCircle size={18} className="shrink-0 animate-spin text-navy" aria-hidden="true" />
  if (tone === 'mute') return <MapPinOff size={18} strokeWidth={1.8} className="shrink-0 text-ink-mute" aria-hidden="true" />
  return (
    <span className="relative flex h-3 w-3 shrink-0" aria-hidden="true">
      {tone === 'live' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-leaf opacity-50" />}
      <span className={`relative inline-flex h-3 w-3 rounded-full ring-2 ring-surface ${tone === 'live' ? 'bg-leaf' : 'bg-gold'}`} />
    </span>
  )
}

const actionBtn =
  'grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-soft transition-colors duration-180 hover:bg-paper-2 hover:text-navy active:bg-paper-3 lg:h-10 lg:w-10'

/** wide: 캠퍼스 화면에서는 좌우에 다른 컨트롤이 없으므로 기본 폭(래퍼)보다 넓게 펼칠 수 있다. 층 화면에서는 래퍼 폭 안에 둔다 */
function Chip({ tone, title, sub, wide, children }: { tone: Tone; title: ReactNode; sub?: ReactNode; wide?: boolean; children?: ReactNode }) {
  return (
    <div
      className={`glass-surface pointer-events-auto flex animate-fade-in items-center gap-2.5 rounded-full py-1 pl-4 pr-1 shadow-float ${
        wide ? 'w-max max-w-[min(30rem,calc(100vw-1.5rem))]' : 'max-w-full'
      }`}
    >
      <ToneMark tone={tone} />
      <div className="min-w-0 py-1 leading-tight">
        <p className="tnum break-keep text-[0.8125rem] font-semibold text-ink [text-wrap:balance]">{title}</p>
        {sub && <p className="mt-0.5 break-keep text-[0.6875rem] leading-snug text-ink-mute">{sub}</p>}
      </div>
      {children && <div className="ml-auto flex shrink-0 items-center">{children}</div>}
    </div>
  )
}

function StopButton({ label = '추적 중지', onClick }: { label?: string; onClick: () => void }) {
  return (
    <button type="button" className={actionBtn} onClick={onClick} aria-label={label} title={label}>
      <LocateOff size={19} strokeWidth={1.7} />
    </button>
  )
}

function liveMessage(status: string, a: FixAssessment | null): string {
  if (status === 'requesting') return '현재 위치를 찾는 중입니다.'
  if (status === 'timeout' || status === 'error') return '위치 신호를 기다리고 있습니다. 실외에서 잠시 기다려 주세요.'
  if (!a) return ''
  if (a.quality === 'low-accuracy') return '정확도가 낮습니다. 실외에서 잠시 기다려 주세요.'
  if (a.quality === 'off-campus') return `학교 밖에 계십니다. ${formatDistance(a.distanceToCampusM)}`
  return '지도에 내 위치를 표시하고 있습니다.'
}

function GpsStatusChips() {
  const { gps, stop } = useGeolocation()
  const view = useAppStore((s) => s.view)
  const selectBuilding = useAppStore((s) => s.selectBuilding)
  const geo = useGeoTransform()
  const a = useFixAssessment()
  const recenter = useRecenter()
  useAutoCenter(a)

  const status = gps.status
  const wide = view === 'campus'
  const watching = status === 'requesting' || status === 'tracking' || status === 'timeout' || status === 'error'
  if (!watching) return null

  const live = (
    <div className="sr-only-live" role="status" aria-live="polite">
      {liveMessage(status, a)}
    </div>
  )

  let chip: ReactNode
  let extra: ReactNode = null

  if (status === 'requesting') {
    chip = (
      <Chip wide={wide} tone="busy" title="현재 위치를 찾는 중…" sub="브라우저의 위치 권한 요청이 보이면 허용해 주세요">
        <StopButton label="취소" onClick={stop} />
      </Chip>
    )
  } else if (status === 'timeout' || status === 'error' || !a) {
    chip = (
      <Chip wide={wide} tone="warn" title="위치 신호를 기다리는 중입니다" sub="하늘이 트인 실외에서 잠시 기다려 주세요">
        <StopButton onClick={stop} />
      </Chip>
    )
  } else if (a.quality === 'low-accuracy') {
    chip = (
      <Chip
        wide={wide}
        tone="warn"
        title="정확도가 낮습니다 — 실외에서 잠시 기다려 주세요"
        sub={`현재 오차 ${formatUncertainty(a.accuracyM)} · ${LOW_ACCURACY_M} m 이내가 되면 지도에 표시합니다`}
      >
        <StopButton onClick={stop} />
      </Chip>
    )
  } else if (a.quality === 'off-campus') {
    chip = (
      <Chip wide={wide} tone="mute" title={`학교 밖에 계십니다 · ${formatDistance(a.distanceToCampusM)}`} sub="캠퍼스 안에서 다시 켜면 지도에 내 위치가 표시됩니다">
        <StopButton onClick={stop} />
      </Chip>
    )
  } else {
    chip = (
      <Chip wide={wide} tone="live" title={`추정 위치 ${formatUncertainty(a.uncertaintyM)}`} sub={view === 'campus' ? '위치는 이 기기 안에서만 사용됩니다' : undefined}>
        {view === 'campus' && (
          <button type="button" className={actionBtn} onClick={recenter} aria-label="내 위치로 이동" title="내 위치로 이동">
            <LocateFixed size={19} strokeWidth={1.7} />
          </button>
        )}
        <StopButton onClick={stop} />
      </Chip>
    )

    if (view === 'floor') {
      const near = nearestBuilding(a.px)
      const distM = near.distPx * geo.metersPerPx
      extra = (
        <div className="pointer-events-auto flex max-w-full flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={() => selectBuilding(near.building.id)}
            className="glass-surface group flex min-h-11 max-w-full animate-fade-in items-center gap-2.5 rounded-full py-1.5 pl-3 pr-2.5 text-left shadow-float transition-[background-color,transform] duration-180 hover:bg-surface active:scale-[0.98]"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white" style={{ background: near.building.color }} aria-hidden="true">
              <Building2 size={15} strokeWidth={1.9} />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[0.8125rem] font-semibold text-ink">가장 가까운 건물: {near.building.name}</span>
              <span className="block truncate text-[0.6875rem] text-ink-mute">{near.inside ? '건물 안·근처로 추정 · 탭하여 이동' : `${formatDistance(distM)} · 탭하여 이동`}</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-ink-mute transition-transform duration-180 group-hover:translate-x-0.5" aria-hidden="true" />
          </button>
          <p className="max-w-full break-keep rounded-full bg-surface/90 px-3 py-0.5 text-center text-[0.6875rem] leading-snug text-ink-mute shadow-soft">
            실내 층은 자동으로 인식하지 않아요 · 직접 선택해 주세요
          </p>
        </div>
      )
    }
  }

  return (
    <div className="pointer-events-none flex w-full flex-col items-center gap-2">
      {live}
      {chip}
      {extra}
    </div>
  )
}
