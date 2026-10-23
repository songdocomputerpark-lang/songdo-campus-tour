/**
 * features/detail/PhotoPlaceholder.tsx — 사진이 없는 시설/건물의 플레이스홀더 (SPEC §4.4)
 *
 *  · 건물 색을 연하게 푼 밝은 그라디언트 + 미세한 도면 격자(밝은 청사진 느낌 — 어두운 덩어리를 만들지 않는다)
 *  · 미니맵: 해당 층 slab 외곽선 안에서 시설(방)의 위치를 금색으로 강조 (roomId 가 없으면 건물 외곽선 모형만)
 *  · "사진 준비 중" — 가짜 사진은 절대 쓰지 않는다
 * 사용처: DetailPanel · BuildingDetail · ui/BuildingCard · Gallery(이미지 로드 실패) · TourBar
 * props 만 사용(스토어를 읽지 않음). 크기는 호출 측이 정한다(예: "aspect-[16/9]"). 없으면 16:9.
 */
import { Camera } from 'lucide-react'
import { useMemo, type CSSProperties } from 'react'
import { floorLabel, getBuilding, getRoom } from '../../data'
import type { Bounds, BuildingId, Pt } from '../../data/types'
import { tint } from '../../lib/color'
import { boundsOf, centroid, clamp, expandBounds, polygonPoints, translatePoly, unionBounds } from '../../lib/geometry'

export interface PhotoPlaceholderProps {
  buildingId: BuildingId
  /** 강조할 시설(방) id — 미니맵에 위치 표시 */
  roomId?: string
  /** 기본 "사진 준비 중" */
  label?: string
  /** 크기는 호출 측이 정한다 (예: "aspect-[16/9]") */
  className?: string
}

interface Overview {
  vb: string
  aspect: number
  win: Bounds
  ovb: Bounds
}

interface MiniMap {
  vb: string
  /** 창(확대 보기)이 슬랩 가장자리를 잘라낼 때 해당 쪽을 흐리게 */
  fade: { l: boolean; r: boolean }
  slab: Pt[]
  others: Pt[][]
  target: Pt[] | null
  center: Pt | null
  ringR: number
  depth: number
  tag: string
  description: string
  /** 아주 길쭉한 층(본관동 등): 시설 주변만 확대해 보여 주고, 전체 위치는 작은 개요도로 */
  overview: Overview | null
}

/** 미니맵 영역(16:9 카드 안에서 약 86% × 62%)의 가로세로비 */
const WINDOW_ASPECT = 2.5
const ELONGATED = 3.2

const cache = new Map<string, MiniMap | null>()

