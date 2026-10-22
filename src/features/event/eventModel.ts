/**
 * features/event/eventModel.ts — 입학설명회 안내(#/event) 순수 함수 모음 (React·스토어 비의존, vitest 대상)
 *
 *  - 장소 번호: 별표 번호 1~N, 출발 지점은 0 (hash #/event/0 · Spot.no === null)
 *  - 건물별 묶음, 이전/다음 순서(출발 → ★1 → … → ★N), 범례 문구, 번호 범위 표기("5–8" · "3·4")
 *  - GPS 직선 안내: 방위각 · 8방위 한국어 · 문구 (경로가 아니라 직선 방향·거리)
 * 모든 이름·층은 spots.ts(= tour.json + floors.json) 에서 오며, 여기서 새로 만들어 내지 않는다.
 */
import { getBuilding } from '../../data'
import type { Building, BuildingId } from '../../data/types'
import type { Spot, SpotIndex } from '../tour/spots'

/** Spot → hash/스토어에서 쓰는 번호 (출발 = 0) */
export function spotNoOf(s: Pick<Spot, 'no'>): number {
  return s.no ?? 0
}

/** 번호(0 = 출발)로 장소 찾기. 없으면 null */
export function spotByNo(spots: SpotIndex, no: number | null | undefined): Spot | null {
  if (no === null || no === undefined) return null
  if (no === 0) return spots.start
  return spots.stars.find((s) => s.no === no) ?? null
}

/** 이전/다음 이동 순서: 출발(0) → ★1 → … → ★N. 끝에서는 null */
export function stepSpot(spots: SpotIndex, no: number | null, dir: 1 | -1): Spot | null {
  const cur = spotByNo(spots, no)
  if (!cur) return null
  const i = spots.list.findIndex((s) => s.roomId === cur.roomId)
  return spots.list[i + dir] ?? null
}

export interface SpotGroup {
  buildingId: BuildingId
  building: Building
  /** 투어 순서 */
  spots: Spot[]
}

/** ★ 장소를 건물별로 묶는다. 건물 순서 = 그 건물 첫 ★ 장소의 투어 순서. 출발 지점은 포함하지 않는다 */
export function groupStarsByBuilding(spots: SpotIndex): SpotGroup[] {
  const out: SpotGroup[] = []
  const seen = new Map<BuildingId, SpotGroup>()
  for (const s of spots.stars) {
    let g = seen.get(s.buildingId)
    if (!g) {
      const building = getBuilding(s.buildingId)
      if (!building) continue
      g = { buildingId: s.buildingId, building, spots: [] }
      seen.set(s.buildingId, g)
      out.push(g)
    }
    g.spots.push(s)
  }
  return out
}

/** 같은 건물의 다른 안내 장소(출발 포함, 자기 자신 제외) */
export function siblingsOf(spots: SpotIndex, spot: Spot): Spot[] {
  return (spots.byBuilding.get(spot.buildingId) ?? []).filter((s) => s.roomId !== spot.roomId)
}

/** 번호 목록 표기: [1] "1" · [3,4] "3·4" · [5,6,7,8] "5–8" · [1,3] "1·3" */
export function formatSpotNos(nos: readonly number[]): string {
  const a = [...new Set(nos)].sort((x, y) => x - y)
  if (a.length === 0) return ''
  if (a.length === 1) return String(a[0])
  const contiguous = a.every((n, i) => i === 0 || n === a[i - 1] + 1)
  if (contiguous && a.length >= 3) return `${a[0]}–${a[a.length - 1]}`
  return a.join('·')
}

/**
 * 머리글 범례. 출발 지점 안내문(tour.json)이 재학생 안내를 말하고 있을 때만 "재학생 안내 장소"라고 쓰고,
 * 아니면 "★ 표시 장소" 로만 쓴다 — 학교가 쓰지 않은 내용을 화면이 덧붙이지 않는다.
 */
export function eventLegend(startNote: string | null | undefined): string {
  return startNote && startNote.includes('재학생') ? '★ = 재학생 안내 장소' : '★ 표시 장소'
}

/** 도면상 시설명이 안내 이름과 다르면 그 시설명 (예: 급식실 → "학생식당"), 같으면 null */
export function officialName(s: Pick<Spot, 'label' | 'roomName'>): string | null {
  return s.roomName && s.roomName !== s.label ? s.roomName : null
}

// ───────────── GPS 직선 안내 ─────────────

const COMPASS_KO = ['북쪽', '북동쪽', '동쪽', '남동쪽', '남쪽', '남서쪽', '서쪽', '북서쪽'] as const

/** 진북 기준 방위각(도, 시계방향) → 8방위 한국어: 0 → "북쪽", 315 → "북서쪽" */
export function compassKo(bearingDeg: number): string {
  const d = ((bearingDeg % 360) + 360) % 360
  return COMPASS_KO[Math.round(d / 45) % 8]
}

export interface LatLonPt {
  lat: number
  lon: number
}

/** 두 위경도 사이 초기 방위각(진북 기준 시계방향, 0~360) */
export function bearingDeg(from: LatLonPt, to: LatLonPt): number {
  const rad = Math.PI / 180
  const dLon = (to.lon - from.lon) * rad
  const y = Math.sin(dLon) * Math.cos(to.lat * rad)
  const x = Math.cos(from.lat * rad) * Math.sin(to.lat * rad) - Math.sin(from.lat * rad) * Math.cos(to.lat * rad) * Math.cos(dLon)
  return ((Math.atan2(y, x) / rad) + 360) % 360
}

/** 직선거리 표기용 반올림: 100 m 미만은 5 m, 1 km 미만은 10 m, 그 이상은 0.1 km 단위 */
export function straightDistanceText(m: number): string {
  if (!Number.isFinite(m) || m < 0) return ''
  if (m < 100) return `약 ${Math.max(5, Math.round(m / 5) * 5)} m`
  if (Math.round(m / 10) * 10 < 1000) return `약 ${Math.round(m / 10) * 10} m`
  const km = m / 1000
  return `약 ${km < 10 ? km.toFixed(1) : Math.round(km)} km`
}

/** "현재 위치에서 직선 약 120 m · 북서쪽" */
export function straightLineText(distanceM: number, bearing: number): string {
  return `현재 위치에서 직선 ${straightDistanceText(distanceM)} · ${compassKo(bearing)}`
}

export const STRAIGHT_LINE_CAPTION = '직선 방향이며 실제 걷는 길과 다를 수 있어요'
