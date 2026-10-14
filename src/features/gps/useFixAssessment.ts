// 현재 gps.fix 를 (보정 우선순위가 적용된) 변환기로 판정한 결과. GpsLayer · GpsControls 가 공유한다.
import { useMemo } from 'react'
import { useGeoTransform } from '../../lib/calibration'
import { useAppStore } from '../../store/useAppStore'
import { assessFix, getLowLatch, type FixAssessment } from './assess'

export function useFixAssessment(): FixAssessment | null {
  const fix = useAppStore((s) => s.gps.fix)
  const geo = useGeoTransform()
  // '정확도 낮음' 래치는 fix 를 받는 순간(useGeolocation) 갱신되므로 fix 가 바뀔 때 함께 다시 계산된다
  return useMemo(() => (fix ? assessFix(fix, geo, getLowLatch()) : null), [fix, geo])
}
