// 캠퍼스 배치도 (2.5D 건축 모형 느낌의 순수 SVG).
// 좌표계 = campus.json 의 배치도 px (site.viewBox, y 아래). 월드 그룹에 pan/zoom matrix 가 적용된다.
//
// ┌ GPS 슬롯 계약 (features/gps/GpsLayer.tsx) ───────────────────────────────────────────────┐
// │ CampusMap 은 월드 <g> 안, 건물·라벨 위에 `<GpsLayer />` 를 props 없이 렌더한다.            │
// │  · GpsLayer 는 SVG 요소만 반환하며 좌표계는 site px (월드 좌표) — useGeoTransform()(lib/    │
// │    calibration)의 latLonToPx 로 변환한 값을 그대로 쓴다.                                    │
// │  · 화면 크기 고정 마커: <g style={{ transform: `translate(${x}px,${y}px) scale(var(--ik))` }}> │
// │    (--ik = 1/배율, 월드 <g> 에 프레임마다 갱신됨). 정확도 원 반경은 월드 단위(m / metersPerPx). │
// │  · pointer-events 는 기본 none 으로 둘 것(건물 탭을 가로채지 않도록).                       │
// │  · 상태는 zustand `useAppStore(s => s.gps)` 에서 읽는다. 지도 카메라 이동은 map/mapBus 의     │
// │    focusSitePoint(px) 사용.                                                                  │
// │ 추가 월드 요소(보정 화면의 보정점 표시 등)는 `extraLayers` prop 으로 넘긴다 (같은 좌표계).     │
// │ GpsLayer 의 "추정 위치 ±N m" 글자는 건물 이름표(buildingLabels.ts)와 겹치면 생략된다.          │
// └───────────────────────────────────────────────────────────────────────────────────────────┘
import { memo, useCallback, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { buildings, campus, site } from '../data'
import type { Building, Bounds, Insets, MinorBuilding, Pt } from '../data/types'
import { GpsLayer } from '../features/gps/GpsLayer'
import { shade, tint } from '../lib/color'
import {
  boundsFromViewBox,
  boundsOf,
  convexHull,
  expandBounds,
  insetPolygon,
  polygonPoints,
  signedArea,
  translatePoly,
  unionBounds,
} from '../lib/geometry'
import { useAppStore } from '../store/useAppStore'
import { buildingHeight, type PlacedLabel } from './buildingLabels'
import { useMapScale } from './MapContext'
import { registerMap } from './mapBus'
import { MapViewport } from './MapViewport'
import { useLabelPlacement } from './useLabelPlacement'
import type { PanZoomApi } from './usePanZoom'

export interface CampusMapProps {
  /** false 면 숨김 상태(상호작용·포커스 차단). 크로스페이드는 상위(MapStage)가 담당 */
  active?: boolean
  insets: Insets
  /** 'pick' = 건물 선택 비활성, 아무 곳이나 탭하면 onSiteTap(site px) — 위치 보정 화면용 */
  mode?: 'explore' | 'pick'
  onSiteTap?: (pt: Pt) => void
  /** 월드(site px) 좌표계로 그려지는 추가 레이어 (GpsLayer 위) */
  extraLayers?: ReactNode
  showGps?: boolean
  className?: string
}

// ───────────── 정적 지오메트리 (모듈 로드 시 1회) ─────────────

interface BuildingGeo {
  b: Building
  h: number
  roof: Pt[]
  parapet: Pt[]
  hull: Pt[]
  sides: { points: string; fill: string }[]
  shadows: { points: string; opacity: number }[]
  bounds: Bounds
}

function buildGeo(b: Building): BuildingGeo {
  const h = buildingHeight(b)
  const base = b.poly
  const roof = translatePoly(base, 0, -h)
  const area = signedArea(base)
  const sign = area > 0 ? 1 : -1
  const sides: BuildingGeo['sides'] = []
  for (let i = 0; i < base.length; i++) {
    const p = base[i]
    const q = base[(i + 1) % base.length]
    const dx = q[0] - p[0]
    const dy = q[1] - p[1]
    const len = Math.hypot(dx, dy) || 1
    const nx = (sign * dy) / len
    const ny = (-sign * dx) / len
    if (ny < 0.06) continue // 북향 면은 지붕에 가려짐
    const amount = 0.3 + 0.1 * Math.max(0, nx)
    sides.push({
      points: polygonPoints([p, q, [q[0], q[1] - h], [p[0], p[1] - h]]),
      fill: shade(b.color, amount),
    })
  }
  const shadows = [0.45, 0.75, 1].map((f, i) => ({
    points: polygonPoints(translatePoly(base, h * 0.62 * f, h * 0.34 * f)),
    opacity: [0.05, 0.06, 0.07][i],
  }))
  return {
    b,
    h,
    roof,
    parapet: insetPolygon(roof, 5),
    hull: convexHull([...base, ...roof]),
    sides,
    shadows,
    bounds: unionBounds([boundsOf(base), boundsOf(roof)]),
  }
}

const GEO: BuildingGeo[] = buildings.map(buildGeo).sort((a, b) => a.b.center[1] - b.b.center[1])
const GEO_BY_ID = new Map(GEO.map((g) => [g.b.id, g]))

interface MinorGeo {
  m: MinorBuilding
  h: number
  roof: Pt[]
  sides: string
}
const MINOR: MinorGeo[] = campus.minor.map((m) => {
  const h = 6
  const roof = translatePoly(m.poly, 0, -h)
  const sides = convexHull([...m.poly, ...roof])
  return { m, h, roof, sides: polygonPoints(sides) }
})

const SITE_BOUNDS = boundsFromViewBox(site.viewBox)
const SITE_PAD = expandBounds(SITE_BOUNDS, 500)

/**
 * 세로 화면(폰)의 '전체 맞춤' 영역: 주요 7개 건물(지붕 포함)의 외접 사각형 + 6% 여백.
 * 대지 전체(도로·운동장 여백 포함)에 맞추면 폭이 좁은 화면에서 캠퍼스가 너무 작게 보인다.
 */
const PORTRAIT_FIT: Bounds = (() => {
  const u = unionBounds(GEO.map((g) => g.bounds))
  return expandBounds(u, u.w * 0.06, u.h * 0.06)
})()

/** 건물로 줌할 때 맞출 영역(지붕 포함) */
function focusBounds(id: string): Bounds | null {
  const g = GEO_BY_ID.get(id as Building['id'])
  return g ? expandBounds(g.bounds, 10) : null
}

// ───────────── 화면 크기 고정 요소 ─────────────

function ScreenAt({ x, y, children, className }: { x: number; y: number; children: ReactNode; className?: string }) {
  return (
    <g
      className={className}
      style={{ transform: `translate(${x}px, ${y}px) scale(calc(var(--ik, 1) * var(--ui-scale, 1)))` }}
      pointerEvents="none"
    >
      {children}
    </g>
  )
}

/** 이름표: 알약(코드 배지 + 한글 이름 [+ 영문 부제]). 위치·크기·표시 여부는 buildingLabels.placeLabels 가 정한다 */
function BuildingLabel({ b, item, selected }: { b: Building; item: PlacedLabel; selected: boolean }) {
  const { w, h: hgt, compact } = item.metrics
  return (
    <ScreenAt x={item.at[0]} y={item.at[1]}>
      <g className="bld-label" style={{ opacity: item.visible ? 1 : 0 }} aria-hidden={item.visible ? undefined : true}>
        <g transform={`translate(${item.dx} ${item.dy})`}>
          <rect
            x={-w / 2}
            y={-hgt / 2}
            width={w}
            height={hgt}
            rx={hgt / 2}
            style={{ fill: 'rgb(var(--surface) / 0.94)', stroke: selected ? 'rgb(var(--gold))' : 'rgb(var(--line-strong) / 0.9)', strokeWidth: selected ? 1.6 : 1 }}
          />
          <circle cx={-w / 2 + hgt / 2} cy={0} r={hgt / 2 - (compact ? 3.5 : 4.5)} fill={b.color} />
          <text
            x={-w / 2 + hgt / 2}
            y={0.5}
            textAnchor="middle"
            dominantBaseline="central"
            className="font-display"
            style={{ fontSize: compact ? 10.5 : 13, fontWeight: 600, fill: '#fff', paintOrder: 'stroke', stroke: shade(b.color, 0.35), strokeWidth: 0.6 }}
          >
            {b.code}
          </text>
          <text
            x={-w / 2 + hgt + (compact ? 1 : 2)}
            y={compact ? 0.5 : -5.4}
            dominantBaseline="central"
            style={{ fontSize: compact ? 11.5 : 13, fontWeight: 650, fill: 'rgb(var(--ink))' }}
          >
            {b.name}
          </text>
          {!compact && (
            <text
              x={-w / 2 + hgt + 2}
              y={9.6}
              dominantBaseline="central"
              className="font-display"
              style={{ fontSize: 11, fontStyle: 'italic', letterSpacing: '0.07em', fill: 'rgb(var(--ink-mute))' }}
            >
              {b.en}
            </text>
          )}
        </g>
      </g>
    </ScreenAt>
  )
}

/** 건물 이름표 묶음 — 배율 5% 단위로 충돌 회피 배치를 다시 계산한다 (buildingLabels.ts) */
function BuildingLabels({ buildingId }: { buildingId: string | null }) {
  const placement = useLabelPlacement()
  return (
    <>
      {GEO.map((g) => (
        <BuildingLabel key={g.b.id} b={g.b} item={placement.items[g.b.id]} selected={buildingId === g.b.id} />
      ))}
    </>
  )
}

function GateMarker({ name, at, showText }: { name: string; at: Pt; showText: boolean }) {
  return (
    <ScreenAt x={at[0]} y={at[1]}>
      <circle r={9.5} style={{ fill: 'rgb(var(--navy))', stroke: 'rgb(var(--surface))', strokeWidth: 2 }} />
      <path d="M-3.4 0.2h6.2M0.8 -3l3 3.2-3 3.2" fill="none" stroke="#fff" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" transform="rotate(-90)" />
      {showText && (
        <g transform="translate(0 -22)">
          <text textAnchor="middle" style={{ fontSize: 11.5, fontWeight: 650, fill: 'rgb(var(--navy))', paintOrder: 'stroke', stroke: 'rgb(var(--surface))', strokeWidth: 4, strokeLinejoin: 'round' }}>
            {name}
          </text>
        </g>
      )}
    </ScreenAt>
  )
}

// ───────────── 건물 ─────────────

const BuildingShape = memo(function BuildingShape({
  g,
  selected,
  dim,
  interactive,
  onSelect,
}: {
  g: BuildingGeo
  selected: boolean
  dim: boolean
  interactive: boolean
  onSelect: (id: Building['id']) => void
}) {
  const { b } = g
  const gradId = `roof-${b.id}`
  const onKey = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(b.id)
    }
  }
  return (
    <g
      className="bld"
      data-hit={interactive ? '' : undefined}
      data-selected={selected}
      data-dim={dim}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : -1}
      aria-label={interactive ? `${b.name} (${b.en}), ${b.floors.length}개 층. 선택하면 건물 안내와 층 목록을 봅니다` : undefined}
      aria-pressed={interactive ? selected : undefined}
      onClick={interactive ? () => onSelect(b.id) : undefined}
      onKeyDown={interactive ? onKey : undefined}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={tint(b.color, 0.82)} />
          <stop offset="1" stopColor={b.color} />
        </linearGradient>
      </defs>
      <g className="bld-shadow" style={{ fill: '#0b1220' }}>
        {g.shadows.map((s, i) => (
          <polygon key={i} points={s.points} fillOpacity={s.opacity} />
        ))}
      </g>
      <g className="bld-body">
        {g.sides.map((s, i) => (
          <polygon key={i} points={s.points} fill={s.fill} stroke={s.fill} strokeWidth={0.8} strokeLinejoin="round" />
        ))}
        <polygon className="bld-roof" points={polygonPoints(g.roof)} fill={`url(#${gradId})`} style={{ stroke: shade(b.color, 0.28) }} />
        <polygon points={polygonPoints(g.parapet)} fill="none" className="bld-parapet" />
      </g>
      {/* 안정적인 히트 영역(떠오름 애니메이션과 무관) */}
      <polygon points={polygonPoints(g.hull)} fill="transparent" />
    </g>
  )
})

