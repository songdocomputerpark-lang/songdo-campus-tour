// 패널(데스크톱 사이드 패널 / 모바일 바텀 시트) 공통 머리글.
//  data-sheet-drag : 모바일 시트에서 이 영역을 잡고 끌어 스냅(peek·half·full)을 바꿀 수 있다.
//  시트의 'peek' 높이(SHEET_PEEK, 교실 시설은 부제 한 줄만큼 더) 안에는 머리글과 핵심 액션이 들어와야 한다.
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export interface PanelHeaderProps {
  eyebrow?: string
  title: string
  subtitle?: ReactNode
  /** 건물 색 등 좌측 강조 막대 색 */
  accent?: string
  trailing?: ReactNode
  onClose?: () => void
  closeLabel?: string
  className?: string
}

export function PanelHeader({ eyebrow, title, subtitle, accent, trailing, onClose, closeLabel = '닫기', className = '' }: PanelHeaderProps) {
  return (
    <header data-sheet-drag className={`flex items-start gap-3 px-5 pb-3 pt-2 lg:pt-5 ${className}`}>
      {accent && <span className="mt-1 h-10 w-1.5 shrink-0 rounded-full" style={{ background: accent }} aria-hidden="true" />}
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="eyebrow mb-0.5 text-gold-deep">{eyebrow}</div>}
        <h2 className="text-[1.25rem] font-bold leading-tight text-ink [text-wrap:balance]">{title}</h2>
        {subtitle && <div className="mt-1 text-[0.8125rem] leading-snug text-ink-mute">{subtitle}</div>}
      </div>
      {trailing}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="-mr-1.5 -mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-mute transition-colors hover:bg-paper-2 hover:text-ink"
        >
          <X size={20} strokeWidth={1.8} />
        </button>
      )}
    </header>
  )
}
