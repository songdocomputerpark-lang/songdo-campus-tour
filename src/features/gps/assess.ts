/**
 * features/gps/assess.ts — 위치 판정(순수 함수). React/스토어 비의존.
 *
 *   quality 'good'          마커 + 정확도 원 표시 ("추정 위치 ±N m")
 *           'low-accuracy'  정확도 > 50 m → 마커 대신 "정확도가 낮습니다" 상태 (깜박임 방지 히스테리시스: 40 m 이하로 내려와야 해제)
 *           'off-campus'    캠퍼스 대지에서 300 m 이상 → "학교 밖에 계십니다 · 약 X km", 마커 숨김
 *   정확도가 낮아 정확도 원이 캠퍼스 300 m 안까지 닿을 수 있으면 학교 밖이라고 단정하지 않고 '정확도 낮음'으로 안내한다.
 *
 * 좌표는 이 파일에서 어디에도 저장하지 않는다.
 */
import { campus, site } from '../../data'
import type { Pt } from '../../data/types'
import { haversine, type GeoTransform } from '../../lib/geo'
import { centroid, distToPolygon } from '../../lib/geometry'
import type { GpsFix } from './positioning'

export const LOW_ACCURACY_M = 50
export const LOW_ACCURACY_RELEASE_M = 40
export const OFF_CAMPUS_M = 300
/** 이 속도(m/s) 미만이면 heading 을 신뢰하지 않는다 */
const MIN_HEADING_SPEED = 0.4

const CAMPUS_CENTER_PX: Pt = centroid(site.boundary)

// ───────────── 정확도 히스테리시스(모듈 단위 1개) ─────────────
let lowLatch = false
/** 새 fix 의 정확도를 반영해 '정확도 낮음' 래치를 갱신하고 결과를 돌려준다 */
export function updateLowLatch(accuracy: number): boolean {
  lowLatch = accuracy > (lowLatch ? LOW_ACCURACY_RELEASE_M : LOW_ACCURACY_M)
  return lowLatch
}
export function getLowLatch(): boolean {
  return lowLatch
}
export function resetLowLatch(): void {
  lowLatch = false
}

// ───────────── 판정 ─────────────

export type FixQuality = 'good' | 'low-accuracy' | 'off-campus'

export interface FixAssessment {
  quality: FixQuality
  /** 배치도 px (site px) */
  px: Pt
  /** GPS 수평 정확도(m) */
  accuracyM: number
  /** √(accuracy² + 위치 변환 오차²) (m) — 화면의 "±N m" 과 정확도 원 반경의 기준 */
  uncertaintyM: number
  /** 정확도 원 반경 (월드 px) */
  radiusPx: number
  /** 캠퍼스 대지 경계까지 거리(m). 대지 안이면 0 */
  distanceToCampusM: number
  /** 진행 방향(화면 위쪽 기준 시계방향 deg). 정지·미지원이면 null */
  headingDeg: number | null
}

/** 진북 기준 방위각 → 배치도 화면 각도(위쪽 기준 시계방향). 실제 적용 중인 변환(보정 포함)으로 5 m 앞 지점을 투영해 계산 */
function bearingToScreenDeg(fix: GpsFix, bearingDeg: number, geo: GeoTransform): number | null {
  const th = (bearingDeg * Math.PI) / 180
  const d = 5 // m
  const p1 = geo.latLonToPx(fix)
  const p2 = geo.latLonToPx({
    lat: fix.lat + (Math.cos(th) * d) / campus.geo.metersPerDegLat,
    lon: fix.lon + (Math.sin(th) * d) / campus.geo.metersPerDegLon,
  })
  const deg = (Math.atan2(p2[0] - p1[0], -(p2[1] - p1[1])) * 180) / Math.PI
  return Number.isFinite(deg) ? (deg + 360) % 360 : null
}

export function assessFix(fix: GpsFix, geo: GeoTransform, low: boolean = fix.accuracy > LOW_ACCURACY_M): FixAssessment {
  const px = geo.latLonToPx(fix)
  const uncertaintyM = Math.hypot(fix.accuracy, geo.rmsErrorM)

  let distanceToCampusM = distToPolygon(px, site.boundary) * geo.metersPerPx
  if (!Number.isFinite(distanceToCampusM) || distanceToCampusM > 20000) {
    // 아주 먼 곳은 평면 근사 대신 대원거리(캠퍼스 중심 기준)
    distanceToCampusM = haversine(fix, geo.pxToLatLon(CAMPUS_CENTER_PX))
  }

  const far = distanceToCampusM >= OFF_CAMPUS_M
  const quality: FixQuality =
    far && (!low || distanceToCampusM - fix.accuracy >= OFF_CAMPUS_M) ? 'off-campus' : low ? 'low-accuracy' : 'good'

  const moving = fix.heading != null && (fix.speed == null || fix.speed >= MIN_HEADING_SPEED)
  const headingDeg = moving && fix.heading != null ? bearingToScreenDeg(fix, fix.heading, geo) : null

  return {
    quality,
    px,
    accuracyM: fix.accuracy,
    uncertaintyM,
    radiusPx: uncertaintyM / geo.metersPerPx,
    distanceToCampusM,
    headingDeg,
  }
}

// ───────────── 표시 문구 ─────────────

/** "±8 m" */
export function formatUncertainty(m: number): string {
  return `±${Math.max(1, Math.round(m))} m`
}

/** "약 420 m" / "약 3.2 km" / "약 48 km" */
export function formatDistance(m: number): string {
  if (m < 1000) return `약 ${Math.max(10, Math.round(m / 10) * 10)} m`
  const km = m / 1000
  return `약 ${km < 10 ? km.toFixed(1) : Math.round(km)} km`
}
