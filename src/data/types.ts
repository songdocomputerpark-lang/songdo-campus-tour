// 데이터 계약 (docs/SPEC.md §2, §3). campus.json / floors.json / public/content/*.json 의 타입.
// 이 파일의 타입은 데이터와 1:1 이며, 데이터 파일은 수정하지 않는다.

export type Pt = [number, number]
export type Affine6 = [number, number, number, number, number, number]

export type BuildingId = 'main' | 'new' | 'science' | 'library' | 'gym' | 'dining' | 'restroom'
export type FloorId = 'B1' | '1F' | '2F' | '3F' | '4F'
export type CategoryId =
  | 'classroom'
  | 'learning'
  | 'study'
  | 'student'
  | 'office'
  | 'sports'
  | 'dining'
  | 'hall'
  | 'amenity'
  | 'support'

export interface Building {
  id: BuildingId
  code: string
  name: string
  en: string
  color: string
  poly: Pt[]
  center: Pt
  floors: FloorId[]
  dims: string
  planRotation: 0 | -90
  /** 층 평면도에서 '위' → 진북 시계방향 각도 */
  northDeg: number
}

export interface RoomSrc {
  slide: number | null
  ppt: number[]
  name2023: string[]
}

export interface Room {
  id: string
  name: string
  sub: string | null
  cat: CategoryId
  poly: Pt[]
  label: Pt
  /** 라벨 원 반경 (floor px) */
  labelR: number
  conf: 'high' | 'medium'
  note: string | null
  src: RoomSrc
}

export type CoreType = 'stairs' | 'elevator' | 'toilet' | 'aed' | 'kit' | 'entrance' | 'bridge'

export interface Core {
  type: CoreType
  poly?: Pt[]
  at?: Pt
  label?: string
}

export interface Floor {
  building: BuildingId
  floor: FloorId
  size: [number, number]
  /** 건물 외곽(복도 포함) */
  slab: Pt[]
  rooms: Room[]
  cores: Core[]
  /** public 상대경로 (원본 CAD 도면 레이어, 투명 webp, size와 동일 좌표) */
  image: string | null
  schematic: boolean
  source: string
}

export interface MinorBuilding {
  id: string
  code: string
  name: string
  poly: Pt[]
  center: Pt
}

export interface Site {
  viewBox: [number, number, number, number]
  boundary: Pt[]
  field: Pt[]
  road: Pt[]
  gates: { name: string; at: Pt }[]
  entrances: { building: BuildingId; name: string; at: Pt }[]
  labels: { text: string; at: Pt; rot?: number }[]
  /** 배치도 위 → 진북 시계방향 deg */
  north: number
}

export interface GeoMeta {
  source: string
  origin: { lat: number; lon: number }
  metersPerDegLon: number
  metersPerDegLat: number
  /** E=a*x+b*y+c, N=d*x+e*y+f (미터, origin 기준) */
  pxToEnu: Affine6
  metersPerPx: number
  planRotationDeg?: number
  rmsErrorM: number
  maxErrorM: number
  controlType?: string
  controlPoints?: number
  status: 'estimated'
  note: string
}

export interface CampusData {
  meta: { title: string; sources: string[] }
  categories: Record<CategoryId, string>
  site: Site
  buildings: Building[]
  minor: MinorBuilding[]
  geo: GeoMeta
}

// ───────────────────────── 런타임 콘텐츠 (public/content) ─────────────────────────

export interface Facility {
  name: string
  location: string
  summary: string
  description: string
  features: string[]
  activities: string[]
}
export type FacilityMap = Record<string, Facility>

export interface PhotoItem {
  /** public 상대경로: "photos/<id>/<file>" (lib/content.ts 의 assetUrl() 로 해석) */
  src: string
  caption?: string
}
export type PhotoMap = Record<string, PhotoItem[]>

export interface TourStop {
  /** roomId */
  facility: string
  note: string
  /** 안내판·지도 별표에 쓸 이름 (예: 학생식당 → "급식실"). 없으면 시설명 */
  label?: string
  /** 출발 지점 — 별표 번호 없이 "출발"로 표시 */
  start?: boolean
  /** 찾아가는 방법 — 짧은 단계 문장 목록(입학설명회 안내 화면의 "찾아가는 방법"). 없으면 생략 */
  howto?: string[]
}
/** 입학설명회 안내 화면 머리말 (tour.json 의 event) */
export interface TourEvent {
  title: string
  /** 예: "2026. 10. 31.(토)" — 비어 있으면 날짜 배지를 숨긴다 */
  date: string
  subtitle: string
}
export interface Tour {
  title: string
  /** 없으면(구버전 tour.json) 화면은 기본 문구를 쓴다 */
  event?: TourEvent
  stops: TourStop[]
}

// ───────────── 입학설명회 식순 (public/content/program.json) ─────────────

/** reception = 접수 · talk = 설명·발표 · quiz = 퀴즈 이벤트 · tour = 연수·투어 · end = 종료 */
export type ProgramKind = 'reception' | 'talk' | 'quiz' | 'tour' | 'end'
export interface ProgramInfo {
  label: string
  value: string
  /** 있으면 이 시설(roomId)이 있는 건물을 지도에서 보여 주는 버튼이 된다 (예: 장소 → gym-4f-p91) */
  facility?: string
}
export interface ProgramRow {
  /** 24시간제 "HH:MM" */
  start: string
  end?: string
  /** 순서 배지 글자: 개회 · 1부 · BREAK · 종료 … */
  badge: string
  /** 시간표 막대 안에 쓰는 짧은 이름 ("3부 · 대입 전형 설명회"). 없으면 badge */
  short?: string
  kind: ProgramKind
  title: string
  desc?: string
  /** 번호 칩(①②③)으로 보여 줄 세부 순서 */
  items?: string[]
  /** 'spots' = "투어 장소 보기" 버튼 (학교 투어 장소 탭으로) */
  action?: 'spots'
}
export interface ProgramNote {
  strong: string
  text: string
}
export interface ProgramContact {
  title: string
  phones: string[]
  org: string
}
export interface Program {
  title: string
  eyebrow: string
  lead: string
  anniversary: string
  dateText: string
  info: ProgramInfo[]
  /** 시작 시각 순 */
  program: ProgramRow[]
  notes: ProgramNote[]
  contact: ProgramContact | null
}

export interface CalibrationPoint {
  px: Pt
  lat: number
  lon: number
  acc: number
}
export interface Calibration {
  pxToEnu: Affine6
  rmsErrorM: number
  points: CalibrationPoint[]
  createdAt: string
}

// ───────────────────────── 공용 ─────────────────────────

export interface RoomRef {
  room: Room
  floor: Floor
  building: Building
}

export interface Bounds {
  x: number
  y: number
  w: number
  h: number
}
export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}
