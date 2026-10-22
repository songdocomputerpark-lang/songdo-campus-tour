// 런타임 콘텐츠 로더: public/content/{facilities,photos,tour,geo-calibration}.json 을 fetch + 캐시.
// 실패(404·파싱 오류·오프라인)해도 빈 값으로 동작한다 (SPEC §3). 외부 서버 없음 — 같은 출처의 정적 파일만.
import { create } from 'zustand'
import type { Calibration, FacilityMap, PhotoItem, PhotoMap, Tour, TourEvent } from '../data/types'

/** public/ 기준 상대경로 → 현재 배포 위치 기준 URL (base './' 이므로 어느 하위 경로에서도 동작) */
export function assetUrl(path: string): string {
  const clean = path.replace(/^\.?\//, '')
  const base = import.meta.env.BASE_URL || './'
  return base.replace(/\/?$/, '/') + clean
}

export type ContentStatus = 'idle' | 'loading' | 'ready'

export interface ContentState {
  status: ContentStatus
  facilities: FacilityMap
  photos: PhotoMap
  tour: Tour
  /** public/content/geo-calibration.json 의 calibration (없으면 null) */
  calibration: Calibration | null
  load: () => Promise<void>
}

const EMPTY_TOUR: Tour = { title: '추천 캠퍼스 투어', stops: [] }

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(assetUrl(path), { cache: 'no-cache' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

let inflight: Promise<void> | null = null

/** zustand 스토어: `useContent(s => s.facilities[roomId])` 처럼 구독. 로드는 앱 시작 시 1회(load) */
export const useContent = create<ContentState>((set, get) => ({
  status: 'idle',
  facilities: {},
  photos: {},
  tour: EMPTY_TOUR,
  calibration: null,
  load: () => {
    if (get().status === 'ready') return Promise.resolve()
    if (inflight) return inflight
    set({ status: 'loading' })
    inflight = (async () => {
      const [fac, photos, tour, cal] = await Promise.all([
        getJson<{ facilities?: FacilityMap }>('content/facilities.json'),
        getJson<PhotoMap>('content/photos.json'),
        getJson<Partial<Tour>>('content/tour.json'),
        getJson<{ calibration?: Calibration | null }>('content/geo-calibration.json'),
      ])
      set({
        status: 'ready',
        facilities: sanitizeFacilities(fac?.facilities),
        photos: sanitizePhotos(photos),
        tour: sanitizeTour(tour),
        calibration: isCalibration(cal?.calibration) ? cal!.calibration! : null,
      })
    })().finally(() => {
      inflight = null
    })
    return inflight
  },
}))

export function loadContent(): Promise<void> {
  return useContent.getState().load()
}

// ───────────── sanitize: 편집 중 JSON 이 조금 틀려도 앱이 죽지 않도록 ─────────────

function sanitizeFacilities(raw: FacilityMap | undefined): FacilityMap {
  const out: FacilityMap = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [id, f] of Object.entries(raw)) {
    if (!f || typeof f !== 'object') continue
    out[id] = {
      name: str(f.name),
      location: str(f.location),
      summary: str(f.summary),
      description: str(f.description),
      features: strList(f.features),
      activities: strList(f.activities),
    }
  }
  return out
}

function sanitizePhotos(raw: PhotoMap | null): PhotoMap {
  const out: PhotoMap = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [id, list] of Object.entries(raw)) {
    if (id.startsWith('_') || !Array.isArray(list)) continue
    const items: PhotoItem[] = list
      .filter((p): p is PhotoItem => !!p && typeof p.src === 'string' && p.src.length > 0)
      .map((p) => (typeof p.caption === 'string' && p.caption ? { src: p.src, caption: p.caption } : { src: p.src }))
    if (items.length) out[id] = items
  }
  return out
}

export const DEFAULT_EVENT_TITLE = '입학설명회 안내'

/** tour.json 의 event 머리말. 없거나 형식이 틀리면 undefined, 일부만 있으면 빈 칸은 ''(제목은 기본 문구) */
export function parseEvent(raw: unknown): TourEvent | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const e = raw as Record<string, unknown>
  const rawTitle = str(e.title).trim()
  const date = str(e.date).trim()
  const subtitle = str(e.subtitle).trim()
  if (!rawTitle && !date && !subtitle) return undefined
  return { title: rawTitle || DEFAULT_EVENT_TITLE, date, subtitle }
}

/** tour.json → Tour. stops 가 없으면 빈 투어. 알 수 없는 키(_안내 등)와 잘못된 지점은 무시한다 */
export function sanitizeTour(raw: Partial<Tour> | null): Tour {
  if (!raw || !Array.isArray(raw.stops)) return EMPTY_TOUR
  const event = parseEvent(raw.event)
  return {
    title: str(raw.title) || EMPTY_TOUR.title,
    ...(event ? { event } : {}),
    stops: raw.stops
      .filter((s) => s && typeof s.facility === 'string')
      .map((s) => {
        const label = str(s.label).trim()
        const howto = strList(s.howto).map((h) => h.trim())
        return {
          facility: s.facility,
          note: str(s.note),
          ...(label ? { label } : {}),
          ...(s.start === true ? { start: true } : {}),
          ...(howto.length ? { howto } : {}),
        }
      }),
  }
}

function isCalibration(c: unknown): c is Calibration {
  const x = c as Calibration | null | undefined
  return !!x && Array.isArray(x.pxToEnu) && x.pxToEnu.length === 6 && x.pxToEnu.every((n) => typeof n === 'number' && isFinite(n))
}
export { isCalibration }

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : [])

// ───────────── 편의 헬퍼 ─────────────

/** 시설 사진 목록 (건물 사진은 id = `building-<buildingId>`) */
export function photosFor(photos: PhotoMap, id: string | null | undefined): PhotoItem[] {
  return (id && photos[id]) || []
}