function MinorShape({ g, showLabel }: { g: MinorGeo; showLabel: boolean }) {
  return (
    <g pointerEvents="none">
      <polygon points={polygonPoints(g.m.poly.map(([x, y]) => [x + 2.5, y + 2] as Pt))} fill="#0b1220" fillOpacity={0.06} />
      <polygon points={g.sides} fill="#b9b3a3" stroke="#b9b3a3" strokeWidth={0.6} />
      <polygon points={polygonPoints(g.roof)} fill="#d9d4c6" style={{ stroke: '#a9a393', strokeWidth: 1, vectorEffect: 'non-scaling-stroke' }} />
      {showLabel && (
        <ScreenAt x={g.m.center[0]} y={g.roof[0][1] - 10}>
          <text textAnchor="middle" style={{ fontSize: 10.5, fontWeight: 500, fill: 'rgb(var(--ink-mute))', paintOrder: 'stroke', stroke: 'rgb(var(--surface))', strokeWidth: 3.5, strokeLinejoin: 'round' }}>
            {g.m.name}
          </text>
        </ScreenAt>
      )}
    </g>
  )
}

// ───────────── 배경(대지·도로·운동장) ─────────────

function SiteBase() {
  return (
    <>
      <rect x={SITE_PAD.x} y={SITE_PAD.y} width={SITE_PAD.w} height={SITE_PAD.h} fill="url(#site-grid)" />
      <polygon points={polygonPoints(site.road)} className="site-road" />
      <polygon points={polygonPoints(site.boundary)} className="site-boundary" />
      <polygon points={polygonPoints(site.field)} className="site-field" />
      <polygon points={polygonPoints(site.field)} fill="url(#field-pattern)" pointerEvents="none" />
    </>
  )
}

