// 층 평면도 (순수 SVG). 좌표계 = floors.json 의 층 size 좌표 (y 아래).
//  · 슬랩(복도 포함 외곽) 위에 방(카테고리별 건물색 명도), 코어(계단·승강기·화장실·AED·재난물품함·출입구·연결통로)
//  · 라벨은 방 공간에 맞춰 자동 크기 — 줌 단계(useMapScale)에 따라 숨김/표시
//  · '도면 보기' 켜면 원본 CAD 레이어(floor.image)를 슬랩으로 clipPath 하여 방 아래 반투명 표시
//  · 층 전환: 이전 층을 잠시 남겨 두고 위/아래 방향으로 슬라이드+페이드 (CSS animation, index.css .floor-in/.floor-out)
//  · 방 선택: 같은 모양의 '떠오른' 복제본(외곽선+그림자)을 최상단에 그려 DOM 순서를 바꾸지 않는다(키보드 포커스 유지)
//  · 접근성: 방 = <g role="button" tabIndex=0 aria-label="본관동 2층 1-1"> (Enter/Space), 목록 보기는 패널(FloorList)
//  · 학생 안내 장소(★, features/tour/spots): 금빛 바탕·외곽선 + 방 이름 자리에 화면 크기 고정 배지 "★3 중앙현관" (출발 지점은 남색)
//  · 입학설명회 안내(#/event)에서 들어온 경우(event.active) 선택한 안내 장소 방에는 배지 아래에 부드러운 비콘(파문)이 번진다
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { floorLabel, getBuilding, getFloor } from '../data'
import type { Building, Bounds, Core, Floor, Insets, Pt, Room } from '../data/types'
import { spotAria, spotFloorKey, useSpots, type Spot } from '../features/tour/spots'
import { assetUrl } from '../lib/content'
import { isNarrowViewport } from '../lib/env'
import { mix, shade, tint } from '../lib/color'
import { boundsOf, centroid, expandBounds, polygonPoints } from '../lib/geometry'
import { estimateTextWidth } from './buildingLabels'
import { useAppStore } from '../store/useAppStore'
import { CAT_KEEP } from './categoryTint'
import { CoreGlyph, flagPath, SPOT_START_EDGE, SPOT_START_FILL, SPOT_START_INK, SPOT_STAR_FILL, starPath } from './icons'
import { registerMap } from './mapBus'
import { MapViewport } from './MapViewport'
import { LABEL_LINE_HEIGHT, layoutLabel, textEm, type LabelLayout } from './roomLayout'
import { retapZoom, type PanZoomApi } from './usePanZoom'

export interface FloorPlanProps {
  active?: boolean
  insets: Insets
  className?: string
}

const LABEL_MIN_PX = 8.5
const LABEL_MAX_PX = 17

// ───────────── 정적 캐시 ─────────────

const layoutCache = new Map<string, LabelLayout>()
function labelLayout(room: Room): LabelLayout {
  let l = layoutCache.get(room.id)
  if (!l) {
    l = layoutLabel(room)
    layoutCache.set(room.id, l)
  }
  return l
}

function slabBounds(f: Floor): Bounds {
  return boundsOf(f.slab)
}

/** slab 에서 가장 가까운 변의 안쪽 법선 (출입구 화살표 방향) */
function entranceDir(slab: Pt[], at: Pt): { out: Pt } {
  let best = Infinity
  let out: Pt = [0, 1]
  for (let i = 0; i < slab.length; i++) {
    const p = slab[i]
    const q = slab[(i + 1) % slab.length]
    const dx = q[0] - p[0]
    const dy = q[1] - p[1]
    const l2 = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((at[0] - p[0]) * dx + (at[1] - p[1]) * dy) / l2))
    const d = Math.hypot(at[0] - (p[0] + t * dx), at[1] - (p[1] + t * dy))
    if (d < best) {
      best = d
      const len = Math.sqrt(l2)
      const c = centroid(slab)
      const n: Pt = [dy / len, -dx / len]
      const mid: Pt = [p[0] + t * dx, p[1] + t * dy]
      // 바깥쪽: 중심에서 멀어지는 방향
      const sgn = (mid[0] - c[0]) * n[0] + (mid[1] - c[1]) * n[1] >= 0 ? 1 : -1
      out = [n[0] * sgn, n[1] * sgn]
    }
  }
  return { out }
}

