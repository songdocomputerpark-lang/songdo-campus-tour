/**
 * features/gps/ConsentSheet.tsx — "내 위치" 첫 사용 시 안내 (SPEC §4.7)
 *
 * 모바일: 하단 시트 / 데스크톱: 중앙 카드. 동의(onAccept) 전에는 브라우저 위치 권한을 요청하지 않는다.
 * role="dialog" aria-modal · 포커스 트랩 · Esc = 취소 · 닫으면 호출한 버튼으로 포커스 복귀.
 * GpsControls(variant="toolbar") 가 렌더하며, 툴바(backdrop-filter) 안에서도 전체 화면을 덮도록 body 로 포털한다.
 */
import { Building2, LocateFixed, Navigation, ShieldCheck } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { geoSourceLabel, useGeoTransform } from '../../lib/calibration'
import { useDialog } from './useDialog'

export interface ConsentSheetProps {
  open: boolean
  onAccept: () => void
  onCancel: () => void
}

function Point({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-paper-2 text-navy" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[0.9375rem] font-semibold leading-snug text-ink">{title}</p>
        <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ink-soft">{children}</p>
      </div>
    </li>
  )
}

export function ConsentSheet({ open, onAccept, onCancel }: ConsentSheetProps) {
  const geo = useGeoTransform()
  const acceptRef = useRef<HTMLButtonElement>(null)
  const ref = useDialog<HTMLElement>(open, onCancel, { initialFocus: () => acceptRef.current })
  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" role="presentation">
      <div className="absolute inset-0 animate-fade-in bg-ink/45" onClick={onCancel} aria-hidden="true" />
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gps-consent-title"
        aria-describedby="gps-consent-desc"
        tabIndex={-1}
        className="relative max-h-[92dvh] w-full animate-fade-up overflow-y-auto break-keep rounded-t-panel border border-line bg-surface px-6 pt-3 shadow-panel outline-none lg:max-w-[28.5rem] lg:rounded-panel lg:pt-7"
        style={{ paddingBottom: 'max(1.5rem, var(--safe-bottom))' }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line-strong lg:hidden" aria-hidden="true" />

        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-navy text-white shadow-soft" aria-hidden="true">
            <LocateFixed size={21} strokeWidth={1.7} />
          </span>
          <div className="eyebrow text-gold-deep">My Location</div>
        </div>
        <h2 id="gps-consent-title" className="mt-3 text-[1.375rem] font-bold leading-tight text-ink [text-wrap:balance]">
          내 위치를 지도에 표시할까요?
        </h2>
        <p id="gps-consent-desc" className="mt-1.5 text-[0.875rem] leading-relaxed text-ink-soft">
          캠퍼스를 걸으며 지금 계신 곳을 배치도 위에서 확인할 수 있습니다. 시작 전에 아래 내용을 확인해 주세요.
        </p>

        <ul className="mt-5 grid gap-4">
          <Point icon={<Navigation size={18} strokeWidth={1.8} />} title="현재 위치를 점으로 표시해요">
            캠퍼스 지도에 위치와 오차 범위(±N m)를 보여 주고, 층 평면도에서는 가장 가까운 건물을 알려 드려요.
          </Point>
          <Point icon={<ShieldCheck size={18} strokeWidth={1.8} />} title="위치는 이 기기 안에서만 사용돼요">
            서버로 전송하거나 저장하지 않으며, 외부 지도·분석·추적 도구도 쓰지 않습니다. 언제든 &lsquo;추적 중지&rsquo;로 끌 수 있어요.
          </Point>
          <Point icon={<Building2 size={18} strokeWidth={1.8} />} title="실내 층은 직접 선택해 주세요">
            건물 안의 층은 자동으로 알 수 없고, 실내에서는 오차가 커질 수 있어요. 하늘이 트인 실외에서 가장 정확합니다.
          </Point>
        </ul>

        <p className="mt-5 rounded-card bg-paper px-3.5 py-2.5 text-[0.75rem] leading-relaxed text-ink-mute">
          &lsquo;동의하고 시작&rsquo;을 누르면 브라우저가 위치 권한을 한 번 더 확인합니다. 위치 기준: {geoSourceLabel(geo)}
        </p>

        <div className="mt-5 flex gap-2.5">
          <button type="button" className="btn btn-ghost flex-1" onClick={onCancel}>
            취소
          </button>
          <button ref={acceptRef} type="button" className="btn btn-primary flex-[1.4]" onClick={onAccept}>
            동의하고 시작
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