const DEFS = (
  <>
    <pattern id="site-grid" width="60" height="60" patternUnits="userSpaceOnUse">
      <circle cx="30" cy="30" r="1.1" style={{ fill: 'rgb(var(--ink) / 0.10)' }} />
    </pattern>
    <pattern id="field-pattern" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
      <line x1="0" y1="0" x2="0" y2="14" stroke="#7f9a6c" strokeOpacity="0.28" strokeWidth="1.6" />
    </pattern>
  </>
)

// ───────────── 본체 ─────────────

export function CampusMap({ active = true, insets, mode = 'explore', onSiteTap, extraLayers, showGps = true, className }: CampusMapProps) {
  const buildingId = useAppStore((s) => s.buildingId)
  const view = useAppStore((s) => s.view)
  const selectBuilding = useAppStore((s) => s.selectBuilding)
  const [api, setApi] = useState<PanZoomApi | null>(null)

  const onApi = useCallback((a: PanZoomApi | null) => {
    setApi(a)
    registerMap('campus', a)
  }, [])

  // 선택 건물로 줌 / 선택 해제 시 전체 맞춤. (층 평면도 화면에서는 현재 카메라 유지 → 크로스페이드)
  useEffect(() => {
    if (!api || view !== 'campus' || mode !== 'explore') return
    const fb = buildingId ? focusBounds(buildingId) : null
    if (fb) api.animateTo(fb, { padding: { top: 44, bottom: 36, left: 28, right: 28 }, maxScale: 3.2 })
    else api.fit()
  }, [api, buildingId, view, mode])

  const select = useCallback((id: Building['id']) => selectBuilding(id), [selectBuilding])

  const onBackgroundTap = useCallback(
    (world: Pt) => {
      if (mode === 'pick') onSiteTap?.(world)
      else if (useAppStore.getState().buildingId) useAppStore.getState().goCampus()
    },
    [mode, onSiteTap],
  )

  const interactive = mode === 'explore' && active
  const content = useMemo(() => expandBounds(SITE_BOUNDS, 40), [])
  const inert = active ? {} : ({ inert: '' } as Record<string, string>)

  return (
    <div className={`absolute inset-0 ${className ?? ''}`} aria-hidden={active ? undefined : true} {...inert}>
      <MapViewport
        content={content}
        initialBounds={SITE_BOUNDS}
        portraitFit={mode === 'explore' ? PORTRAIT_FIT : undefined}
        insets={insets}
        maxScale={9}
        label="캠퍼스 배치도. 끌어서 이동, 두 손가락 또는 휠로 확대·축소, 건물을 선택해 안내를 볼 수 있습니다"
        onBackgroundTap={onBackgroundTap}
        onApi={onApi}
        defs={DEFS}
      >
        <CampusContent
          buildingId={buildingId}
          interactive={interactive}
          onSelect={select}
          showGps={showGps}
          extraLayers={extraLayers}
        />
      </MapViewport>
    </div>
  )
}

