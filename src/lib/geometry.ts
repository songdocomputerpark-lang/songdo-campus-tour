// 기하 유틸: bounds, centroid, pointInPolygon, polygon path 등. (단위 무관 — 호출자 좌표계 그대로)
import type { Bounds, Pt } from '../data/types'

export function boundsOf(pts: readonly Pt[]): Bounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of pts) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  if (!isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function unionBounds(list: readonly Bounds[]): Bounds {
  if (list.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const b of list) {
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.w)
    maxY = Math.max(maxY, b.y + b.h)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function expandBounds(b: Bounds, left: number, top = left, right = left, bottom = top): Bounds {
  return { x: b.x - left, y: b.y - top, w: b.w + left + right, h: b.h + top + bottom }
}

export function boundsCenter(b: Bounds): Pt {
  return [b.x + b.w / 2, b.y + b.h / 2]
}

export function boundsFromViewBox(vb: readonly [number, number, number, number]): Bounds {
  return { x: vb[0], y: vb[1], w: vb[2], h: vb[3] }
}

/** 다각형 부호 있는 면적(+: CCW in y-up / CW in y-down) */
export function signedArea(poly: readonly Pt[]): number {
  let a = 0
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % n]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}
export function polygonArea(poly: readonly Pt[]): number {
  return Math.abs(signedArea(poly))
}

/** 면적 가중 무게중심 (퇴화 시 꼭짓점 평균) */
export function centroid(poly: readonly Pt[]): Pt {
  const a = signedArea(poly)
  if (Math.abs(a) < 1e-9) {
    if (poly.length === 0) return [0, 0]
    let sx = 0
    let sy = 0
    for (const [x, y] of poly) {
      sx += x
      sy += y
    }
    return [sx / poly.length, sy / poly.length]
  }
  let cx = 0
  let cy = 0
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % n]
    const f = x1 * y2 - x2 * y1
    cx += (x1 + x2) * f
    cy += (y1 + y2) * f
  }
  return [cx / (6 * a), cy / (6 * a)]
}

/** ray casting. 경계 위의 점은 구현상 불확정(허용). */
export function pointInPolygon(pt: Pt, poly: readonly Pt[]): boolean {
  const [x, y] = pt
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (hit) inside = !inside
  }
  return inside
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  let t = l2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** 점 → 다각형 외곽선까지 거리 (내부면 0) */
export function distToPolygon(p: Pt, poly: readonly Pt[]): number {
  if (pointInPolygon(p, poly)) return 0
  let best = Infinity
  for (let i = 0, n = poly.length; i < n; i++) {
    best = Math.min(best, distToSegment(p, poly[i], poly[(i + 1) % n]))
  }
  return best
}

/** SVG path 'd' 문자열 */
export function polygonPath(poly: readonly Pt[], close = true): string {
  if (poly.length === 0) return ''
  let d = ''
  for (let i = 0; i < poly.length; i++) {
    d += (i === 0 ? 'M' : 'L') + round(poly[i][0]) + ' ' + round(poly[i][1])
  }
  return close ? d + 'Z' : d
}

/** SVG polygon 'points' 문자열 */
export function polygonPoints(poly: readonly Pt[]): string {
  return poly.map(([x, y]) => `${round(x)},${round(y)}`).join(' ')
}

export function translatePoly(poly: readonly Pt[], dx: number, dy: number): Pt[] {
  return poly.map(([x, y]) => [x + dx, y + dy] as Pt)
}

/** 중심 c 기준 비례 축소/확대 */
export function scalePoly(poly: readonly Pt[], s: number, c: Pt = centroid(poly)): Pt[] {
  return poly.map(([x, y]) => [c[0] + (x - c[0]) * s, c[1] + (y - c[1]) * s] as Pt)
}

/** 다각형이 거의 직사각형(bbox 면적과 비슷)인지 */
export function isRectLike(poly: readonly Pt[], tol = 0.94): boolean {
  const b = boundsOf(poly)
  const bb = b.w * b.h
  return bb > 0 && polygonArea(poly) / bb >= tol
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

export function round(n: number, d = 2): number {
  const f = 10 ** d
  return Math.round(n * f) / f
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function degToRad(d: number): number {
  return (d * Math.PI) / 180
}

/** 볼록 껍질 (monotone chain) */
export function convexHull(points: readonly Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length <= 2) return pts
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: Pt[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Pt[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

/** 다각형을 d 만큼 안쪽으로 오프셋 (miter, 볼록/단순 다각형용). d<0 이면 바깥쪽 */
export function insetPolygon(poly: readonly Pt[], d: number): Pt[] {
  const n = poly.length
  if (n < 3) return [...poly]
  const sign = signedArea(poly) > 0 ? 1 : -1 // y 아래 좌표계에서 시각적 시계방향이면 +
  const normals: Pt[] = []
  for (let i = 0; i < n; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % n]
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.hypot(dx, dy) || 1
    // 바깥쪽 법선: area>0 → (dy,-dx)/len. 안쪽은 그 반대.
    normals.push([(-sign * dy) / len, (sign * dx) / len])
  }
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const n0 = normals[(i - 1 + n) % n]
    const n1 = normals[i]
    const k = 1 + n0[0] * n1[0] + n0[1] * n1[1]
    const f = d / Math.max(0.2, k)
    out.push([poly[i][0] + (n0[0] + n1[0]) * f, poly[i][1] + (n0[1] + n1[1]) * f])
  }
  return out
}
