import { describe, expect, it } from 'vitest'
import { campus } from '../src/data'
import type { Affine6, Pt } from '../src/data/types'
import {
  applyAffine,
  enuToLatLon,
  enuToPx,
  fitSimilarity,
  fitTranslation,
  haversine,
  invertAffine,
  latLonToEnu,
  latLonToPx,
  makeGeoTransform,
  pxToEnu,
  pxToLatLon,
  residualsOf,
  type EnuPair,
} from '../src/lib/geo'

const A = campus.geo.pxToEnu

describe('geo 변환', () => {
  it('px ↔ ENU 왕복', () => {
    for (const p of [[0, 0], [1000, 900], [2040, 1700], [150, 80]] as Pt[]) {
      const back = enuToPx(pxToEnu(p, A), A)
      expect(back[0]).toBeCloseTo(p[0], 6)
      expect(back[1]).toBeCloseTo(p[1], 6)
    }
  })

  it('ENU ↔ 위경도 왕복', () => {
    const enu: Pt = [123.4, -56.7]
    const ll = enuToLatLon(enu, campus.geo)
    const back = latLonToEnu(ll, campus.geo)
    expect(back[0]).toBeCloseTo(enu[0], 6)
    expect(back[1]).toBeCloseTo(enu[1], 6)
  })

  it('px ↔ 위경도 왕복, 학교 위치(인천 송도)에 있다', () => {
    const px: Pt = [1000, 900]
    const ll = pxToLatLon(px, campus.geo, A)
    expect(ll.lat).toBeGreaterThan(37.4)
    expect(ll.lat).toBeLessThan(37.5)
    expect(ll.lon).toBeGreaterThan(126.6)
    expect(ll.lon).toBeLessThan(126.7)
    const back = latLonToPx(ll, campus.geo, A)
    expect(back[0]).toBeCloseTo(px[0], 4)
    expect(back[1]).toBeCloseTo(px[1], 4)
  })

  it('invertAffine · 특이 행렬은 오류', () => {
    const inv = invertAffine(A)
    const p: Pt = [321, 654]
    const q = applyAffine(inv, applyAffine(A, p))
    expect(q[0]).toBeCloseTo(p[0], 6)
    expect(q[1]).toBeCloseTo(p[1], 6)
    expect(() => invertAffine([1, 2, 0, 2, 4, 0])).toThrow()
  })

  it('metersPerPx 메타와 변환 행렬이 일치한다', () => {
    const t = makeGeoTransform(campus.geo)
    expect(t.metersPerPx).toBeCloseTo(campus.geo.metersPerPx, 6)
    expect(t.source).toBe('osm-estimate')
    expect(t.rmsErrorM).toBeCloseTo(campus.geo.rmsErrorM, 6)
  })
})

describe('haversine', () => {
  it('같은 점 = 0, 위도 1° ≈ 111.2 km', () => {
    expect(haversine({ lat: 37.4, lon: 126.6 }, { lat: 37.4, lon: 126.6 })).toBe(0)
    const d = haversine({ lat: 37, lon: 126 }, { lat: 38, lon: 126 })
    expect(d).toBeGreaterThan(111000)
    expect(d).toBeLessThan(111500)
  })
  it('배치도 두 점의 haversine ≈ px 거리 × metersPerPx (소규모에서 1% 이내)', () => {
    const a: Pt = [500, 500]
    const b: Pt = [1500, 1300]
    const d = haversine(pxToLatLon(a, campus.geo, A), pxToLatLon(b, campus.geo, A))
    const expected = Math.hypot(b[0] - a[0], b[1] - a[1]) * campus.geo.metersPerPx
    expect(Math.abs(d - expected) / expected).toBeLessThan(0.01)
  })
})

/** 알려진 닮음변환(회전 θ, 배율 s, 이동 t, y 반전 포함)으로 합성한 쌍 */
function synth(theta: number, s: number, tE: number, tN: number, pts: Pt[]): { pairs: EnuPair[]; truth: Affine6 } {
  const a = s * Math.cos(theta)
  const b = s * Math.sin(theta)
  const truth: Affine6 = [a, b, tE, b, -a, tN]
  return { truth, pairs: pts.map((px) => ({ px, enu: applyAffine(truth, px) })) }
}

describe('fitSimilarity (최소제곱 2D 닮음변환)', () => {
  const pts: Pt[] = [
    [200, 300],
    [1800, 400],
    [900, 1500],
    [1500, 1200],
    [400, 900],
  ]

  it('정확한 점이면 변환을 복원하고 잔차 ≈ 0', () => {
    const { pairs, truth } = synth(0.31, 0.12, -140, 135, pts)
    const fit = fitSimilarity(pairs)!
    expect(fit).not.toBeNull()
    truth.forEach((v, i) => expect(fit.pxToEnu[i]).toBeCloseTo(v, 6))
    expect(fit.scale).toBeCloseTo(0.12, 8)
    expect(fit.rotation).toBeCloseTo(0.31, 8)
    expect(fit.rmsErrorM).toBeLessThan(1e-6)
    expect(fit.residuals).toHaveLength(pts.length)
  })

  it('2점만으로도 적합(정확 복원)', () => {
    const { pairs, truth } = synth(-1.2, 0.2, 10, -20, [pts[0], pts[1]])
    const fit = fitSimilarity(pairs)!
    truth.forEach((v, i) => expect(fit.pxToEnu[i]).toBeCloseTo(v, 6))
  })

  it('잡음이 있으면 RMS > 0 이고 잔차가 변환 오차를 반영', () => {
    const { pairs } = synth(0.1, 0.12, 0, 0, pts)
    const noisy = pairs.map((p, i) => ({ px: p.px, enu: [p.enu[0] + (i % 2 ? 1.5 : -1.5), p.enu[1] + (i % 3 ? 0.8 : -0.8)] as Pt }))
    const fit = fitSimilarity(noisy)!
    expect(fit.rmsErrorM).toBeGreaterThan(0.3)
    expect(fit.rmsErrorM).toBeLessThan(3)
    expect(fit.maxErrorM).toBeGreaterThanOrEqual(fit.rmsErrorM)
    expect(residualsOf(fit.pxToEnu, noisy)).toEqual(fit.residuals)
  })

  it('점이 1개이거나 모두 같은 위치면 null', () => {
    expect(fitSimilarity([{ px: [1, 1], enu: [0, 0] }])).toBeNull()
    expect(
      fitSimilarity([
        { px: [5, 5], enu: [0, 0] },
        { px: [5, 5], enu: [1, 1] },
      ]),
    ).toBeNull()
  })
})

describe('fitTranslation (1점 보정)', () => {
  it('선형부는 유지하고 평행이동만 맞춘다', () => {
    const px: Pt = [1000, 800]
    const target: Pt = [pxToEnu(px, A)[0] + 7, pxToEnu(px, A)[1] - 4]
    const fit = fitTranslation(A, [{ px, enu: target }])!
    expect([fit.pxToEnu[0], fit.pxToEnu[1], fit.pxToEnu[3], fit.pxToEnu[4]]).toEqual([A[0], A[1], A[3], A[4]])
    expect(fit.pxToEnu[2]).toBeCloseTo(A[2] + 7, 8)
    expect(fit.pxToEnu[5]).toBeCloseTo(A[5] - 4, 8)
    expect(fit.rmsErrorM).toBeLessThan(1e-9)
  })
})
