// 캠퍼스 배치도 위 '학생 안내 장소' 핀 레이어 (CampusMap 의 월드 <g> 안, 건물·이름표 위).
//  · 배치·크기는 spotPins.layoutPins — 이름표 배치(useLabelPlacement)와 같은 배율 단계·모드를 쓴다.
//  · 줄을 누르면 그 지점부터 안내 코스(투어)를 연다. 축약 줄에 지점이 여럿이면 건물 안내를 연다(건물 패널에 지점 목록).
//  · 접근성: 각 줄 = <g role="button" tabIndex=0 aria-label="학생 안내 장소 3번 중앙현관, 본관동 1층">.
import { useMemo, type KeyboardEvent } from 'react'
import { floorLabel, getBuilding } from '../data'
import type { BuildingId } from '../data/types'
import { spotAria, useSpots } from '../features/tour/spots'
import { useAppStore } from '../store/useAppStore'
import { flagPath, SPOT_START_EDGE, SPOT_START_FILL, SPOT_START_INK, SPOT_STAR_FILL, starPath } from './icons'
import { layoutPins, pinFull, pinInputFor, PIN_FONT, PIN_POINTER, PIN_ROW_GAP, PIN_ROW_H, type PinLayout, type PinRow } from './spotPins'
import { useLabelPlacement } from './useLabelPlacement'

const STAR_7 = starPath(6.6)
const STAR_8 = starPath(7.4)
const FLAG_6 = flagPath(6)

export function SpotPinLayer({ interactive }: { interactive: boolean }) {
  const placement = useLabelPlacement()
  const spots = useSpots()
  const input = pinInputFor(spots)
  const full = pinFull(placement.k, placement.narrow)
  const pins = useMemo(() => layoutPins(input.byBuilding, full), [input, full])
  if (pins.length === 0) return null
  return (
    <g className="spot-pins">
      {pins.map((p) => (
        <SpotPin key={p.id} pin={p} interactive={interactive} />
      ))}
    </g>
  )
}

function pick(row: PinRow, buildingId: BuildingId) {
  const st = useAppStore.getState()
  if (row.spots.length === 1) st.startTour(row.spots[0].index)
  else st.selectBuilding(buildingId)
}

function rowAria(row: PinRow, buildingId: BuildingId): string {
  const bname = getBuilding(buildingId)?.name ?? ''
  if (row.spots.length === 1) {
    const s = row.spots[0]
    return `${spotAria(s)}, ${bname} ${floorLabel(s.floorId)}. 선택하면 안내 코스에서 봅니다`
  }
  return `${bname} 학생 안내 장소 ${row.spots.map((s) => `${s.no}번 ${s.label}`).join(', ')}. 선택하면 건물 안내를 엽니다`
}

function SpotPin({ pin, interactive }: { pin: PinLayout; interactive: boolean }) {
  const top = -PIN_POINTER - pin.h
  const bottom = pin.rows[pin.rows.length - 1]
  const pointerFill = bottom.kind === 'start' ? SPOT_START_FILL : pin.full ? 'rgb(var(--surface))' : SPOT_STAR_FILL
  const pointerStroke = bottom.kind === 'start' ? SPOT_START_EDGE : 'rgb(var(--star-deep))'
  return (
    <g className="spot-pin" style={{ transform: `translate(${pin.tip[0]}px, ${pin.tip[1]}px) scale(calc(var(--ik, 1) * var(--ui-scale, 1)))` }}>
      {/* 지붕 위 위치 점 + 은은한 파문 */}
      <g pointerEvents="none">
        <circle className="spot-pulse" data-kind={bottom.kind} r={7} />
        <ellipse cx={0} cy={1.5} rx={6} ry={2.4} fill="#0b1220" fillOpacity={0.18} />
        <circle r={4} style={{ fill: bottom.kind === 'start' ? SPOT_START_FILL : SPOT_STAR_FILL, stroke: bottom.kind === 'start' ? SPOT_START_EDGE : 'rgb(var(--surface))', strokeWidth: bottom.kind === 'start' ? 2 : 1.8 }} />
        <path d={`M-5.5 ${-PIN_POINTER - 1}L5.5 ${-PIN_POINTER - 1}L0 -5Z`} style={{ fill: pointerFill, stroke: pointerStroke, strokeWidth: 1.3, strokeLinejoin: 'round' }} />
      </g>
      {pin.rows.map((row, i) => (
        <PinRowShape
          key={`${row.kind}-${i}`}
          row={row}
          w={pin.w}
          full={pin.full}
          y={top + i * (PIN_ROW_H + PIN_ROW_GAP)}
          interactive={interactive}
          onPick={() => pick(row, pin.id)}
          aria={rowAria(row, pin.id)}
        />
      ))}
    </g>
  )
}

