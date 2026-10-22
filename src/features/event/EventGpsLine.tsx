// 캠퍼스 지도 위: 내 위치 점에서 선택한 안내 장소(건물 출입구 또는 중심)까지의 '직선' 점선. 경로가 아니다 — 패널에 같은 문구가 있다.
import { useStraightLine } from './useStraightLine'

export function EventGpsLine() {
  const line = useStraightLine()
  if (!line) return null
  const [x1, y1] = line.from
  const [x2, y2] = line.to
  return (
    <g data-layer="event-gps-line" pointerEvents="none" aria-hidden="true">
      <line className="ev-gps-line-halo" x1={x1} y1={y1} x2={x2} y2={y2} />
      <line className="ev-gps-line" x1={x1} y1={y1} x2={x2} y2={y2} />
      <g style={{ transform: `translate(${x2}px, ${y2}px) scale(calc(var(--ik, 1) * var(--ui-scale, 1)))` }}>
        <circle r={5} className="ev-gps-end" />
      </g>
    </g>
  )
}