// ───────────── 화면 크기 고정 헬퍼 ─────────────

function ScreenAt({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <g style={{ transform: `translate(${x}px, ${y}px) scale(calc(var(--ik, 1) * var(--ui-scale, 1)))` }} pointerEvents="none">
      {children}
    </g>
  )
}

// ───────────── 방 ─────────────

function RoomLabel({ layout, sub, k }: { layout: LabelLayout; sub: string | null; k: number }) {
  const fs = Math.min(layout.fs, LABEL_MAX_PX / k)
  if (fs * k < LABEL_MIN_PX) return null
  const lh = fs * LABEL_LINE_HEIGHT
  const total = layout.lines.length * lh
  const y0 = layout.y - total / 2 + lh / 2
  const showSub = !!sub && fs * k >= 12 && textEm(sub) * fs * 0.62 <= layout.boxW
  return (
    <g className="room-label" pointerEvents="none">
      {layout.lines.map((ln, i) => (
        <text key={i} x={layout.x} y={y0 + i * lh - (showSub ? fs * 0.3 : 0)} textAnchor="middle" dominantBaseline="central" style={{ fontSize: fs, strokeWidth: fs * 0.2 }}>
          {ln}
        </text>
      ))}
      {showSub && (
        <text x={layout.x} y={y0 + total - lh / 2 + fs * 0.72 - fs * 0.3} textAnchor="middle" dominantBaseline="central" style={{ fontSize: fs * 0.62, strokeWidth: fs * 0.12, opacity: 0.8 }}>
          {sub}
        </text>
      )}
    </g>
  )
}

interface Palette {
  fill: string
  hover: string
  stroke: string
  sel: string
}
/** ★ 안내 장소 바탕: 건물 색조에 엠블럼 금색을 섞는다 (출발 지점은 건물 색 그대로 — 남색 점선 외곽으로 구분) */
const STAR_TINT = '#ffd84d'

function paletteFor(building: Building, cat: Room['cat'], spot?: Spot): Palette {
  const keep = CAT_KEEP[cat] ?? 0.4
  const star = !!spot && spot.no !== null
  const base = (k: number) => (star ? mix(tint(building.color, k), STAR_TINT, 0.62) : tint(building.color, k))
  return {
    fill: base(keep),
    hover: base(Math.min(1, keep + 0.14)),
    stroke: shade(building.color, 0.3),
    sel: base(Math.min(1, keep + 0.22)),
  }
}

const RoomShape = memo(function RoomShape({
  room,
  pal,
  ariaLabel,
  selected,
  onSelect,
  k,
  spot,
}: {
  room: Room
  pal: Palette
  ariaLabel: string
  selected: boolean
  onSelect: (id: string) => void
  k: number
  /** 학생 안내 장소면 방 이름 대신 SpotBadge 가 이름을 보여 준다 */
  spot?: Spot
}) {
  const layout = labelLayout(room)
  const style = { '--f': pal.fill, '--fh': pal.hover, '--s': pal.stroke } as CSSProperties
  const onKey = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(room.id)
    }
  }
  return (
    <g
      className="room"
      data-hit=""
      data-selected={selected}
      data-conf={room.conf}
      data-spot={spot ? (spot.no === null ? 'start' : 'star') : undefined}
      role="button"
      tabIndex={0}
      aria-label={spot ? `${ariaLabel}, ${spotAria(spot)}` : ariaLabel}
      aria-pressed={selected}
      style={style}
      onClick={() => onSelect(room.id)}
      onKeyDown={onKey}
    >
      <polygon className="room-shape" points={polygonPoints(room.poly)} />
      {!spot && <RoomLabel layout={layout} sub={room.sub} k={k} />}
    </g>
  )
})

// ───────────── 학생 안내 장소 배지 ─────────────

const BADGE_STAR = starPath(7.2)
const BADGE_FLAG = flagPath(6.4)
const BADGE_H = 28
const BADGE_SUB_H = 13

