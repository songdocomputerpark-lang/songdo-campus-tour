/**
 * features/event/FloorStack.tsx — 건물 층 구성 미니 아이소메트릭 도해 ("몇 층에 있는지 한눈에")
 *
 *  학교 인쇄 시설배치도처럼 층을 평행사변형 슬래브로 쌓아 올린다. 위층이 위.
 *  · 찾는 층: 건물 색으로 채우고 "여기 ★5" 태그, 그 층 칸 한가운데 금빛 번호 표식
 *  · 같은 건물의 다른 안내 장소 층: 연한 슬래브에 ★번호만 살짝
 *  · 층 이름은 왼쪽(B1 · 1F …). 건물 층 구성은 campus.json(building.floors) 그대로 — 없는 층을 만들지 않는다.
 *  · 슬래브 비율은 건물 외곽의 가로:세로 비(긴 건물은 납작하게, 세로로 긴 건물은 깊게) — 장식적 근사일 뿐 실제 치수가 아니다.
 */
import { useId } from 'react'
import type { Building, FloorId } from '../../data/types'
import { floorLabel } from '../../data'
import { shade, tint } from '../../lib/color'
import { boundsOf } from '../../lib/geometry'
import { flagPath, starPath } from '../../map/icons'
import { useIsNarrow } from '../../ui/useMedia'
import type { Spot } from '../tour/spots'

/** 치수 한 벌: 데스크톱(넉넉) · 폰(촘촘 — 반쯤 연 시트에서 찾는 층과 태그가 접힌 선 위에 보이게) */
interface Metrics {
  T: number // 슬래브 두께
  GAP: number // 층 사이 간격
  LABEL_W: number
  TAG_W: number
  /** 층 이름 글자 · 태그 글자 크기 */
  labelFs: number
  tagFs: number
  tagH: number
  /** 슬래브 위 표식 배율 */
  mark: number
}
const ROOMY: Metrics = { T: 6, GAP: 13, LABEL_W: 34, TAG_W: 84, labelFs: 13, tagFs: 12.5, tagH: 24, mark: 1 }
const COMPACT: Metrics = { T: 4, GAP: 6, LABEL_W: 28, TAG_W: 74, labelFs: 12, tagFs: 12, tagH: 22, mark: 0.86 }
/** 폰에서 그림 전체 높이 목표(px, viewBox 1단위 = 화면 1px). 5층이면 약 165px */
const COMPACT_H = 170

const STAR = starPath(5.2)
const FLAG = flagPath(5)

interface Dim {
  W: number
  D: number
}
function dimsFor(b: Building): Dim {
  const bb = boundsOf(b.poly)
  const r = bb.w / Math.max(1, bb.h)
  if (r >= 1.8) return { W: 196, D: 34 }
  if (r >= 1) return { W: 160, D: 46 }
  return { W: 122, D: 56 }
}
/** 폰용: 가로를 줄이고, 슬래브 깊이는 층 수에 맞춰 전체 높이가 COMPACT_H 안에 들게 한다 */
function dimsCompact(b: Building, floorCount: number, m: Metrics): Dim {
  const { W, D } = dimsFor(b)
  const room = Math.floor((COMPACT_H - 6) / Math.max(1, floorCount)) - m.T - m.GAP
  return { W: Math.round(W * 0.8), D: Math.max(16, Math.min(Math.round(D * 0.7), room)) }
}

