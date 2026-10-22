// 입학설명회 안내(#/event) 캠퍼스 지도 레이어 (CampusMap 의 월드 <g> 안, 건물·이름표 위).
//  · 건물마다 말풍선 카드(머리글 = 건물 이름, 줄 = "★n 장소명 nF") + 지붕 위 번호 핀 + 가는 줄기. 크기는 화면 고정(--ik).
//  · 배치·접기는 eventLayout.placeEventCards (충돌 회피 · 작은 배지로 접기). 선택한 장소의 건물 카드는 줄 강조, 나머지는 살짝 흐려진다.
//  · 출입구(site.entrances) 화살표, 처음 들어올 때 카드가 차례로 나타나는 연출(≤ 900ms, 모션 최소화 설정이면 없음).
//  · 접근성: 이 레이어는 aria-hidden — 접근 가능한 경로는 패널의 목록(EventPanel)이다. 마우스·터치로 카드를 눌러 선택할 수는 있다.
import { memo, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { EventGpsLine } from '../features/event/EventGpsLine'
import { spotByNo } from '../features/event/eventModel'
import { useEventUi } from '../features/event/eventUi'
import { useSpots } from '../features/tour/spots'
import { tint } from '../lib/color'
import { prefersReducedMotion } from '../lib/env'
import { useAppStore } from '../store/useAppStore'
import { estimateTextWidth } from './buildingLabels'
import { CARD_HEADER_H, CARD_ROW_H, entranceMarkers, entranceTextOffset, entranceTextSide, PIN_R, type CardPlacement, type CardRow, type EntranceMarker, type EvBuilding, type EvPin } from './eventLayout'
import { flagPath, SPOT_START_FILL, SPOT_STAR_FILL, starPath } from './icons'
import { useMapScale } from './MapContext'
import { useEventModel, useEventPlacement, useEventSelectedBuilding } from './useEventPlacement'

const STAR_ROW = starPath(5.4)
const STAR_COMPACT = starPath(6)
const FLAG_ROW = flagPath(5.2)
const SCALE = 'calc(var(--ik, 1) * var(--ui-scale, 1))'
const at = (x: number, y: number): CSSProperties => ({ transform: `translate(${x}px, ${y}px) scale(${SCALE})` })

/** 첫 입장 연출은 세션 중 한 번만 (효과로 표시 — StrictMode 이중 호출에도 안전) */
let revealDone = false

export function EventLayer({ interactive }: { interactive: boolean }) {
  const model = useEventModel()
  const placement = useEventPlacement()
  const k = useMapScale(3)
  const spots = useSpots()
  const spotNo = useAppStore((s) => s.event.spotNo)
  const selectedB = useEventSelectedBuilding()
  const hoverRoom = useEventUi((s) => s.hoverRoom)
  const [reveal, setReveal] = useState(() => !revealDone && !prefersReducedMotion())
  useEffect(() => {
    revealDone = true
    if (!reveal) return
    // 연출이 끝나면 표식을 떼어, 줌으로 카드가 다시 생겨도(배지 ↔ 핀) 또 나타나는 연출이 반복되지 않게 한다
    const t = window.setTimeout(() => setReveal(false), 1100)
    return () => window.clearTimeout(t)
  }, [reveal])
  const entrances = useMemo(() => entranceMarkers(model), [model])
  const selSpot = spotByNo(spots, spotNo)
  const hoverB = hoverRoom ? spots.byRoom.get(hoverRoom)?.buildingId : undefined

  if (model.buildings.length === 0) return null
  // 선택한 건물 카드가 맨 위
  const order = [...model.buildings].sort((a, b) => Number(a.id === selectedB) - Number(b.id === selectedB))
  const idx = new Map(model.buildings.map((b, i) => [b.id, i]))

  return (
    <g className="ev-layer" aria-hidden="true" data-reveal={reveal ? '' : undefined}>
      {entrances.map((en) => (
        <EntranceArrow key={en.name} en={en} textSide={k >= 0.9 || en.buildingId === selectedB ? entranceTextSide(en, placement) : 0} selected={en.buildingId === selectedB} />
      ))}

      <EventGpsLine />

      {/* 같은 건물 안 다른 핀과 대표 핀을 잇는 가는 점선(지붕 위) */}
      {model.buildings.map((b) =>
        b.pins.slice(1).map((p, i) => (
          <line key={`${b.id}-tie-${i}`} className="ev-tie" x1={b.pins[0].at[0]} y1={b.pins[0].at[1]} x2={p.at[0]} y2={p.at[1]} />
        )),
      )}

      {order.map((b) => {
        const pl = placement.byId.get(b.id)
        if (!pl) return null
        const isSel = b.id === selectedB
        return (
          <EventCard
            key={b.id}
            b={b}
            pl={pl}
            selected={isSel}
            faded={!!selectedB && !isSel}
            hovered={hoverB === b.id}
            selectedRoom={isSel ? selSpot?.roomId : undefined}
            hoverRoom={hoverRoom}
            index={idx.get(b.id) ?? 0}
            interactive={interactive}
          />
        )
      })}
    </g>
  )
}

function pick(no: number | null) {
  useAppStore.getState().openEvent(no ?? 0)
}

// ───────────── 카드 ─────────────

const EventCard = memo(function EventCard({
  b,
  pl,
  selected,
  faded,
  hovered,
  selectedRoom,
  hoverRoom,
  index,
  interactive,
}: {
  b: EvBuilding
  pl: CardPlacement
  selected: boolean
  faded: boolean
  hovered: boolean
  selectedRoom?: string
  hoverRoom: string | null
  index: number
  interactive: boolean
}) {
  const setHover = useEventUi.getState().setHover
  const [ax, ay] = b.pins[0].at
  return (
    <g
      className="ev-card"
      data-sel={selected}
      data-faded={faded}
      data-hover={hovered}
      data-mode={pl.mode}
      style={{ '--i': index } as CSSProperties}
      pointerEvents={interactive ? undefined : 'none'}
    >
      {/* 대표 핀 끝을 기준으로 한 화면 고정 좌표계: 줄기 → 카드 */}
      {pl.mode !== 'pin' && (
        <g style={at(ax, ay)}>
          <g className="ev-reveal">
            <path className="ev-stem" d={`M0 0L${pl.sx} ${pl.sy}`} />
            <circle className="ev-stem-end" cx={pl.sx} cy={pl.sy} r={2.4} />
            <g transform={`translate(${pl.x} ${pl.y})`}>
              {pl.mode === 'full' ? (
                <FullCard b={b} w={pl.w} h={pl.h} selected={selected} selectedRoom={selectedRoom} hoverRoom={hoverRoom} onHover={setHover} />
              ) : (
                <CompactCard b={b} w={pl.w} h={pl.h} selected={selected} onHover={setHover} />
              )}
            </g>
          </g>
        </g>
      )}
      {b.pins.map((p, i) => (
        <PinMark key={i} pin={p} selected={selected} index={index} tappable={pl.mode === 'pin' && interactive} onPick={() => pick(b.rows[0]?.no ?? null)} />
      ))}
    </g>
  )
})

function FullCard({
  b,
  w,
  h,
  selected,
  selectedRoom,
  hoverRoom,
  onHover,
}: {
  b: EvBuilding
  w: number
  h: number
  selected: boolean
  selectedRoom?: string
  hoverRoom: string | null
  onHover: (id: string | null) => void
}) {
  const first = b.rows[0]
  return (
    <>
      <rect x={1.5} y={3.5} width={w} height={h} rx={12} className="ev-card-shadow" />
      <rect className="ev-card-body" data-sel={selected} x={0} y={0} width={w} height={h} rx={12} />
      {/* 머리글: 건물 색 띠 + 코드 + 건물 이름 (건물 이름표와 같은 모양) */}
      <path d={`M0 ${CARD_HEADER_H}V12a12 12 0 0 1 12-12H${w - 12}a12 12 0 0 1 12 12V${CARD_HEADER_H}Z`} style={{ fill: tint(b.color, 0.2) }} />
      <rect x={0} y={0} width={w} height={3.5} rx={1.75} style={{ fill: b.color }} />
      <line x1={0} x2={w} y1={CARD_HEADER_H} y2={CARD_HEADER_H} className="ev-card-rule" />
      <g data-hit="" style={{ cursor: 'pointer' }} onClick={() => first && pick(first.no)}>
        <rect x={0} y={0} width={w} height={CARD_HEADER_H} fill="transparent" />
        <circle cx={22} cy={CARD_HEADER_H / 2 + 1} r={10} style={{ fill: b.color }} />
        <text x={22} y={CARD_HEADER_H / 2 + 1.5} textAnchor="middle" dominantBaseline="central" className="font-display" style={{ fontSize: 12.5, fontWeight: 600, fill: '#fff' }}>
          {b.code}
        </text>
        <text x={39} y={CARD_HEADER_H / 2 + 1.5} dominantBaseline="central" style={{ fontSize: 13, fontWeight: 750, letterSpacing: '0.01em', fill: 'rgb(var(--ink))' }}>
          {b.name}
        </text>
      </g>
      {b.rows.map((r, i) => (
        <CardRowView
          key={r.roomId}
          r={r}
          y={CARD_HEADER_H + i * CARD_ROW_H}
          w={w}
          active={r.roomId === selectedRoom}
          hover={r.roomId === hoverRoom}
          onHover={onHover}
          last={i === b.rows.length - 1}
        />
      ))}
    </>
  )
}

function CardRowView({ r, y, w, active, hover, onHover, last }: { r: CardRow; y: number; w: number; active: boolean; hover: boolean; onHover: (id: string | null) => void; last: boolean }) {
  const cy = y + CARD_ROW_H / 2
  return (
    <g
      className="ev-row"
      data-active={active}
      data-hit=""
      style={{ cursor: 'pointer' }}
      onClick={() => pick(r.no)}
      onPointerEnter={() => onHover(r.roomId)}
      onPointerLeave={() => onHover(null)}
    >
      <rect className="ev-row-bg" data-on={active || hover} x={4} y={y + 1} width={w - 8} height={CARD_ROW_H - (last ? 1 : 2)} rx={8} />
      {r.start ? (
        <>
          <rect x={10} y={cy - 10} width={r.badgeW} height={20} rx={10} style={{ fill: SPOT_START_FILL }} />
          <path d={FLAG_ROW} transform={`translate(${10 + 11} ${cy})`} fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          <text x={10 + 19} y={cy + 0.6} dominantBaseline="central" style={{ fontSize: 12, fontWeight: 800, fill: '#fff' }}>
            출발
          </text>
        </>
      ) : (
        <>
          <rect x={10} y={cy - 10} width={r.badgeW} height={20} rx={10} style={{ fill: SPOT_STAR_FILL, stroke: 'rgb(var(--star-deep) / 0.55)', strokeWidth: 0.9 }} />
          <path d={STAR_ROW} transform={`translate(${10 + 11} ${cy - 0.3})`} style={{ fill: 'rgb(var(--navy))' }} />
          <text x={10 + 19} y={cy + 0.6} dominantBaseline="central" style={{ fontSize: 13, fontWeight: 800, fill: 'rgb(var(--navy))' }}>
            {r.no}
          </text>
        </>
      )}
      <text x={10 + r.badgeW + 9} y={cy + 0.6} dominantBaseline="central" style={{ fontSize: 13.5, fontWeight: 750, fill: 'rgb(var(--ink))' }}>
        {r.label}
      </text>
      <text x={w - 11} y={cy + 0.6} textAnchor="end" dominantBaseline="central" className="tnum" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', fill: 'rgb(var(--ink-mute))' }}>
        {r.floorId}
      </text>
    </g>
  )
}

function CompactCard({ b, w, h, selected, onHover }: { b: EvBuilding; w: number; h: number; selected: boolean; onHover: (id: string | null) => void }) {
  const c = b.compact
  const first = b.rows[0]
  return (
    <g
      className="ev-compact"
      data-hit=""
      data-sel={selected}
      data-start={c.start}
      style={{ cursor: 'pointer' }}
      onClick={() => first && pick(first.no)}
      onPointerEnter={() => first && onHover(first.roomId)}
      onPointerLeave={() => onHover(null)}
    >
      <rect x={1} y={2.4} width={w} height={h} rx={h / 2} className="ev-card-shadow" />
      <rect className="ev-compact-face" x={0} y={0} width={w} height={h} rx={h / 2} />
      {c.start ? (
        <path d={FLAG_ROW} transform={`translate(${10 + 5} ${h / 2})`} fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d={STAR_COMPACT} transform={`translate(${10 + 6} ${h / 2 - 0.4})`} style={{ fill: 'rgb(var(--navy))' }} />
      )}
      <text
        x={c.start ? 10 + 13 : 10 + 14}
        y={h / 2 + 0.6}
        dominantBaseline="central"
        style={{ fontSize: 12.5, fontWeight: 800, fill: c.start ? '#fff' : 'rgb(var(--navy))' }}
      >
        {c.start ? c.head : c.head.replace('★', '')}
      </text>
      <text x={10 + c.headW + 6} y={h / 2 + 0.6} dominantBaseline="central" style={{ fontSize: 12.5, fontWeight: 750, fill: c.start ? 'rgb(255 255 255 / 0.92)' : 'rgb(var(--ink))' }}>
        {c.name}
      </text>
    </g>
  )
}

// ───────────── 핀 ─────────────

function PinMark({ pin, selected, index, tappable, onPick }: { pin: EvPin; selected: boolean; index: number; tappable: boolean; onPick: () => void }) {
  const start = pin.nos.length === 0
  const wide = pin.text.length > 2
  const w = wide ? Math.ceil(estimateTextWidth(pin.text, 11.5)) + 14 : PIN_R * 2
  return (
    <g style={{ ...at(pin.at[0], pin.at[1]), '--i': index } as CSSProperties} pointerEvents={tappable ? undefined : 'none'}>
      <g className="ev-reveal ev-pin" data-sel={selected} data-hit={tappable ? '' : undefined} style={tappable ? { cursor: 'pointer' } : undefined} onClick={tappable ? onPick : undefined}>
        {selected && <circle className="ev-pin-pulse" r={PIN_R + 2} />}
        <ellipse cx={0} cy={PIN_R - 1} rx={w / 2 + 1} ry={3} fill="#0b1220" fillOpacity={0.22} />
        <rect
          x={-w / 2}
          y={-PIN_R}
          width={w}
          height={PIN_R * 2}
          rx={PIN_R}
          style={{
            fill: start ? SPOT_START_FILL : SPOT_STAR_FILL,
            stroke: selected ? 'rgb(var(--navy))' : start ? 'rgb(var(--surface))' : 'rgb(var(--surface))',
            strokeWidth: selected ? 2.4 : 1.8,
          }}
        />
        {start ? (
          <path d={FLAG_ROW} transform="translate(0.6 0)" fill="none" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <text x={0} y={0.6} textAnchor="middle" dominantBaseline="central" style={{ fontSize: wide ? 11 : 11.5, fontWeight: 800, fill: 'rgb(var(--navy))' }}>
            {pin.text}
          </text>
        )}
      </g>
    </g>
  )
}

// ───────────── 출입구 화살표 ─────────────

function EntranceArrow({ en, textSide, selected }: { en: EntranceMarker; textSide: 1 | -1 | 0; selected: boolean }) {
  // 이름은 화살표 옆(몸통 축에 수직)에 — 카드 줄기가 지나가는 축을 피하고, 카드·핀이 덮는 쪽이면 반대편(둘 다 막히면 생략)
  const o = entranceTextOffset(en, textSide === -1 ? -1 : 1)
  return (
    <g style={at(en.at[0], en.at[1])} pointerEvents="none" className="ev-entrance" data-sel={selected}>
      <g transform={`rotate(${en.angle})`}>
        {/* 화살촉이 출입구 지점에 닿고 몸통은 건물 밖에서 안쪽을 향한다 */}
        <path d="M-17 -8.5L-1 0L-17 8.5L-12.5 0Z" className="ev-entrance-arrow" />
      </g>
      {textSide !== 0 && (
        <text x={o.x} y={o.y} textAnchor="middle" dominantBaseline="central" className="ev-entrance-text">
          {en.name}
        </text>
      )}
    </g>
  )
}