/** 방 이름 자리에 놓이는 화면 크기 고정 배지: "★3 중앙현관" (+ 시설명이 다르면 아래 작은 줄 "현관") */
function SpotBadge({ room, spot, selected, onSelect }: { room: Room; spot: Spot; selected: boolean; onSelect: (id: string) => void }) {
  const start = spot.no === null
  const head = start ? '출발' : String(spot.no)
  const sub = spot.label !== room.name ? room.name : null
  const headW = start ? estimateTextWidth(head, 12.5) + 6 : estimateTextWidth(head, 14)
  const labelW = estimateTextWidth(spot.label, 14)
  const subW = sub ? estimateTextWidth(sub, 10.5) : 0
  const lead = 9 + 15 + 4 + headW + 7 // 아이콘 + 번호/출발 + 간격
  const w = Math.max(lead + labelW + 11, subW + 22)
  const h = BADGE_H + (sub ? BADGE_SUB_H : 0)
  const x0 = -w / 2
  const y0 = -h / 2
  const cy = y0 + BADGE_H / 2
  const fg = start ? SPOT_START_INK : 'rgb(var(--navy))'
  return (
    <g
      className="spot-badge"
      data-hit=""
      aria-hidden="true"
      style={{ transform: `translate(${room.label[0]}px, ${room.label[1]}px) scale(calc(var(--ik, 1) * var(--ui-scale, 1)))`, cursor: 'pointer' }}
      onClick={() => onSelect(room.id)}
    >
      <rect x={x0 + 1.2} y={y0 + 2.6} width={w} height={h} rx={14} fill="#0b1220" fillOpacity={0.2} />
      <rect
        x={x0}
        y={y0}
        width={w}
        height={h}
        rx={14}
        style={{
          fill: start ? SPOT_START_FILL : SPOT_STAR_FILL,
          stroke: selected ? 'rgb(var(--navy))' : start ? SPOT_START_EDGE : 'rgb(var(--star-deep))',
          strokeWidth: selected ? 2.4 : 1.3,
        }}
      />
      {start ? (
        <path d={BADGE_FLAG} transform={`translate(${x0 + 9 + 7.5} ${cy})`} fill="none" stroke={SPOT_START_INK} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d={BADGE_STAR} transform={`translate(${x0 + 9 + 7.5} ${cy})`} style={{ fill: 'rgb(var(--navy))' }} />
      )}
      <text x={x0 + 9 + 15 + 4} y={cy + 0.6} dominantBaseline="central" style={{ fontSize: start ? 12.5 : 14, fontWeight: 800, fill: fg }}>
        {head}
      </text>
      <line x1={x0 + lead - 4} x2={x0 + lead - 4} y1={cy - 7} y2={cy + 7} style={{ stroke: fg, strokeOpacity: 0.35, strokeWidth: 1 }} />
      <text x={x0 + lead + 1} y={cy + 0.6} dominantBaseline="central" style={{ fontSize: 14, fontWeight: 750, fill: fg }}>
        {spot.label}
      </text>
      {sub && (
        <text x={0} y={y0 + BADGE_H + BADGE_SUB_H / 2 - 3} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10.5, fontWeight: 600, fill: fg, opacity: 0.78 }}>
          {sub}
        </text>
      )}
    </g>
  )
}

/** 선택된 방: 그림자 + 떠오른 복제본 + 외곽 강조 (최상단, 포인터 이벤트 없음) */
function SelectedRoom({ room, pal, k, hideLabel = false }: { room: Room; pal: Palette; k: number; hideLabel?: boolean }) {
  const pts = polygonPoints(room.poly)
  const layout = labelLayout(room)
  return (
    <g pointerEvents="none" className="room-selected">
      <g style={{ transform: 'translate(calc(3px * var(--ik, 1)), calc(5px * var(--ik, 1)))' }}>
        <polygon points={pts} className="room-sel-shadow" />
      </g>
      <g style={{ transform: 'translate(0, calc(-2.5px * var(--ik, 1)))' }}>
        <polygon points={pts} className="room-sel-halo" />
        <polygon points={pts} className="room-sel-face" style={{ fill: pal.sel }} />
        <polygon points={pts} className="room-sel-edge" />
        {!hideLabel && (
          <g className="room">
            <RoomLabel layout={layout} sub={room.sub} k={k} />
          </g>
        )}
      </g>
    </g>
  )
}

// ───────────── 코어 ─────────────