export function FloorStack({
  building,
  target,
  marks,
  className = '',
}: {
  building: Building
  /** 찾는 장소 */
  target: Spot
  /** 같은 건물의 안내 장소 전체(찾는 장소 포함, 층별 표시에 쓴다) */
  marks: Spot[]
  className?: string
}) {
  const uid = useId().replace(/:/g, '')
  const narrow = useIsNarrow()
  const m = narrow ? COMPACT : ROOMY
  const { T, GAP, LABEL_W, TAG_W } = m
  const floors = [...building.floors].reverse() // 위층이 위
  const n = floors.length
  const { W, D } = narrow ? dimsCompact(building, n, m) : dimsFor(building)
  const sk = Math.round(D * 0.95)
  const P = D + T + GAP
  const vbW = LABEL_W + W + sk + TAG_W
  const vbH = n * P + 6
  const x0 = LABEL_W
  const top = shade(building.color, 0.12)
  const side = shade(building.color, 0.32)
  const side2 = shade(building.color, 0.22)

  const byFloor = new Map<FloorId, Spot[]>()
  for (const s of marks) byFloor.set(s.floorId, [...(byFloor.get(s.floorId) ?? []), s])

  const tagText = target.no === null ? '여기 출발' : `여기 ★${target.no}`
  const summary = floors
    .map((f) => {
      const here = byFloor.get(f) ?? []
      const names = here.map((s) => (s.no === null ? `출발 ${s.label}` : `★${s.no} ${s.label}`)).join(', ')
      return names ? `${floorLabel(f)} ${names}${f === target.floorId ? ' (찾는 곳)' : ''}` : ''
    })
    .filter(Boolean)
    .join(' · ')

  return (
    <figure className={`m-0 ${className}`}>
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        className={`mx-auto block h-auto ${narrow ? 'max-w-full' : 'w-full max-w-[22rem]'}`}
        width={narrow ? vbW : undefined}
        role="img"
        aria-label={`${building.name} 층 구성. ${summary}`}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={`fs-top-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={tint(building.color, 0.82)} />
            <stop offset="1" stopColor={top} />
          </linearGradient>
        </defs>

        {/* 층을 잇는 가는 점선(모서리) — 하나의 건물로 읽히게 */}
        <g aria-hidden="true" stroke={shade(building.color, 0.1)} strokeOpacity={0.28} strokeDasharray="2 4" strokeWidth={1}>
          <line x1={x0} y1={D} x2={x0} y2={(n - 1) * P + D} />
          <line x1={x0 + W} y1={D} x2={x0 + W} y2={(n - 1) * P + D} />
          <line x1={x0 + W + sk} y1={0} x2={x0 + W + sk} y2={(n - 1) * P} />
        </g>

        {floors.map((f, i) => {
          const y = i * P
          const isTarget = f === target.floorId
          const here = byFloor.get(f) ?? []
          const others = here.filter((s) => s.roomId !== target.roomId)
          const cx = x0 + (W + sk) / 2
          const cy = y + D / 2
          const order = n - 1 - i // 아래층부터 차례로 나타나게
          return (
            <g key={f} className="animate-fade-up" style={{ animationDelay: `${order * 70}ms` }}>
              {/* 층 이름 */}
              <text
                x={LABEL_W - 8}
                y={cy + 0.5}
                textAnchor="end"
                dominantBaseline="central"
                className="tnum"
                style={{ fontSize: m.labelFs, fontWeight: isTarget ? 800 : 650, fill: isTarget ? 'rgb(var(--navy))' : 'rgb(var(--ink-mute))' }}
              >
                {f}
              </text>
              {/* 바닥 그림자 */}
              <polygon points={`${x0 + 4},${y + D + T + 2} ${x0 + W + 4},${y + D + T + 2} ${x0 + W + sk + 2},${y + T + 2} ${x0 + sk + 2},${y + T + 2}`} fill="#0b1220" fillOpacity={isTarget ? 0.14 : 0.05} />
              {/* 앞면 · 오른쪽 옆면 */}
              <polygon points={`${x0},${y + D} ${x0 + W},${y + D} ${x0 + W},${y + D + T} ${x0},${y + D + T}`} fill={isTarget ? side : tint(building.color, 0.42)} />
              <polygon
                points={`${x0 + W},${y + D} ${x0 + W + sk},${y} ${x0 + W + sk},${y + T} ${x0 + W},${y + D + T}`}
                fill={isTarget ? side2 : tint(building.color, 0.34)}
              />
              {/* 윗면 */}
              <polygon
                points={`${x0 + sk},${y} ${x0 + W + sk},${y} ${x0 + W},${y + D} ${x0},${y + D}`}
                fill={isTarget ? `url(#fs-top-${uid})` : tint(building.color, 0.16)}
                stroke={isTarget ? shade(building.color, 0.3) : tint(building.color, 0.55)}
                strokeWidth={isTarget ? 1.6 : 1}
                strokeLinejoin="round"
              />
              {isTarget && <polygon points={`${x0 + sk},${y} ${x0 + W + sk},${y} ${x0 + W},${y + D} ${x0},${y + D}`} fill="none" stroke="rgb(var(--star))" strokeOpacity={0.9} strokeWidth={2.4} strokeLinejoin="round" />}

              {/* 다른 안내 장소의 별표 */}
              {!isTarget &&
                others.map((s, j) => (
                  <Mark key={s.roomId} spot={s} x={cx + (j - (others.length - 1) / 2) * 34 * m.mark} y={cy} small k={m.mark} />
                ))}

              {/* 찾는 장소: 한가운데 표식 + "여기 ★n" 태그 */}
              {isTarget && (
                <>
                  <Mark spot={target} x={cx} y={cy} k={m.mark} />
                  {others.map((s, j) => (
                    <Mark key={s.roomId} spot={s} x={cx + (36 + j * 34) * m.mark} y={cy} small k={m.mark} />
                  ))}
                  <line x1={x0 + W + sk + 4} y1={cy} x2={x0 + W + sk + 13} y2={cy} stroke="rgb(var(--navy))" strokeWidth={1.4} strokeLinecap="round" />
                  <g transform={`translate(${x0 + W + sk + 13} ${cy})`}>
                    <rect x={0} y={-m.tagH / 2} width={TAG_W - 16} height={m.tagH} rx={m.tagH / 2} style={{ fill: 'rgb(var(--gold-50))', stroke: 'rgb(var(--star-deep) / 0.7)', strokeWidth: 1.2 }} />
                    <text x={(TAG_W - 16) / 2} y={0.6} textAnchor="middle" dominantBaseline="central" style={{ fontSize: m.tagFs, fontWeight: 800, fill: 'rgb(var(--navy))' }}>
                      {tagText}
                    </text>
                  </g>
                </>
              )}
            </g>
          )
        })}
      </svg>
      <figcaption className="mt-2 text-center text-[0.75rem] leading-snug text-ink-mute">
        {building.name} 층 구성 · 위가 높은 층 <span className="text-line-strong">·</span> 모양은 모식도입니다
      </figcaption>
    </figure>
  )
}