/** 건물/시설 → 미니맵 기하(캐시). 데이터는 정적이라 한 번만 계산한다. */
function miniMapFor(buildingId: BuildingId, roomId?: string): MiniMap | null {
  const key = `${buildingId}|${roomId ?? ''}`
  if (cache.has(key)) return cache.get(key) ?? null
  const building = getBuilding(buildingId)
  const ref = roomId ? getRoom(roomId) : undefined
  let result: MiniMap | null = null

  if (ref && ref.building.id === buildingId) {
    const { floor, room } = ref
    const all = unionBounds([boundsOf(floor.slab), ...floor.rooms.map((r) => boundsOf(r.poly))])
    const rb = boundsOf(room.poly)
    const span = Math.max(all.w, all.h)
    const depth = span * 0.012
    let vbb: Bounds = expandBounds(all, span * 0.05 + depth)
    let fade = { l: false, r: false }
    let overview: Overview | null = null
    let ringR = Math.max(Math.max(rb.w, rb.h) * 0.72, span * 0.04)

    if (all.w / all.h > ELONGATED) {
      const hw = Math.max(all.h * 1.9, rb.h * 2.4)
      const ww = hw * WINDOW_ASPECT
      if (ww < all.w * 0.9) {
        const pad = hw * 0.06
        const cx = clamp(rb.x + rb.w / 2, all.x + ww / 2 - pad, all.x + all.w - ww / 2 + pad)
        vbb = { x: cx - ww / 2, y: all.y + all.h / 2 - hw / 2, w: ww, h: hw }
        fade = { l: vbb.x > all.x + 1, r: vbb.x + vbb.w < all.x + all.w - 1 }
        ringR = Math.max(Math.max(rb.w, rb.h) * 0.72, hw * 0.13)
        const op = all.w * 0.02
        const ow = all.w + op * 2
        const oh = Math.max(all.h + op * 2, ow / 9)
        const ovb: Bounds = { x: all.x - op, y: all.y + all.h / 2 - oh / 2, w: ow, h: oh }
        overview = { vb: `${ovb.x} ${ovb.y} ${ovb.w} ${ovb.h}`, aspect: ow / oh, win: vbb, ovb }
      }
    }
    // 링이 미니맵 영역 밖으로 잘리지 않도록 가장 가까운 가장자리까지로 제한
    const c = centroid(room.poly)
    const room2edge = Math.min(c[0] - vbb.x, vbb.x + vbb.w - c[0], c[1] - vbb.y, vbb.y + vbb.h - c[1])
    ringR = Math.min(ringR, room2edge * 0.97)
    result = {
      vb: `${vbb.x} ${vbb.y} ${vbb.w} ${vbb.h}`,
      fade,
      slab: floor.slab,
      others: floor.rooms.filter((r) => r.id !== room.id).map((r) => r.poly),
      target: room.poly,
      center: c,
      ringR,
      depth: overview ? vbb.h * 0.03 : depth,
      tag: `${ref.building.en} · ${floor.floor}`,
      description: `${ref.building.name} ${floorLabel(floor.floor)} 평면에서 ${room.name}의 위치를 표시한 약도`,
      overview,
    }
  } else if (building) {
    const bb = boundsOf(building.poly)
    const span = Math.max(bb.w, bb.h)
    const depth = span * 0.045
    const vbb = expandBounds(bb, span * 0.07, span * 0.07, span * 0.07, span * 0.07 + depth)
    result = {
      vb: `${vbb.x} ${vbb.y} ${vbb.w} ${vbb.h}`,
      fade: { l: false, r: false },
      slab: building.poly,
      others: [],
      target: null,
      center: null,
      ringR: 0,
      depth,
      tag: building.en,
      description: `${building.name} 외곽 모형`,
      overview: null,
    }
  }
  cache.set(key, result)
  return result
}

/** 창이 슬랩을 잘라낸 쪽은 서서히 사라지게 */
function fadeMask(f: { l: boolean; r: boolean }): CSSProperties | undefined {
  if (!f.l && !f.r) return undefined
  const g = `linear-gradient(90deg, ${f.l ? 'transparent 0, #000 11%' : '#000 0'}, ${f.r ? '#000 89%, transparent 100%' : '#000 100%'})`
  return { WebkitMaskImage: g, maskImage: g }
}

const STROKE = 'rgb(11 31 75 / 0.5)'
const STROKE_SOFT = 'rgb(11 31 75 / 0.2)'
const FILL_SLAB = 'rgb(255 255 255 / 0.72)'
const FILL_SOFT = 'rgb(255 255 255 / 0.38)'
const SHADOW = 'rgb(11 31 75 / 0.14)'
const GOLD = 'rgb(var(--star))'
const GOLD_EDGE = 'rgb(var(--star-deep))'