const CoreShape = memo(function CoreShape({ core, slab, k, color }: { core: Core; slab: Pt[]; k: number; color: string }) {
  const poly = core.poly
  const pos: Pt = core.at ?? (poly ? centroid(poly) : [0, 0])
  const b = poly ? boundsOf(poly) : null
  const short = b ? Math.min(b.w, b.h) : 0
  const gsize = Math.max(14, Math.min(26, short * 0.62 || 20))
  const iconVisible = gsize * k >= 8.5

  switch (core.type) {
    case 'stairs':
      return (
        <g pointerEvents="none">
          <polygon points={polygonPoints(poly!)} className="core-stairs" />
          {iconVisible && short >= 14 && <CoreGlyph type="stairs" x={pos[0]} y={pos[1]} size={gsize} color={color} />}
        </g>
      )
    case 'bridge':
      return (
        <g pointerEvents="none">
          <polygon points={polygonPoints(poly!)} className="core-bridge" />
          {k >= 0.42 && (
            <ScreenAt x={pos[0]} y={pos[1]}>
              <text textAnchor="middle" dominantBaseline="central" className="core-text">
                연결통로
              </text>
            </ScreenAt>
          )}
        </g>
      )
    case 'entrance': {
      const { out } = entranceDir(slab, pos)
      const ang = (Math.atan2(-out[1], -out[0]) * 180) / Math.PI // 건물 안쪽을 향함
      return (
        <ScreenAt x={pos[0] + out[0] * 2} y={pos[1] + out[1] * 2}>
          <g transform={`translate(${out[0] * 13} ${out[1] * 13}) rotate(${ang})`}>
            <path d="M-8 -7L2 0L-8 7L-4.5 0Z" style={{ fill: 'rgb(var(--gold))', stroke: 'rgb(var(--surface))', strokeWidth: 1.4, strokeLinejoin: 'round' }} />
          </g>
          {core.label && k >= 0.3 && (
            <g transform={`translate(${out[0] * 34} ${out[1] * 34})`}>
              <text textAnchor="middle" dominantBaseline="central" className="core-text core-text-gold">
                {core.label}
              </text>
            </g>
          )}
        </ScreenAt>
      )
    }
    case 'aed':
    case 'kit':
      return iconVisible || k >= 0.3 ? <CoreGlyph type={core.type} x={pos[0]} y={pos[1]} size={20} color={core.type === 'aed' ? '#b02a2a' : color} /> : null
    default: // elevator, toilet
      return (
        <g pointerEvents="none">
          {poly && <polygon points={polygonPoints(poly)} className="core-box" />}
          {iconVisible && <CoreGlyph type={core.type} x={pos[0]} y={pos[1]} size={gsize} color={color} />}
        </g>
      )
  }
})

// ───────────── 한 층 레이어 ─────────────