/** 슬래브 위 ★번호 표식(금색 알약) / 출발 깃발(흰 바탕 + 금빛 테두리) */
function Mark({ spot, x, y, small = false, k = 1 }: { spot: Spot; x: number; y: number; small?: boolean; k?: number }) {
  const start = spot.no === null
  const w = small ? 28 : 38
  const h = small ? 18 : 24
  return (
    <g transform={`translate(${x} ${y})${k === 1 ? '' : ` scale(${k})`}`}>
      <rect x={-w / 2 + 1} y={-h / 2 + 2.4} width={w} height={h} rx={h / 2} fill="#0b1220" fillOpacity={0.22} />
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        rx={h / 2}
        style={{ fill: start ? 'rgb(var(--surface))' : 'rgb(var(--star))', stroke: 'rgb(var(--star-deep) / 0.7)', strokeWidth: start ? 1.6 : 1.1 }}
      />
      {start ? (
        <path d={FLAG} transform={`scale(${small ? 0.9 : 1.15}) translate(0.6 0)`} fill="none" stroke="rgb(var(--navy))" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <>
          <path d={STAR} transform={`translate(${small ? -6.4 : -8.6} -0.3) scale(${small ? 0.82 : 1.05})`} style={{ fill: 'rgb(var(--navy))' }} />
          <text x={small ? 5.5 : 6.5} y={0.7} textAnchor="middle" dominantBaseline="central" style={{ fontSize: small ? 11 : 14, fontWeight: 800, fill: 'rgb(var(--navy))' }}>
            {spot.no}
          </text>
        </>
      )}
    </g>
  )
}