/** 줌 단계에 따라 라벨 밀도를 바꾸므로 MapViewport 컨텍스트 안쪽의 별도 컴포넌트 */
function CampusContent({
  buildingId,
  interactive,
  onSelect,
  showGps,
  extraLayers,
}: {
  buildingId: string | null
  interactive: boolean
  onSelect: (id: Building['id']) => void
  showGps: boolean
  extraLayers?: ReactNode
}) {
  const k = useMapScale(3)
  return (
    <>
      <SiteBase />

      {/* 라벨(운동장·도로) */}
      {site.labels.map((l) => (
        <ScreenAt key={l.text} x={l.at[0]} y={l.at[1]}>
          <g transform={`rotate(${l.rot ?? 0})`}>
            <text
              textAnchor="middle"
              dominantBaseline="central"
              style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.42em', fill: 'rgb(var(--ink-mute))', opacity: 0.85 }}
            >
              {l.text}
            </text>
          </g>
        </ScreenAt>
      ))}

      {MINOR.map((g) => (
        <MinorShape key={g.m.id} g={g} showLabel={k >= 0.62} />
      ))}

      {GEO.map((g) => (
        <BuildingShape
          key={g.b.id}
          g={g}
          selected={buildingId === g.b.id}
          dim={!!buildingId && buildingId !== g.b.id}
          interactive={interactive}
          onSelect={onSelect}
        />
      ))}

      {/* 건물 라벨은 모든 건물 위에 */}
      <BuildingLabels buildingId={buildingId} />

      {site.gates.map((gt) => (
        <GateMarker key={gt.name} name={gt.name} at={gt.at} showText={k >= 0.24} />
      ))}
      {k >= 0.9 &&
        site.entrances.map((en) => (
          <ScreenAt key={en.name} x={en.at[0]} y={en.at[1]}>
            <circle r={4.2} style={{ fill: 'rgb(var(--gold))', stroke: 'rgb(var(--surface))', strokeWidth: 1.6 }} />
            <text y={-11} textAnchor="middle" style={{ fontSize: 10.5, fontWeight: 600, fill: 'rgb(var(--gold-deep))', paintOrder: 'stroke', stroke: 'rgb(var(--surface))', strokeWidth: 3.5, strokeLinejoin: 'round' }}>
              {en.name}
            </text>
          </ScreenAt>
        ))}

      {/* GPS 슬롯 (계약: 파일 상단 주석) */}
      {showGps && <GpsLayer />}
      {extraLayers}
    </>
  )
}