function FloorLayer({
  floor,
  building,
  selectedId,
  onSelect,
  showPlan,
  k,
  mode,
  dir,
}: {
  floor: Floor
  building: Building
  selectedId: string | null
  onSelect: (id: string) => void
  showPlan: boolean
  k: number
  mode: 'current' | 'leaving'
  dir: number
}) {
  const clipId = `slab-clip-${floor.building}-${floor.floor}-${mode}`
  const spots = useSpots()
  const floorSpots = spots.byFloor.get(spotFloorKey(floor.building, floor.floor))
  const spotOf = useMemo(() => new Map((floorSpots ?? []).map((s) => [s.roomId, s])), [floorSpots])
  const pals = useMemo(() => {
    const m = new Map<string, Palette>()
    for (const r of floor.rooms) m.set(r.id, paletteFor(building, r.cat, spotOf.get(r.id)))
    return m
  }, [floor, building, spotOf])
  const spotRooms = floor.rooms.filter((r) => spotOf.has(r.id))
  const eventActive = useAppStore((s) => s.event.active)
  const beaconRoom = eventActive && mode === 'current' && selectedId && spotOf.has(selectedId) ? floor.rooms.find((r) => r.id === selectedId) : undefined
  const slabFill = mix('#fffdf8', building.color, 0.09)
  const selectedRoom = selectedId ? floor.rooms.find((r) => r.id === selectedId) : undefined
  const coreColor = shade(building.color, 0.55)

  return (
    <g
      className={mode === 'leaving' ? 'floor-out' : 'floor-in'}
      data-plan={showPlan && !!floor.image}
      style={{ '--dir': dir } as CSSProperties}
      pointerEvents={mode === 'leaving' ? 'none' : undefined}
      aria-hidden={mode === 'leaving' ? true : undefined}
    >
      {/* 슬랩 그림자 + 바닥 */}
      <polygon points={polygonPoints(floor.slab.map(([x, y]) => [x + 7, y + 9] as Pt))} className="slab-shadow" fillOpacity={0.07} />
      <polygon points={polygonPoints(floor.slab.map(([x, y]) => [x + 3.5, y + 4.5] as Pt))} className="slab-shadow" fillOpacity={0.07} />
      <polygon points={polygonPoints(floor.slab)} className="slab" style={{ fill: slabFill }} />

      {/* 원본 CAD 도면 레이어 */}
      {showPlan && floor.image && (
        <g clipPath={`url(#${clipId})`} className="plan-layer" pointerEvents="none">
          <clipPath id={clipId}>
            <polygon points={polygonPoints(floor.slab)} />
          </clipPath>
          <image href={assetUrl(floor.image)} x={0} y={0} width={floor.size[0]} height={floor.size[1]} preserveAspectRatio="none" opacity={0.62} />
        </g>
      )}

      {/* 방 */}
      {floor.rooms.map((r) => (
        <RoomShape
          key={r.id}
          room={r}
          pal={pals.get(r.id)!}
          ariaLabel={`${building.name} ${floorLabel(floor.floor)} ${r.name}`}
          selected={r.id === selectedId}
          onSelect={onSelect}
          k={k}
          spot={spotOf.get(r.id)}
        />
      ))}

      {/* 학생 안내 장소: 금빛 외곽 (방 위, 포인터 없음) */}
      {spotRooms.map((r) => {
        const kind = spotOf.get(r.id)!.no === null ? 'start' : 'star'
        const pts = polygonPoints(r.poly)
        return (
          <g key={`spot-${r.id}`} pointerEvents="none">
            <polygon points={pts} className="spot-glow" data-kind={kind} />
            <polygon points={pts} className="spot-edge" data-kind={kind} />
          </g>
        )
      })}

      {/* 슬랩 외곽선(방 위) */}
      <polygon points={polygonPoints(floor.slab)} className="slab-edge" pointerEvents="none" />

      {/* 코어 */}
      {floor.cores.map((c, i) => (
        <CoreShape key={i} core={c} slab={floor.slab} k={k} color={coreColor} />
      ))}

      {selectedRoom && <SelectedRoom room={selectedRoom} pal={pals.get(selectedRoom.id)!} k={k} hideLabel={spotOf.has(selectedRoom.id)} />}

      {/* 안내 모드에서 들어온 선택 장소: 비콘 파문 (배지 아래) */}
      {beaconRoom && (
        <ScreenAt x={beaconRoom.label[0]} y={beaconRoom.label[1]}>
          <circle className="floor-beacon" data-b="1" r={15} />
          <circle className="floor-beacon" data-b="2" r={15} />
        </ScreenAt>
      )}

      {/* 안내 장소 배지는 맨 위 (선택된 방의 떠오른 복제본보다도 위) */}
      {spotRooms.map((r) => (
        <SpotBadge key={`badge-${r.id}`} room={r} spot={spotOf.get(r.id)!} selected={r.id === selectedId} onSelect={onSelect} />
      ))}
    </g>
  )
}

/** 뷰포트 크기가 측정될 때까지(최대 ~0.5초) 기다렸다가 실행. 반환값 = 취소 함수 */
function whenSized(api: PanZoomApi, fn: () => void): () => void {
  let raf = 0
  let n = 0
  const tick = () => {
    if (api.getSize().w > 0) fn()
    else if (n++ < 30) raf = requestAnimationFrame(tick)
  }
  tick()
  return () => cancelAnimationFrame(raf)
}

/** 방 둘레 맥락: 선택한 방을 가로·세로 2.2배로 넓힌 영역이 보이는 영역에 들어가도록 확대를 제한한다 */
const CONTEXT_SPAN = 2.2

