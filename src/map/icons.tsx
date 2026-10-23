// 지도용 인라인 SVG 아이콘 (외부 아이콘 폰트 없음). 24×24 좌표, 선 아이콘.
//  - <CoreGlyph> : 층 평면도 SVG 안(월드 좌표)에서 코어 아이콘을 (x,y) 중심, size 단위로 그린다
//  - <CoreIconInline> : HTML(범례·툴팁)용 독립 SVG
import type { CoreType } from '../data/types'

export const CORE_LABELS: Record<CoreType, string> = {
  stairs: '계단',
  elevator: '승강기',
  toilet: '화장실',
  aed: '자동심장충격기 (AED)',
  kit: '재난대응물품 보관함',
  entrance: '출입구',
  bridge: '연결통로',
}

function Glyph({ type }: { type: CoreType }) {
  switch (type) {
    case 'stairs':
      return <path d="M4 19h4.5v-4.5H13V10h4.5V5.5H20" />
    case 'elevator':
      return (
        <>
          <rect x="5" y="3.5" width="14" height="17" rx="2.2" />
          <path d="M12 7.6l-2.6 3.2h5.2z" fill="currentColor" stroke="none" />
          <path d="M12 16.4l2.6-3.2H9.4z" fill="currentColor" stroke="none" />
        </>
      )
    case 'toilet':
      return (
        <>
          <circle cx="7.6" cy="5.2" r="1.7" />
          <path d="M7.6 8.6v6.2M5 10.4h5.2M7.6 14.8V20" />
          <circle cx="16.4" cy="5.2" r="1.7" />
          <path d="M16.4 8.6l-3 7.2h6z" />
          <path d="M15.4 15.8V20M17.4 15.8V20" />
        </>
      )
    case 'aed':
      return (
        <>
          <path d="M12 20.2S4.6 15.9 4.6 10a4.1 4.1 0 0 1 7.4-2.4A4.1 4.1 0 0 1 19.4 10c0 5.9-7.4 10.2-7.4 10.2z" />
          <path d="M12.9 8.8l-2.4 3.6h2.6l-1.9 3.3" />
        </>
      )
    case 'kit':
      return (
        <>
          <rect x="3.5" y="7.2" width="17" height="12.6" rx="2" />
          <path d="M9 7.2V5h6v2.2M12 10.4v6.2M8.9 13.5h6.2" />
        </>
      )
    case 'entrance':
      return <path d="M4 12h10.5M10.5 7.5L15 12l-4.5 4.5M18.5 4.5v15" />
    case 'bridge':
      return <path d="M3 8.5h18M3 15.5h18M6.5 8.5v7M12 8.5v7M17.5 8.5v7" />
  }
}

/** 월드 좌표용: (x, y) 중심, size = 한 변 길이(월드 단위). badge=true 면 종이색 원형 배경 */
export function CoreGlyph({
  type,
  x,
  y,
  size,
  color = '#0b1f4b',
  badge = true,
}: {
  type: CoreType
  x: number
  y: number
  size: number
  color?: string
  badge?: boolean
}) {
  const s = size / 24
  return (
    <g transform={`translate(${x - size / 2} ${y - size / 2}) scale(${s})`} style={{ color }} pointerEvents="none">
      {badge && <circle cx="12" cy="12" r="12.2" fill="#fffdf8" fillOpacity="0.94" stroke="currentColor" strokeOpacity="0.28" strokeWidth="0.9" />}
      <g
        transform={badge ? 'translate(3.6 3.6) scale(0.7)' : undefined}
        fill="none"
        stroke="currentColor"
        strokeWidth={badge ? 2 : 1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Glyph type={type} />
      </g>
    </g>
  )
}

/** HTML 용 */
export function CoreIconInline({ type, size = 20, className }: { type: CoreType; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <Glyph type={type} />
    </svg>
  )
}

// ───────────── 학생 안내 장소(★) 표식 ─────────────

/** 원점 중심 오각별 경로 (반지름 r, 꼭짓점이 위) */
export function starPath(r: number): string {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 === 0 ? r : r * 0.46
    pts.push(`${(Math.cos(a) * rr).toFixed(2)} ${(Math.sin(a) * rr).toFixed(2)}`)
  }
  return `M${pts.join('L')}Z`
}

/** 원점 중심 깃발(출발 표시), 높이 ≈ 2r */
export function flagPath(r: number): string {
  const s = r / 6
  return `M${-4 * s} ${6 * s}V${-6 * s}M${-4 * s} ${-5.4 * s}h${7.6 * s}l${-1.9 * s} ${2.6 * s}l${1.9 * s} ${2.6 * s}h${-7.6 * s}`
}

/** 안내 장소 색: ★ = 엠블럼 금색(남색 글자), 출발 = 흰 바탕 + 금빛 테두리(남색 깃발·글자) — 밝은 지도 위에서 덩어리가 지지 않게 */
export const SPOT_STAR_FILL = 'rgb(var(--star))'
export const SPOT_START_FILL = 'rgb(var(--surface))'
export const SPOT_START_INK = 'rgb(var(--navy))'
export const SPOT_START_EDGE = 'rgb(var(--star-deep))'

/** 방위 화살표 본체(0° = 위쪽이 북). 지름 d 의 원 안에 그려진다. */
export function NorthNeedle({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-20 -20 40 40" aria-hidden="true">
      <circle r="18.5" fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1" />
      <path d="M0 -15 L4.6 3 L0 0.2 L-4.6 3 Z" fill="rgb(var(--gold))" />
      <path d="M0 15 L4.6 -3 L0 -0.2 L-4.6 -3 Z" fill="currentColor" fillOpacity="0.42" />
      <circle r="1.4" fill="rgb(var(--surface))" stroke="currentColor" strokeWidth="0.8" />
    </svg>
  )
}
