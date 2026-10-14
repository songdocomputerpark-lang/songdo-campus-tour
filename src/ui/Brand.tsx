// 브랜드: 엠블럼 + 송도고등학교 + Explore Our Campus
import { assetUrl } from '../lib/content'

export function Emblem({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src={assetUrl('brand/emblem.svg')}
      alt=""
      width={size}
      height={size}
      decoding="async"
      draggable={false}
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  )
}

export function Brand({ compact = false }: { compact?: boolean }) {
  if (compact) return <Emblem size={30} />
  return (
    <div className="glass-surface flex items-center gap-3 rounded-2xl py-2 pl-2.5 pr-4 shadow-float">
      <Emblem size={38} />
      <div className="leading-tight">
        <div className="text-[0.9375rem] font-bold tracking-tight text-navy">송도고등학교</div>
        <div className="font-display text-[0.8125rem] italic tracking-[0.06em] text-gold-deep">Explore Our Campus</div>
      </div>
    </div>
  )
}
