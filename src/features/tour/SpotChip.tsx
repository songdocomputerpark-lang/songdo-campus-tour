// 학생 안내 장소 표식 (HTML): ★ 지점 = 금색 원 안의 번호, 출발 = 남색 깃발. 패널·목록·코스 카드에서 같은 모양을 쓴다.
import { flagPath, starPath } from '../../map/icons'
import type { Spot } from './spots'

const STAR = starPath(9.4)
const FLAG = flagPath(5.2)

/** 원형 배지 (size px). 번호는 별 위에 겹쳐 읽히도록 남색 굵은 숫자 */
export function SpotMark({ spot, size = 26, className = '' }: { spot: Pick<Spot, 'no'>; size?: number; className?: string }) {
  const start = spot.no === null
  return (
    <svg width={size} height={size} viewBox="-12 -12 24 24" className={`shrink-0 ${className}`} aria-hidden="true">
      {start ? (
        <>
          <circle r={11} style={{ fill: 'rgb(var(--navy))' }} />
          <path d={FLAG} fill="none" stroke="#fff" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" transform="translate(0.6 0)" />
        </>
      ) : (
        <>
          <circle r={11} style={{ fill: 'rgb(var(--star))', stroke: 'rgb(var(--star-deep) / 0.55)', strokeWidth: 0.9 }} />
          <path d={STAR} style={{ fill: 'rgb(255 255 255 / 0.42)' }} transform="translate(0 0.6)" />
          <text y={0.9} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 11.5, fontWeight: 800, fill: 'rgb(var(--navy))', fontFamily: 'inherit' }}>
            {spot.no}
          </text>
        </>
      )}
    </svg>
  )
}

/** 알약 표식: "★ 학생 안내 장소 3" / "출발 지점" */
export function SpotChip({ spot, className = '' }: { spot: Pick<Spot, 'no'>; className?: string }) {
  const start = spot.no === null
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2.5 text-[0.75rem] font-bold leading-snug ${
        start ? 'bg-navy text-white' : 'border border-star-deep/40 bg-star text-navy'
      } ${className}`}
    >
      <SpotMark spot={spot} size={20} />
      {start ? '출발 지점' : `학생 안내 장소 ${spot.no}`}
    </span>
  )
}
