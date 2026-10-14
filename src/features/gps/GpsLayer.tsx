/**
 * features/gps/GpsLayer.tsx — 캠퍼스 지도 위 "내 위치" (SPEC §4.7)
 *
 * ┌ 계약 ─ map/CampusMap.tsx 가 월드 <g> 안(건물·라벨 위)에 `<GpsLayer />` 를 props 없이 렌더한다 ┐
 *  · 좌표계 = 배치도 site px. 위경도 → px 는 useGeoTransform()(보정 우선순위 적용)로 변환한다 (useFixAssessment).
 *  · 화면 크기 고정 마커: 안쪽 <g> 에 scale(var(--ik)) — 확대/축소해도 마커 크기는 일정. 정확도 원은 월드 단위.
 *  · pointer-events 는 none — 건물 탭을 가로채지 않는다.
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * 표시 규칙
 *   good          펄스 점 + 정확도 원(반경 = √(acc² + rmsErrorM²)/metersPerPx) + 방향(heading 있을 때) + "추정 위치 ±N m"
 *                 · 점 아래 글자는 건물 이름표보다 낮은 우선순위 — 좁은 화면(< 640px)에서는 생략(상태 칩에 같은 값이 있다)하고,
 *                   그 밖에는 이름표와 겹치면 생략한다 (map/buildingLabels.gpsLabelClear)
 *   low-accuracy  마커 없음 (안내는 GpsControls 상태 칩: "정확도가 낮습니다 — 실외에서 잠시 기다려 주세요")
 *   off-campus    마커 없음 ("학교 밖에 계십니다 · 약 X km")
 * 위치가 바뀌면 부드럽게 이동(700ms)한다. 좌표는 렌더에만 쓰이고 어디에도 저장하지 않는다.
 */
import { gpsLabelClear } from '../../map/buildingLabels'
import { useLabelPlacement } from '../../map/useLabelPlacement'
import { useAppStore } from '../../store/useAppStore'
import { formatUncertainty } from './assess'
import { useFixAssessment } from './useFixAssessment'

const SCALE = 'calc(var(--ik, 1) * var(--ui-scale, 1))'

export function GpsLayer() {
  const status = useAppStore((s) => s.gps.status)
  const a = useFixAssessment()
  const placement = useLabelPlacement()
  if (status !== 'tracking' || !a || a.quality !== 'good') return null
  const [x, y] = a.px
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const text = `추정 위치 ${formatUncertainty(a.uncertaintyM)}`
  const showText = !placement.narrow && gpsLabelClear(placement, x, y, text)

  return (
    <g data-layer="gps" pointerEvents="none" aria-hidden="true">
      <g style={{ transform: `translate(${x}px, ${y}px)`, transition: 'transform 700ms linear' }}>
        {/* 정확도 원 (월드 단위 반경) */}
        <circle
          r={Math.max(a.radiusPx, 3)}
          style={{
            fill: 'rgb(var(--leaf) / 0.13)',
            stroke: 'rgb(var(--leaf) / 0.6)',
            strokeWidth: 1.2,
            strokeDasharray: '5 4',
            vectorEffect: 'non-scaling-stroke',
          }}
        />
        {/* 화면 크기 고정 마커 */}
        <g style={{ transform: `scale(${SCALE})` }}>
          {a.headingDeg != null && (
            <g style={{ transform: `rotate(${a.headingDeg}deg)`, transition: 'transform 300ms ease-out' }}>
              <path d="M0 -12 L-11 -34 Q0 -41 11 -34 Z" style={{ fill: 'rgb(var(--leaf) / 0.42)', stroke: 'rgb(var(--leaf))', strokeWidth: 1.2, strokeLinejoin: 'round' }} />
            </g>
          )}
          <circle
            r={9}
            style={{
              fill: 'rgb(var(--leaf) / 0.4)',
              animation: 'gps-pulse 2.4s var(--ease-out) infinite',
              transformBox: 'fill-box',
              transformOrigin: 'center',
            }}
          />
          <circle r={11.5} cy={1.6} style={{ fill: 'rgb(11 18 32 / 0.2)' }} />
          <circle r={10} style={{ fill: '#fff' }} />
          <circle r={6.6} style={{ fill: 'rgb(var(--leaf))' }} />
          {showText && (
            <text
              y={30}
              textAnchor="middle"
              style={{
                fontSize: 12,
                fontWeight: 650,
                fill: 'rgb(var(--navy))',
                paintOrder: 'stroke',
                stroke: 'rgb(var(--surface))',
                strokeWidth: 4,
                strokeLinejoin: 'round',
              }}
            >
              {text}
            </text>
          )}
        </g>
      </g>
    </g>
  )
}
