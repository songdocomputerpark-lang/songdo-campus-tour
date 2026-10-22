// 선택한 안내 장소까지의 '직선' 안내 계산 (GPS). 좌표는 렌더에만 쓰고 어디에도 저장·전송하지 않는다.
//  표시 조건 = 추적 중 + 판정 'good'(정확도 낮음·학교 밖이면 숨김). 도착점 = 그 건물 출입구(알면) 아니면 건물 중심.
import { useMemo } from 'react'
import type { Pt } from '../../data/types'
import { useGeoTransform } from '../../lib/calibration'
import { haversine } from '../../lib/geo'
import { spotTargetPx } from '../../map/eventLayout'
import { useAppStore } from '../../store/useAppStore'
import { useFixAssessment } from '../gps/useFixAssessment'
import { useSpots } from '../tour/spots'
import { bearingDeg, spotByNo } from './eventModel'

export interface StraightLine {
  /** 현재 위치(배치도 px) */
  from: Pt
  /** 도착점(배치도 px) */
  to: Pt
  distanceM: number
  /** 진북 기준 방위각(도) */
  bearing: number
}

export function useStraightLine(): StraightLine | null {
  const active = useAppStore((s) => s.event.active)
  const spotNo = useAppStore((s) => s.event.spotNo)
  const status = useAppStore((s) => s.gps.status)
  const fix = useAppStore((s) => s.gps.fix)
  const a = useFixAssessment()
  const geo = useGeoTransform()
  const spots = useSpots()
  const spot = spotByNo(spots, spotNo)
  const buildingId = spot?.buildingId
  return useMemo(() => {
    if (!active || !buildingId || status !== 'tracking' || !fix || !a || a.quality !== 'good') return null
    const to = spotTargetPx(buildingId)
    if (!to) return null
    const target = geo.pxToLatLon(to)
    const distanceM = haversine(fix, target)
    if (!Number.isFinite(distanceM)) return null
    return { from: a.px, to, distanceM, bearing: bearingDeg(fix, target) }
  }, [active, buildingId, status, fix, a, geo])
}
