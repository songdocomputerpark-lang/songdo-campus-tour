// 좌표 변환: 배치도 px ↔ ENU(미터) ↔ 위경도, 2D 닮음변환 최소제곱 적합, haversine.
//
// 모델 (docs/SPEC §2):
//   E = a*x + b*y + c,  N = d*x + e*y + f     (px, y 아래 방향 → 미터, origin 기준)
//   E = (lon - lon0) * metersPerDegLon,  N = (lat - lat0) * metersPerDegLat
// GPS → px 는 2×2 역행렬.
import type { Affine6, Calibration, CalibrationPoint, GeoMeta, Pt } from '../data/types'

export interface LatLon {
  lat: number
  lon: number
}

// ───────────── 기본 변환 ─────────────

export function applyAffine(A: Affine6, px: Pt): Pt {
  return [A[0] * px[0] + A[1] * px[1] + A[2], A[3] * px[0] + A[4] * px[1] + A[5]]
}

export function invertAffine(A: Affine6): Affine6 {
  const [a, b, c, d, e, f] = A
  const det = a * e - b * d
  if (Math.abs(det) < 1e-12) throw new Error('affine is singular')
  const ia = e / det
  const ib = -b / det
  const id = -d / det
  const ie = a / det
  return [ia, ib, -(ia * c + ib * f), id, ie, -(id * c + ie * f)]
}

export function pxToEnu(px: Pt, A: Affine6): Pt {
  return applyAffine(A, px)
}
export function enuToPx(enu: Pt, A: Affine6): Pt {
  return applyAffine(invertAffine(A), enu)
}

type DegScale = Pick<GeoMeta, 'origin' | 'metersPerDegLon' | 'metersPerDegLat'>

export function enuToLatLon(enu: Pt, g: DegScale): LatLon {
  return { lat: g.origin.lat + enu[1] / g.metersPerDegLat, lon: g.origin.lon + enu[0] / g.metersPerDegLon }
}
export function latLonToEnu(ll: LatLon, g: DegScale): Pt {
  return [(ll.lon - g.origin.lon) * g.metersPerDegLon, (ll.lat - g.origin.lat) * g.metersPerDegLat]
}

export function pxToLatLon(px: Pt, g: DegScale, A: Affine6): LatLon {
  return enuToLatLon(applyAffine(A, px), g)
}
export function latLonToPx(ll: LatLon, g: DegScale, A: Affine6): Pt {
  return applyAffine(invertAffine(A), latLonToEnu(ll, g))
}

// ───────────── 거리 ─────────────

const EARTH_R = 6371008.8
/** 두 위경도 사이 대원거리(m) */
export function haversine(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)))
}

// ───────────── 최소제곱 적합 ─────────────

export interface EnuPair {
  /** 배치도 px */
  px: Pt
  /** 대응하는 ENU 미터 */
  enu: Pt
}

export interface SimilarityFit {
  pxToEnu: Affine6
  /** 배율 (m/px) */
  scale: number
  /** 회전(rad) — px(y 아래)를 y 위로 뒤집은 뒤의 회전각 */
  rotation: number
  /** 점별 잔차(m) */
  residuals: number[]
  rmsErrorM: number
  maxErrorM: number
}

/** 점별 잔차(m) = |A(px) - enu| */
export function residualsOf(A: Affine6, pairs: readonly EnuPair[]): number[] {
  return pairs.map((p) => {
    const q = applyAffine(A, p.px)
    return Math.hypot(q[0] - p.enu[0], q[1] - p.enu[1])
  })
}

export function rmsOf(values: readonly number[]): number {
  if (values.length === 0) return 0
  return Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length)
}

/**
 * 2D 닮음변환(회전+등방 배율+평행이동, y 반전 포함) 최소제곱 적합.
 * px(y↓) 를 (x, -y) 로 뒤집어 복소수 q = λ·p + τ 로 풀면
 *   E = α x + β y + τr,  N = β x − α y + τi   (a=α, b=β, d=β, e=−α)
 * 2점 이상 필요 (1점은 fitTranslation 사용). 모든 px 가 같은 점이면 null.
 */
