/**
 * features/gps/calibrationFit.ts — 위치 보정 계산 (SPEC §4.8). React 비의존 순수 함수.
 *
 *   averageFixes(fixes)           10초 동안 모은 GPS 표본의 정확도 가중 평균 (이상치 제거 포함)
 *   computeCalibration(points)    보정점 → 변환 적합
 *       1점   lib/geo.fitTranslation(campus.geo.pxToEnu, …)  평행이동 보정(선형부는 기본 OSM 추정 유지)
 *       2점↑  lib/geo.fitSimilarity(…)                       2D 닮음변환(회전+등방 배율+이동) 최소제곱
 *   calibrationFileJson(c)        public/content/geo-calibration.json 에 그대로 넣을 수 있는 JSON 문자열
 *
 * rmsErrorM(변환의 추정 오차)는 잔차 RMS 만 쓰지 않는다. 1점은 잔차가 항상 0, 2점도 자유도가 맞아 0 이 되므로
 * 그대로 쓰면 오차를 과소평가한다. → max(잔차 RMS, 측정 정확도 RMS/√n, 1 m), 1점은 추가로 기본 추정 오차 이상으로 둔다.
 */
import { campus } from '../../data'
import type { Affine6, Calibration, CalibrationPoint, Pt } from '../../data/types'
import {
  applyAffine,
  fitSimilarity,
  fitTranslation,
  haversine,
  pairsFromCalibrationPoints,
  rmsOf,
  type SimilarityFit,
} from '../../lib/geo'
import { boundsCenter, boundsFromViewBox } from '../../lib/geometry'
import type { GpsFix } from './positioning'

// ───────────── 표본 평균 ─────────────

export interface AveragedFix {
  lat: number
  lon: number
  /** 사용한 표본의 평균 보고 정확도(m) — 보수적으로 평균 사용 */
  acc: number
  /** 받은 표본 수 / 평균에 쓴 표본 수 */
  samples: number
  used: number
  /** 평균 위치에서 표본들이 흩어진 정도(RMS, m) */
  spreadM: number
}

function weightedMean(fixes: readonly GpsFix[]): { lat: number; lon: number } {
  let sw = 0
  let lat = 0
  let lon = 0
  for (const f of fixes) {
    const w = 1 / Math.max(f.accuracy, 1) ** 2
    sw += w
    lat += f.lat * w
    lon += f.lon * w
  }
  return { lat: lat / sw, lon: lon / sw }
}

export function averageFixes(fixes: readonly GpsFix[]): AveragedFix | null {
  const valid = fixes.filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lon) && Number.isFinite(f.accuracy))
  if (valid.length === 0) return null
  let used = valid
  let mean = weightedMean(used)
  // 이상치(중앙값 거리의 3배 · 최소 15 m 초과) 제거 후 다시 평균 — 표본이 충분할 때만
  if (valid.length >= 5) {
    const d = valid.map((f) => haversine(f, mean))
    const sorted = [...d].sort((x, y) => x - y)
    const median = sorted[Math.floor(sorted.length / 2)]
    const limit = Math.max(15, median * 3)
    const kept = valid.filter((_, i) => d[i] <= limit)
    if (kept.length >= 3 && kept.length < valid.length) {
      used = kept
      mean = weightedMean(used)
    }
  }
  const acc = used.reduce((s, f) => s + f.accuracy, 0) / used.length
  const spreadM = rmsOf(used.map((f) => haversine(f, mean)))
  return { lat: mean.lat, lon: mean.lon, acc, samples: valid.length, used: used.length, spreadM }
}

// ───────────── 보정 적합 ─────────────

export type FitMethod = 'translation' | 'similarity'

export interface CalibrationResult {
  method: FitMethod
  calibration: Calibration
  fit: SimilarityFit
  /** 점별 잔차(m) — points 와 같은 순서 */
  residuals: number[]
  rmsErrorM: number
  /** 캠퍼스 중심에서 기본(OSM 추정) 대비 이동량(m) */
  shiftFromBaseM: number
  /** 기본 대비 배율 변화(%) / 회전 변화(°) */
  scaleChangePct: number
  rotationDeltaDeg: number
  /** 점들 사이 최대 거리(m) */
  spanM: number
  warnings: string[]
}

const MIN_SPAN_M = 40
const MAX_SCALE_CHANGE_PCT = 4
const MAX_ROTATION_DELTA_DEG = 5
const BAD_ACCURACY_M = 20
const BAD_RESIDUAL_M = 8

function sig(n: number): number {
  return Number(n.toPrecision(10))
}

/** 점 기록 시 반올림 (lat/lon 1 cm, px 0.1, acc 0.1) — 적합은 이 반올림된 값으로 계산해 JSON 재적용 결과와 일치시킨다 */
export function roundPoint(px: Pt, avg: AveragedFix): CalibrationPoint {
  return {
    px: [Math.round(px[0] * 10) / 10, Math.round(px[1] * 10) / 10],
    lat: Number(avg.lat.toFixed(7)),
    lon: Number(avg.lon.toFixed(7)),
    acc: Math.round(avg.acc * 10) / 10,
  }
}