/** 방 선택 시 카메라: 작으면 확대(보이는 영역의 약 30% 폭·42% 높이), 화면 밖이면 이동 */
function focusRoom(api: PanZoomApi, room: Room): void {
  const rb = boundsOf(room.poly)
  const avail = api.availableRect()
  const cur = api.getTransform()
  // 너무 바짝 확대하지 않도록: min(기존 30%·42% 공식, 방의 2.2배 영역이 들어가는 배율)
  const contextK = Math.min(avail.w / (rb.w * CONTEXT_SPAN), avail.h / (rb.h * CONTEXT_SPAN))
  const targetK = Math.min((avail.w * 0.3) / rb.w, (avail.h * 0.42) / rb.h, contextK, 6)
  const ew = avail.w / targetK
  const eh = avail.h / targetK
  const eb: Bounds = { x: rb.x + rb.w / 2 - ew / 2, y: rb.y + rb.h / 2 - eh / 2, w: ew, h: eh }
  const small = Math.max((rb.w * cur.k) / avail.w, (rb.h * cur.k) / avail.h) < 0.3
  if (small && targetK > cur.k * 1.15) {
    api.animateTo(eb, { maxScale: 6 })
    return
  }
  const [sx, sy] = api.worldToScreen(rb.x + rb.w / 2, rb.y + rb.h / 2)
  const inside = sx > avail.x + 24 && sx < avail.x + avail.w - 24 && sy > avail.y + 24 && sy < avail.y + avail.h - 24
  if (!inside) api.focus([rb.x + rb.w / 2, rb.y + rb.h / 2], { k: cur.k })
}

// ───────────── 본체 ─────────────

