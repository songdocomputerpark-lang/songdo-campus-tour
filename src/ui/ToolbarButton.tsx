// 하단 툴바 버튼 (모바일: 아이콘 위 / 라벨 아래 4열, 데스크톱: 가로 알약). GpsControls 등에서 재사용.
import type { ReactNode } from 'react'

export interface ToolbarButtonProps {
  icon: ReactNode
  label: string
  onClick?: () => void
  /** 현재 화면/모드가 이 버튼 상태일 때 (강조) */
  active?: boolean
  /** 토글 버튼이면 pressed 상태 (aria-pressed) */
  pressed?: boolean
  disabled?: boolean
  title?: string
  /** 작은 상태 점(예: GPS 추적 중) */
  dot?: 'live' | 'warn' | null
}

export function ToolbarButton({ icon, label, onClick, active, pressed, disabled, title, dot }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      title={title ?? label}
      className={[
        'group relative flex min-h-[3.25rem] min-w-[2.75rem] flex-col items-center justify-center gap-0.5 rounded-2xl px-2 transition-[background-color,color,transform] duration-180 ease-out',
        'lg:min-h-[2.75rem] lg:flex-row lg:gap-2 lg:rounded-full lg:px-4',
        active ? 'bg-navy text-white shadow-soft' : 'text-ink-soft hover:bg-paper-2 hover:text-navy active:scale-[0.97]',
        disabled ? 'cursor-not-allowed opacity-45' : '',
      ].join(' ')}
    >
      <span className="relative grid h-6 w-6 place-items-center">
        {icon}
        {dot && (
          <span
            className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ${active ? 'ring-navy' : 'ring-surface'} ${dot === 'live' ? 'bg-leaf' : 'bg-gold'}`}
            aria-hidden="true"
          />
        )}
      </span>
      <span className="text-[0.6875rem] font-semibold leading-none tracking-tight lg:text-[0.8125rem]">{label}</span>
    </button>
  )
}