export function fitSimilarity(pairs: readonly EnuPair[]): SimilarityFit | null {
  const n = pairs.length
  if (n < 2) return null
  let pmx = 0
  let pmy = 0
  let qmx = 0
  let qmy = 0
  for (const { px, enu } of pairs) {
    pmx += px[0]
    pmy += -px[1]
    qmx += enu[0]
    qmy += enu[1]
  }
  pmx /= n
  pmy /= n
  qmx /= n
  qmy /= n
  let numRe = 0
  let numIm = 0
  let den = 0
  for (const { px, enu } of pairs) {
    const pr = px[0] - pmx
    const pi = -px[1] - pmy
    const qr = enu[0] - qmx
    const qi = enu[1] - qmy
    // conj(p) * q
    numRe += pr * qr + pi * qi
    numIm += pr * qi - pi * qr
    den += pr * pr + pi * pi
  }
  if (den < 1e-12) return null
  const alpha = numRe / den
  const beta = numIm / den
  // τ = q̄ − λ p̄   (p̄ = pmx + i·pmy, λ = α + iβ)
  const tr = qmx - (alpha * pmx - beta * pmy)
  const ti = qmy - (alpha * pmy + beta * pmx)
  const A: Affine6 = [alpha, beta, tr, beta, -alpha, ti]
  const residuals = residualsOf(A, pairs)
  return {
    pxToEnu: A,
    scale: Math.hypot(alpha, beta),
    rotation: Math.atan2(beta, alpha),
    residuals,
    rmsErrorM: rmsOf(residuals),
    maxErrorM: Math.max(...residuals),
  }
}

/** 1점 보정: 기존 선형부(a,b,d,e)는 유지하고 평행이동만 조정 */
export function fitTranslation(base: Affine6, pairs: readonly EnuPair[]): SimilarityFit | null {
  if (pairs.length < 1) return null
  let dx = 0
  let dy = 0
  for (const { px, enu } of pairs) {
    const q = applyAffine(base, px)
    dx += enu[0] - q[0]
    dy += enu[1] - q[1]
  }
  dx /= pairs.length
  dy /= pairs.length
  const A: Affine6 = [base[0], base[1], base[2] + dx, base[3], base[4], base[5] + dy]
  const residuals = residualsOf(A, pairs)
  return {
    pxToEnu: A,
    scale: Math.hypot(base[0], base[1]),
    rotation: Math.atan2(base[1], base[0]),
    residuals,
    rmsErrorM: rmsOf(residuals),
    maxErrorM: Math.max(...residuals),
  }
}

/** 보정점(배치도 px ↔ 측정 위경도)을 ENU 쌍으로 */
export function pairsFromCalibrationPoints(points: readonly CalibrationPoint[], g: DegScale): EnuPair[] {
  return points.map((p) => ({ px: p.px, enu: latLonToEnu({ lat: p.lat, lon: p.lon }, g) }))
}

// ───────────── 통합 변환기 ─────────────

export type GeoSource = 'osm-estimate' | 'device-calibration' | 'file-calibration'

export interface GeoTransform {
  source: GeoSource
  pxToEnu: Affine6
  metersPerPx: number
  /** 위치 변환 자체의 추정 오차(m) — 정확도 원 계산에 √(acc² + rms²) 로 사용 */
  rmsErrorM: number
  latLonToPx(ll: LatLon): Pt
  pxToLatLon(px: Pt): LatLon
}

export function makeGeoTransform(
  geo: GeoMeta,
  calibration: Calibration | null = null,
  calibrationSource: Exclude<GeoSource, 'osm-estimate'> = 'device-calibration',
): GeoTransform {
  const A: Affine6 = calibration ? calibration.pxToEnu : geo.pxToEnu
  const inv = invertAffine(A)
  const rms = calibration ? calibration.rmsErrorM : geo.rmsErrorM
  return {
    source: calibration ? calibrationSource : 'osm-estimate',
    pxToEnu: A,
    metersPerPx: Math.hypot(A[0], A[3]),
    rmsErrorM: rms,
    latLonToPx: (ll) => applyAffine(inv, latLonToEnu(ll, geo)),
    pxToLatLon: (px) => enuToLatLon(applyAffine(A, px), geo),
  }
}

/** 배치도 px 두 점 사이 실제 거리(m) */
export function pxDistanceM(a: Pt, b: Pt, metersPerPx: number): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) * metersPerPx
}