export function FloorPlan({ active = true, insets, className }: FloorPlanProps) {
  const buildingId = useAppStore((s) => s.buildingId)
  const floorId = useAppStore((s) => s.floorId)
  const roomId = useAppStore((s) => s.roomId)
  const floorDir = useAppStore((s) => s.floorDir)
  const showPlan = useAppStore((s) => s.ui.showPlanLayer)
  const selectRoom = useAppStore((s) => s.selectRoom)
  const clearRoom = useAppStore((s) => s.clearRoom)
  const [api, setApi] = useState<PanZoomApi | null>(null)

  const nextFloor = getFloor(buildingId, floorId)
  const [shown, setShown] = useState<{ cur: Floor | null; prev: Floor | null; dir: number }>({ cur: nextFloor ?? null, prev: null, dir: 0 })
  // 층이 바뀌면 이전 층을 잠시 유지(렌더 중 파생 상태)
  if (nextFloor && nextFloor !== shown.cur) {
    setShown({ cur: nextFloor, prev: shown.cur && shown.cur.building === nextFloor.building ? shown.cur : null, dir: floorDir })
  }
  useEffect(() => {
    if (!shown.prev) return
    const t = window.setTimeout(() => setShown((s) => (s.prev ? { ...s, prev: null } : s)), 380)
    return () => window.clearTimeout(t)
  }, [shown.prev])

  const floor = shown.cur
  const building = floor ? getBuilding(floor.building) : undefined
  const k = useMapScaleSafe(api)

  const onApi = useCallback((a: PanZoomApi | null) => {
    setApi(a)
    registerMap('floor', a)
  }, [])

  // 건물/층 크기가 바뀌면 슬랩에 맞춰 이동 (같은 건물·같은 크기의 층 전환에서는 뷰 유지)
  const lastFit = useRef('')
  useEffect(() => {
    if (!api || !floor) return
    const b = slabBounds(floor)
    const sig = `${floor.building}|${floor.size.join('x')}|${b.x},${b.y},${b.w},${b.h}`
    if (lastFit.current === sig) return
    lastFit.current = sig
    // 폰(< 640px)에서는 가장자리 여백을 줄여 넓은 평면도가 화면 폭을 최대한 쓰게 한다
    api.animateTo(b, { padding: isNarrowViewport() ? 10 : 28, maxScale: 3 })
  }, [api, floor])

  // 방 선택 시: 작으면 확대, 화면 밖이면 이동 (뷰포트 크기가 측정된 뒤에 실행 — 딥링크 진입 대응)
  useEffect(() => {
    if (!api || !floor || !roomId) return
    const room = floor.rooms.find((r) => r.id === roomId)
    if (!room) return
    return whenSized(api, () => focusRoom(api, room))
  }, [api, floor, roomId])

  // 시트·패널 높이(insets)가 바뀌어 선택한 방이 보이는 영역의 중앙에서 벗어나면 다시 중앙으로 (투어 중 시트를 올리거나 내릴 때 등)
  const insetsKey = `${insets.top}|${insets.right}|${insets.bottom}|${insets.left}`
  const lastView = useRef({ insetsKey, floor, roomId })
  useEffect(() => {
    const last = lastView.current
    lastView.current = { insetsKey, floor, roomId }
    // insets 만 바뀐 경우에 한한다 (시설·층 변경은 위의 focusRoom 이 처리)
    if (last.insetsKey === insetsKey || last.floor !== floor || last.roomId !== roomId) return
    if (!api || !floor || !roomId) return
    const room = floor.rooms.find((r) => r.id === roomId)
    if (!room) return
    return whenSized(api, () => {
      const rb = boundsOf(room.poly)
      const c: Pt = [rb.x + rb.w / 2, rb.y + rb.h / 2]
      const avail = api.availableRect()
      const [sx, sy] = api.worldToScreen(c[0], c[1])
      const off = Math.abs(sx - (avail.x + avail.w / 2)) > avail.w * 0.2 || Math.abs(sy - (avail.y + avail.h / 2)) > avail.h * 0.2
      if (off) api.focus(c, { k: api.getTransform().k })
    })
  }, [api, floor, roomId, insetsKey])

  // 이미 고른 방을 한 번 더 누르면 그 방을 중심으로 한 단계 더 확대 (카메라가 이동 중이면 무시 — 더블탭이 이동을 끊지 않게)
  const onSelect = useCallback(
    (id: string) => {
      if (api && floor && id === useAppStore.getState().roomId) {
        const room = floor.rooms.find((r) => r.id === id)
        if (room) {
          const rb = boundsOf(room.poly)
          retapZoom(api, [rb.x + rb.w / 2, rb.y + rb.h / 2])
          return
        }
      }
      selectRoom(id)
    },
    [api, floor, selectRoom],
  )
  const onBackgroundTap = useCallback(() => clearRoom(), [clearRoom])

  if (!floor || !building) return null
  const fb = slabBounds(floor)
  const content = expandBounds(fb, 140)
  const inert = active ? {} : ({ inert: '' } as Record<string, string>)

  return (
    <div className={`absolute inset-0 ${className ?? ''}`} aria-hidden={active ? undefined : true} {...inert}>
      <MapViewport
        content={content}
        initialBounds={fb}
        insets={insets}
        maxScale={9}
        label={`${building.name} ${floorLabel(floor.floor)} 평면도. 끌어서 이동, 두 손가락 또는 휠로 확대·축소, 시설을 선택하면 상세 안내가 열립니다`}
        onBackgroundTap={onBackgroundTap}
        onApi={onApi}
        defs={<FloorDefs />}
      >
        <rect x={-400} y={-400} width={floor.size[0] + 800} height={floor.size[1] + 800} fill="url(#floor-grid)" pointerEvents="none" />
        {shown.prev && (
          <FloorLayer key={`${shown.prev.building}/${shown.prev.floor}-out`} floor={shown.prev} building={building} selectedId={null} onSelect={onSelect} showPlan={showPlan} k={k} mode="leaving" dir={shown.dir} />
        )}
        <FloorLayer
          key={`${floor.building}/${floor.floor}`}
          floor={floor}
          building={building}
          selectedId={roomId}
          onSelect={onSelect}
          showPlan={showPlan}
          k={k}
          mode="current"
          dir={shown.dir}
        />
      </MapViewport>
    </div>
  )
}

/** MapViewport 컨텍스트 밖(FloorPlan 본체)에서 배율을 양자화해 구독 */
function useMapScaleSafe(api: PanZoomApi | null): number {
  const [k, setK] = useState(1)
  useEffect(() => {
    if (!api) return
    const q = (v: number) => Math.pow(2, Math.round(Math.log2(v) * 4) / 4)
    const update = () => setK((prev) => {
      const nk = q(api.getSettledScale())
      return nk === prev ? prev : nk
    })
    update()
    return api.subscribe(update)
  }, [api])
  return k
}

function FloorDefs() {
  return (
    <>
      <pattern id="floor-grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <circle cx="20" cy="20" r="1" style={{ fill: 'rgb(var(--ink) / 0.09)' }} />
      </pattern>
      <pattern id="stair-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="9" style={{ stroke: 'rgb(var(--navy) / 0.34)' }} strokeWidth="1.5" />
      </pattern>
    </>
  )
}