export function PhotoPlaceholder({ buildingId, roomId, label = '사진 준비 중', className = '' }: PhotoPlaceholderProps) {
  const b = getBuilding(buildingId)
  const c = b?.color ?? '#8b8d93'
  const mini = useMemo(() => miniMapFor(buildingId, roomId), [buildingId, roomId])
  const sized = /(^|\s)(aspect-|h-|min-h-)/.test(className)
  const buildingOnly = !mini?.target

  const background = [
    'radial-gradient(120% 95% at 14% 0%, rgb(255 255 255 / 0.55), transparent 58%)',
    'linear-gradient(rgb(11 31 75 / 0.06) 1px, transparent 1px) 0 0 / 22px 22px',
    'linear-gradient(90deg, rgb(11 31 75 / 0.06) 1px, transparent 1px) 0 0 / 22px 22px',
    `linear-gradient(135deg, ${tint(c, 0.2)} 0%, ${tint(c, 0.42)} 100%)`,
  ].join(', ')

  return (
    <div
      role="img"
      aria-label={mini ? `${label}. ${mini.description}` : label}
      className={`relative w-full select-none overflow-hidden ${sized ? '' : 'aspect-[16/9]'} ${className}`}
      style={{ background }}
    >
      {mini && (
        <svg
          viewBox={mini.vb}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          className="absolute left-[7%] top-[13%] h-[62%] w-[86%] overflow-hidden"
          style={fadeMask(mini.fade)}
        >
          {/* 바닥 그림자 */}
          <polygon points={polygonPoints(translatePoly(mini.slab, mini.depth * 0.5, mini.depth))} fill={SHADOW} />
          {/* 슬랩(또는 건물 외곽) */}
          <polygon
            points={polygonPoints(mini.slab)}
            fill={buildingOnly ? 'rgb(255 255 255 / 0.92)' : FILL_SLAB}
            stroke={STROKE}
            strokeWidth={1.2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {mini.others.map((p, i) => (
            <polygon
              key={i}
              points={polygonPoints(p)}
              fill={FILL_SOFT}
              stroke={STROKE_SOFT}
              strokeWidth={0.8}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {mini.target && mini.center && (
            <>
              <polygon points={polygonPoints(translatePoly(mini.target, mini.depth * 0.3, mini.depth * 0.55))} fill="rgb(11 31 75 / 0.2)" />
              <circle cx={mini.center[0]} cy={mini.center[1]} r={mini.ringR} fill={GOLD} fillOpacity={0.2} stroke={GOLD_EDGE} strokeOpacity={0.7} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <polygon
                points={polygonPoints(mini.target)}
                fill={GOLD}
                fillOpacity={0.62}
                stroke={GOLD_EDGE}
                strokeWidth={1.8}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>
      )}

      {/* 길쭉한 층: 전체 중 어디인지 보여 주는 작은 개요도 */}
      {mini?.overview && mini.target && (
        <svg
          viewBox={mini.overview.vb}
          aria-hidden="true"
          className="absolute bottom-3 right-3.5 w-[34%] rounded-md bg-white/70 p-1 ring-1 ring-navy/15"
          style={{ aspectRatio: `${mini.overview.aspect + 0.08}` }}
        >
          <polygon points={polygonPoints(mini.slab)} fill={FILL_SLAB} stroke={STROKE} strokeWidth={1} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <rect
            x={mini.overview.win.x}
            y={mini.overview.ovb.y}
            width={mini.overview.win.w}
            height={mini.overview.ovb.h}
            fill="rgb(var(--primary) / 0.14)"
            stroke="rgb(var(--primary))"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <polygon points={polygonPoints(mini.target)} fill={GOLD} stroke={GOLD_EDGE} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </svg>
      )}

      {mini && (
        <span className="eyebrow absolute left-3.5 top-3 text-[0.6875rem] text-navy" style={{ fontVariantNumeric: 'lining-nums' }} aria-hidden="true">
          {mini.tag}
        </span>
      )}

      <span className="absolute bottom-3 left-3.5 inline-flex items-center gap-1.5 rounded-full bg-white/90 py-1 pl-2.5 pr-3 text-[0.75rem] font-semibold text-ink-soft shadow-soft ring-1 ring-line">
        <Camera size={13} strokeWidth={1.9} aria-hidden="true" />
        {label}
      </span>
    </div>
  )
}