function PinRowShape({
  row,
  w,
  full,
  y,
  interactive,
  onPick,
  aria,
}: {
  row: PinRow
  w: number
  full: boolean
  y: number
  interactive: boolean
  onPick: () => void
  aria: string
}) {
  const start = row.kind === 'start'
  const onKey = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPick()
    }
  }
  // 펼침 핀은 줄 폭을 맞추고(가장 긴 줄 기준) 가운데 정렬, 축약 핀은 줄마다 제 폭
  const rw = full ? w : row.w
  const x0 = -rw / 2
  const cy = y + PIN_ROW_H / 2
  const r = PIN_ROW_H / 2
  return (
    <g
      className="spot-row"
      data-hit={interactive ? '' : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : -1}
      aria-label={interactive ? aria : undefined}
      pointerEvents={interactive ? undefined : 'none'}
      onClick={interactive ? onPick : undefined}
      onKeyDown={interactive ? onKey : undefined}
    >
      <rect x={x0 + 1} y={y + 2.2} width={rw} height={PIN_ROW_H} rx={r} fill="#0b1220" fillOpacity={0.16} />
      {full ? (
        <>
          <rect
            className="spot-row-face"
            x={x0}
            y={y}
            width={rw}
            height={PIN_ROW_H}
            rx={r}
            style={{ fill: 'rgb(var(--surface))', stroke: start ? SPOT_START_EDGE : 'rgb(var(--star-deep))', strokeWidth: 1.4 }}
          />
          <circle cx={x0 + 5 + 9} cy={cy} r={9} style={{ fill: start ? SPOT_START_FILL : SPOT_STAR_FILL, stroke: start ? SPOT_START_EDGE : 'rgb(var(--star-deep) / 0.5)', strokeWidth: 0.8 }} />
          {start ? (
            <path d={FLAG_6} transform={`translate(${x0 + 14.5} ${cy})`} fill="none" stroke={SPOT_START_INK} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <text x={x0 + 14} y={cy + 0.6} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 11.5, fontWeight: 800, fill: 'rgb(var(--navy))' }}>
              {row.spots[0].no}
            </text>
          )}
          <text x={x0 + 5 + 18 + 6} y={cy + 0.5} dominantBaseline="central" style={{ fontSize: PIN_FONT, fontWeight: 700, fill: 'rgb(var(--ink))' }}>
            {row.text}
          </text>
          {row.floor && (
            <g transform={`translate(${x0 + rw - 6} ${cy})`}>
              <text x={0} y={0.5} textAnchor="end" dominantBaseline="central" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.02em', fill: 'rgb(var(--ink-mute))' }}>
                {row.floor}
              </text>
            </g>
          )}
        </>
      ) : (
        <>
          <rect
            className="spot-row-face"
            x={x0}
            y={y}
            width={rw}
            height={PIN_ROW_H}
            rx={r}
            style={{ fill: start ? SPOT_START_FILL : SPOT_STAR_FILL, stroke: start ? SPOT_START_EDGE : 'rgb(var(--star-deep))', strokeWidth: start ? 1.6 : 1.2 }}
          />
          {start ? (
            <path d={FLAG_6} transform={`translate(${x0 + 9 + 6.5} ${cy})`} fill="none" stroke={SPOT_START_INK} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path d={row.spots.length > 1 ? STAR_7 : STAR_8} transform={`translate(${x0 + 9 + 6.5} ${cy})`} style={{ fill: 'rgb(var(--navy))' }} />
          )}
          <text
            x={x0 + 9 + 13 + (start ? 5 : 4)}
            y={cy + 0.6}
            dominantBaseline="central"
            style={{ fontSize: start ? PIN_FONT : PIN_FONT + 0.5, fontWeight: 800, letterSpacing: start ? '0.02em' : '0.01em', fill: 'rgb(var(--navy))' }}
          >
            {row.text}
          </text>
        </>
      )}
    </g>
  )
}