export function computeCalibration(points: readonly CalibrationPoint[], now: Date = new Date()): CalibrationResult | null {
  if (points.length === 0) return null
  const base = campus.geo.pxToEnu
  const pairs = pairsFromCalibrationPoints(points, campus.geo)
  const method: FitMethod = points.length === 1 ? 'translation' : 'similarity'
  const fit = method === 'translation' ? fitTranslation(base, pairs) : fitSimilarity(pairs)
  if (!fit) return null

  const accRms = rmsOf(points.map((p) => p.acc))
  let rms = Math.max(fit.rmsErrorM, accRms / Math.sqrt(points.length), 1)
  if (method === 'translation') rms = Math.max(rms, campus.geo.rmsErrorM)
  const rmsErrorM = Math.round(rms * 10) / 10

  const A: Affine6 = fit.pxToEnu.map(sig) as Affine6
  const calibration: Calibration = {
    pxToEnu: A,
    rmsErrorM,
    points: points.map((p) => ({ px: [...p.px] as Pt, lat: p.lat, lon: p.lon, acc: p.acc })),
    createdAt: now.toISOString(),
  }

  // 기본 대비 변화
  const center = boundsCenter(boundsFromViewBox(campus.site.viewBox))
  const c0 = applyAffine(base, center)
  const c1 = applyAffine(A, center)
  const shiftFromBaseM = Math.hypot(c1[0] - c0[0], c1[1] - c0[1])
  const baseScale = Math.hypot(base[0], base[1])
  const scaleChangePct = (Math.hypot(A[0], A[1]) / baseScale - 1) * 100
  let rotationDeltaDeg = ((Math.atan2(A[1], A[0]) - Math.atan2(base[1], base[0])) * 180) / Math.PI
  rotationDeltaDeg = ((rotationDeltaDeg + 540) % 360) - 180

  // 점 간격
  let spanPx = 0
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) spanPx = Math.max(spanPx, Math.hypot(points[i].px[0] - points[j].px[0], points[i].px[1] - points[j].px[1]))
  const spanM = spanPx * Math.hypot(A[0], A[3])

  const warnings: string[] = []
  if (points.some((p) => p.acc > BAD_ACCURACY_M)) warnings.push(`측정 정확도가 ${BAD_ACCURACY_M} m보다 낮은 점이 있습니다. 하늘이 트인 곳에서 다시 기록하면 더 정확해집니다.`)
  if (method === 'similarity') {
    if (spanM < MIN_SPAN_M) warnings.push(`점 사이 거리가 ${Math.round(spanM)} m로 가깝습니다. 회전·배율이 불안정할 수 있으니 서로 ${MIN_SPAN_M} m 이상 떨어진 지점을 추가하세요.`)
    if (Math.abs(scaleChangePct) > MAX_SCALE_CHANGE_PCT) warnings.push(`배율이 기본 대비 ${scaleChangePct > 0 ? '+' : ''}${scaleChangePct.toFixed(1)}% 달라졌습니다. 측정이 부정확하거나 탭한 지점이 어긋났을 수 있어요.`)
    if (Math.abs(rotationDeltaDeg) > MAX_ROTATION_DELTA_DEG) warnings.push(`회전이 기본 대비 ${rotationDeltaDeg > 0 ? '+' : ''}${rotationDeltaDeg.toFixed(1)}° 달라졌습니다. 점 위치를 다시 확인해 주세요.`)
    const worst = fit.residuals.reduce((m, r, i) => (r > fit.residuals[m] ? i : m), 0)
    if (fit.residuals[worst] > BAD_RESIDUAL_M) warnings.push(`${worst + 1}번 점의 잔차가 ${fit.residuals[worst].toFixed(1)} m로 큽니다. 해당 점을 지우고 다시 기록해 보세요.`)
  } else {
    warnings.push('1점 보정은 위치 오프셋만 맞춥니다. 방향·배율까지 맞추려면 서로 떨어진 지점을 하나 더 기록하세요.')
  }

  return { method, calibration, fit, residuals: fit.residuals, rmsErrorM, shiftFromBaseM, scaleChangePct, rotationDeltaDeg, spanM, warnings }
}

// ───────────── 내보내기 ─────────────

const FILE_NOTE =
  '현장에서 측정한 GPS 보정 결과를 넣는 파일입니다. 관리자 화면(#/calibrate)에서 내보내기한 JSON을 그대로 붙여 넣으세요. 비어 있으면 OSM 기반 추정 좌표를 사용합니다.'

/** public/content/geo-calibration.json 전체 내용 (calibration 값만 붙여 넣어도 된다) */
export function calibrationFileJson(c: Calibration): string {
  return JSON.stringify({ _안내: FILE_NOTE, calibration: c }, null, 1) + '\n'
}
