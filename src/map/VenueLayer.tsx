// 입학설명회 안내 > 식순 탭에서 캠퍼스 지도에 얹는 '설명회 장소' 표식 (CampusMap 월드 <g> 안, 건물·이름표 위).
//  · 건물 자체의 금빛 후광은 CampusMap(BuildingShape ev='venue')이 그리고, 여기서는 지붕 위 핀 + "설명회 장소" 이름표(화면 크기 고정)를 그린다.
//  · 접근성: 장식 레이어(aria-hidden) — 같은 정보는 패널의 장소 줄(버튼)이 말해 준다.
import type { CSSProperties } from 'react'
import { getBuilding } from '../data'
import type { BuildingId } from '../data/types'
import { estimateTextWidth } from './buildingLabels'
import { PIN_R, roofPoint } from './eventLayout'
import { starPath } from './icons'

const SCALE = 'calc(var(--ik, 1) * var(--ui-scale, 1))'
const HEAD_SIZE = 13.5
const SUB_SIZE = 11.5
const LABEL_H = 40
const STEM = 12
const STAR = starPath(6.4)
const LABEL_STAR = starPath(6.2)
const LABEL_STAR_W = 13 // 이름표 위 줄 앞의 금별 폭
const LABEL_STAR_GAP = 5

/** 이름표 위 줄 (고정 문구) */
export const VENUE_LABEL = '설명회 장소'

export function VenueLayer({ buildingId }: { buildingId: BuildingId }) {
  const b = getBuilding(buildingId)
  if (!b) return null
  const [x, y] = roofPoint(b)
  const headW = Math.ceil(estimateTextWidth(VENUE_LABEL, HEAD_SIZE)) + LABEL_STAR_W + LABEL_STAR_GAP
  const w = Math.ceil(Math.max(headW, estimateTextWidth(b.name, SUB_SIZE)) + 34)
  const headX = (w - headW) / 2
  const top = -(PIN_R + STEM + LABEL_H)
  const style: CSSProperties = { transform: `translate(${x}px, ${y}px) scale(${SCALE})` }
  return (
    <g aria-hidden="true" pointerEvents="none" className="venue-mark" style={style}>
      <circle className="ev-pin-pulse" r={PIN_R + 2} />
      <path d={`M0 ${-PIN_R + 2}V${-(PIN_R + STEM)}`} stroke="rgb(var(--navy) / 0.75)" strokeWidth={1.6} strokeLinecap="round" />
      <ellipse cx={0} cy={PIN_R - 1} rx={PIN_R + 1} ry={3} fill="#0b1220" fillOpacity={0.22} />
      <circle r={PIN_R} style={{ fill: 'rgb(var(--star))', stroke: 'rgb(var(--navy))', strokeWidth: 2.2 }} />
      <path d={STAR} style={{ fill: 'rgb(var(--navy))' }} transform="translate(0 -0.3)" />
      <g transform={`translate(${-w / 2} ${top})`}>
        <rect x={1} y={3} width={w} height={LABEL_H} rx={12} className="ev-card-shadow" />
        {/* 흰 카드 + 금빛 테두리 + 금별 (어두운 덩어리 없이 지도 위에서 또렷하게) */}
        <rect x={0} y={0} width={w} height={LABEL_H} rx={12} style={{ fill: 'rgb(var(--surface))', stroke: 'rgb(var(--star))', strokeWidth: 1.8 }} />
        <path d={LABEL_STAR} transform={`translate(${headX + LABEL_STAR_W / 2} 15)`} style={{ fill: 'rgb(var(--star))', stroke: 'rgb(var(--star-deep))', strokeWidth: 0.9, strokeLinejoin: 'round' }} />
        <text x={headX + LABEL_STAR_W + LABEL_STAR_GAP} y={15} textAnchor="start" dominantBaseline="central" style={{ fontSize: HEAD_SIZE, fontWeight: 800, letterSpacing: '0.01em', fill: 'rgb(var(--gold-deep))' }}>
          {VENUE_LABEL}
        </text>
        <text x={w / 2} y={30} textAnchor="middle" dominantBaseline="central" style={{ fontSize: SUB_SIZE, fontWeight: 650, fill: 'rgb(var(--navy))' }}>
          {b.name}
        </text>
      </g>
    </g>
  )
}
