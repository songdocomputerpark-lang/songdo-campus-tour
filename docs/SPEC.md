# 송도고등학교 인터랙티브 스마트 캠퍼스 투어 — 구현 명세 (SPEC)

목적: 2026-10-31 입학설명회에서 학부모·중3 학생이 스마트폰/PC/대형 디스플레이로 사용하는 **프리미엄 캠퍼스 탐방 웹앱**.
목표 품질: 세계적 건축 전시관의 디지털 안내 시스템. 5초 안에 사용법을 이해. 흔한 학교 홈페이지/카드 목록 금지.

## 0. 절대 규칙 (데이터 정직성)
- 데이터는 이미 추출·검증되어 `src/data/*.json`, `public/content/*.json`에 있다. **좌표·명칭을 임의로 바꾸거나 시설·사진·교육활동·이동경로·거리를 지어내지 말 것.**
- 사진이 없으면 세련된 플레이스홀더. 소개 문구가 비면 "학교에서 소개 내용을 준비하고 있습니다." 류의 안내.
- `conf: "medium"` 시설은 상세 패널의 "도면 정보"에 "명칭 대응 검토 중" 배지와 `note`를 표시.
- `schematic: true` 층은 "개략도" 배지 표시.
- CCTV·보안 정보 없음(이미 제외됨). 외부 API·서버·추적 스크립트·외부 타일 금지. GPS 좌표는 기기 밖으로 절대 전송/저장하지 않음(보정 기능의 localStorage 저장만 예외, 관리자 전용).

## 1. 기술
- Vite + React 18 + TypeScript(strict) + Tailwind CSS v3.4. 상태: zustand. 라우팅 라이브러리 없이 **hash 동기화** (`#/`, `#/b/main`, `#/b/main/2F`, `#/b/main/2F/main-2f-c1-1`, `#/tour/3`, `#/calibrate`).
- 폰트 자체 호스팅: `pretendard`(npm, dynamic-subset CSS) + 영문 디스플레이 세리프 `@fontsource/cormorant-garamond`(400/500/600 + italic). 외부 CDN 금지.
- 지도: **순수 SVG + 자체 pan/zoom 훅**(포인터 이벤트, 핀치, 휠, 더블탭, 키보드, 관성 없음, rAF 애니메이션 `animateTo(bounds)`). 무거운 지도/3D 라이브러리 금지. 애니메이션은 CSS/rAF (framer-motion 금지).
- 정적 호스팅: `vite.config.ts`에 `base: './'`. `npm run build` → `dist/`가 어느 하위 경로에서도 동작.
- 코드 분할: 라이트박스·보정 화면은 `React.lazy`.

## 2. 데이터 계약 (`src/data/campus.json`, `src/data/floors.json` — 번들에 import)
```ts
type Pt = [number, number]
type BuildingId = 'main'|'new'|'science'|'library'|'gym'|'dining'|'restroom'
type FloorId = 'B1'|'1F'|'2F'|'3F'|'4F'
type CategoryId = 'classroom'|'learning'|'study'|'student'|'office'|'sports'|'dining'|'hall'|'amenity'|'support'
interface Building { id; code; name; en; color; poly: Pt[]; center: Pt; floors: FloorId[]; dims: string;
  planRotation: 0|-90; northDeg: number }            // northDeg: 층 평면도에서 '위'→진북 시계방향 각도
interface Room { id; name; sub: string|null; cat: CategoryId; poly: Pt[]; label: Pt; labelR: number /*라벨 원 반경*/;
  conf: 'high'|'medium'; note: string|null; src: { slide: number|null; ppt: number[]; name2023: string[] } }
interface Core { type: 'stairs'|'elevator'|'toilet'|'aed'|'kit'|'entrance'|'bridge'; poly?: Pt[]; at?: Pt; label?: string }
  // kit = 재난대응물품보관함, aed = 자동심장충격기, bridge = 연결통로(층 사이 다리)
interface Floor { building; floor; size: [w,h]; slab: Pt[] /*건물 외곽(복도 포함)*/; rooms: Room[]; cores: Core[];
  image: string|null /*public 상대경로, 원본 CAD 도면 레이어(투명 webp, size와 동일 좌표)*/; schematic: boolean; source: string }
campus.json = { meta:{title, sources[]}, categories: Record<CategoryId,string /*한글명*/>,
  site:{ viewBox:[x,y,w,h], boundary:Pt[], field:Pt[], road:Pt[], gates:{name,at}[], entrances:{building,name,at}[],
         labels:{text,at,rot?}[], north:number /*배치도 위→진북 시계방향 deg*/ },
  buildings: Building[], minor:{id,code,name,poly,center}[] /*문서고·온실·경비실: 회색 맥락 도형, 비대화형*/,
  geo:{ origin:{lat,lon}, metersPerDegLon, metersPerDegLat, pxToEnu:[a,b,c,d,e,f], metersPerPx, rmsErrorM, maxErrorM,
        controlPoints, status:'estimated', note, source } }
```
- 배치도 좌표계 = 2021 건물배치도(1:800) 픽셀, y 아래 방향. `E=a*x+b*y+c, N=d*x+e*y+f` (미터, origin 기준). ENU↔위경도: `E=(lon-lon0)*metersPerDegLon`, `N=(lat-lat0)*metersPerDegLat`. GPS→픽셀은 2×2 역행렬.
- 층 평면도는 각 층 `size` 좌표계(같은 건물의 층들은 대체로 정렬됨). 층 전환 시 같은 뷰 유지가 자연스러움.
- 층 순서: B1 < 1F < 2F < 3F < 4F. 층 표기: B1→"지하 1층", 1F→"1층".

## 3. 편집 가능한 런타임 콘텐츠 (`public/content/` — fetch, 실패 시 빈 값으로 동작)
- `facilities.json`: `{ facilities: { [roomId]: { name, location, summary, description, features[], activities[] } } }`
- `photos.json`: `npm run photos`(scripts/sync-photos.mjs)가 `public/photos/<roomId>/*.{jpg,jpeg,png,webp,avif}`를 스캔해 생성: `{ [roomId]: [{ src:"photos/<id>/<file>", caption? }] }`. 캡션은 같은 폴더의 `captions.json`(`{ "file.jpg": "설명" }`)이 있으면 반영. 건물 사진은 `public/photos/building-<id>/`.
  빌드 전 자동 실행(`prebuild`, `predev`). 폴더 없으면 빈 객체.
- `tour.json`: `{ title, stops:[{ facility: roomId, note }] }` — 추천 관람 **순서**(경로·거리 표시 금지).
- `geo-calibration.json`: `{ calibration: null | Calibration }` (보정 기능 참고).
- `public/brand/emblem.svg`: 학교 엠블럼(벡터). `public/plans/*.webp`: CAD 레이어.

## 4. 화면/기능
### 4.1 인트로 (첫 진입, 세션당 1회, 건너뛰기 가능, 2초 이내 상호작용 가능)
엠블럼 + `SONGDO HIGH SCHOOL`(넓은 자간 대문자) + `Explore Our Campus`(세리프 이탤릭) + `송도고를 걷다`(큰 한글) + `Since 1906`.
버튼 2개: **추천 투어 시작** / **자유롭게 둘러보기**. 배경에 캠퍼스 배치도 실루엣이 은은히 드러나는 연출.

### 4.2 캠퍼스 지도 (기본 화면)
- `site` 데이터로 SVG: 대지 경계(얇은 선), 운동장(field, 은은한 녹회색 + 미세 패턴), 도로(road), 맥락 건물(minor, 회색), 정문·주차장 출입구 마커, 라벨.
- 주요 건물: 건물 색상 상면 + 약간 아래로 오프셋한 어두운 측면으로 **2.5D 건축 모형 느낌**(그림자). hover/포커스 시 살짝 떠오름. 건물명 라벨(한글 + 작은 영문).
- 나침반(site.north 반영)과 축척 막대(metersPerPx 이용, 예 50 m).
- 건물 탭 → 해당 건물로 부드럽게 줌 + 건물 카드(이름, 층 목록, dims) → 층 선택 시 층 평면도로 전환.

### 4.3 층 평면도
- 슬랩(slab) = 밝은 바닥/복도 색, 은은한 외곽선. 방 = 건물 색조 기반, 카테고리별 명도 차이(학급교실 진함/행정 연함/부속 공간 매우 연함). 라벨은 `label` 위치에 자동 크기(공간 부족 시 축약/숨김, 줌인하면 표시).
- 코어: 계단(사선 해치 + 아이콘), 승강기·화장실·AED·재난물품 아이콘, 출입구 화살표, 연결통로(점선). 범례 토글.
- **도면 보기** 토글: `image`를 slab으로 clipPath 한 상태로 방 아래에 표시(반투명). 기본 OFF.
- 층 선택기: 데스크톱은 좌측 하단 세로 엘리베이터 버튼, 모바일은 우측 세로 칩. 층 전환 애니메이션(짧은 슬라이드/페이드).
- 방위 표시: building.northDeg 로 작은 N 화살표.
- 방 탭 → 선택 강조(외곽선 + 상승 그림자) + 상세 패널. 빈 곳 탭 → 선택 해제. 탭/드래그 구분(6px).
- 접근성: 방은 `<g role="button" tabIndex=0 aria-label="본관동 2층 1-1">`, Enter/Space 동작. "목록으로 보기"(현재 층 시설 리스트) 제공.

### 4.4 상세 패널 (데스크톱 우측 420px 슬라이드 / 모바일 하단 시트: peek·half·full 스냅, 드래그)
- 사진 갤러리(스와이프·화살표·점 인디케이터, 자동 넘김 옵션) → 탭 시 라이트박스(키보드 ←→ Esc, 핀치 줌). 사진 없으면 플레이스홀더(건물 색 그라디언트 + 건물 아웃라인 미니맵에서 방 위치 강조 + "사진 준비 중").
- 시설명, 위치(건물 · 층), 카테고리 칩, summary/description, **주요 장비·특징**(features), **교육활동**(activities). 비어 있으면 정중한 준비 중 안내(가짜 내용 금지).
- "도면 정보" 접힘 섹션: 2023 평면도 명칭(name2023), 출처(source), conf=medium 배지+note.
- 버튼: 지도에서 보기(줌), 같은 층 다른 시설 이동.

### 4.5 검색
- 상단 검색(⌘K/ / 단축키). 시설명·2023 명칭·건물명·층·카테고리, **한글 초성 검색**(ㄷㅅㄱ→도서관), 공백 무시. 결과는 건물별 그룹, 키보드 탐색. 선택 시 해당 건물/층/방으로 이동.

### 4.6 추천 투어
- tour.json 순서. 상단/하단 진행 바(n/N, 단계 점), 현재 시설 카드(사진·note·요약), 이전/다음, **자동 진행** 토글(12초, 사진은 4초 자동 넘김, 사용자 조작 시 일시정지), "투어 종료 → 자유 탐색". 단계 변경 시 지도 자동 이동(건물→층→방 강조). aria-live로 단계 안내.

### 4.7 GPS 내 위치
- "내 위치" 버튼 → 첫 사용 시 안내 시트(목적, "위치는 이 기기 안에서만 사용, 서버 전송·저장 없음", 정확도 한계: 실내 층은 직접 선택) → 동의 시 `watchPosition({enableHighAccuracy:true, maximumAge:5000, timeout:20000})`.
- 캠퍼스 지도에 현재 위치: 펄스 점 + 정확도 원(반경 = √(acc² + rmsErrorM²) / metersPerPx), 방향(heading 있으면) 표시. 라벨 "추정 위치 ±N m".
- 정확도 > 50 m → 마커 대신 "정확도가 낮습니다 — 실외에서 잠시 기다려 주세요" 상태. 캠퍼스에서 300 m 이상 떨어짐 → "학교 밖에 계십니다 · 약 X km" 표시, 마커 숨김.
- "내 위치로 이동" / "추적 중지". 권한 거부/미지원/시간 초과 → 친절한 토스트 + 자유 탐색 유지. HTTPS가 아니면(localhost 제외) 안내.
- 층 평면도 화면에서는 "가장 가까운 건물: ○○동" 칩(실외 위치 기반, 건물 폴리곤 포함/최근접) → 탭하면 그 건물로. 실내 층 자동 인식은 하지 않는다고 명시.
- 확장 구조: `src/features/gps/positioning.ts`에 `PositionProvider` 인터페이스(`subscribe(cb)`), 기본 구현 GeolocationProvider. 향후 실내 측위(BLE 등) 공급자 추가 가능하도록.

### 4.8 위치 보정 (관리자, `#/calibrate`, About에서 링크)
- 캠퍼스 지도에서 서 있는 지점을 정확히 탭 → "현재 위치 기록"(10초 평균, 정확도 표시) → 점 목록.
- 1점: 평행이동 보정, 2점 이상: 2D 닮음변환(Procrustes) 최소제곱 적합, 각 점 잔차(m) 표시.
- "이 기기에 적용"(localStorage) / "JSON 내보내기"(복사·다운로드 → `public/content/geo-calibration.json`의 `calibration`에 붙여넣기) / "초기화".
- 적용 우선순위: localStorage > geo-calibration.json > campus.json 기본(OSM 추정). Calibration = `{ pxToEnu:[6], rmsErrorM, points:[{px:Pt, lat, lon, acc}], createdAt }`.
- About에 현재 위치 기준 상태 표시: "OSM 공개지도 대조 추정(RMS 약 4 m)" / "현장 보정 적용".

### 4.9 About/정보 모달
자료 출처(campus.meta.sources), "2025 시설배치도 명칭 + 2023 층별평면도 좌표 기반, 실제와 일부 다를 수 있음", GPS 개인정보 안내, OpenStreetMap ODbL 표기, 관리자 보정 링크, 콘텐츠 편집 방법 요약.

## 5. 레이아웃
- 데스크톱(≥1024): 지도 전체 화면. 좌상단 브랜드(엠블럼+송도고등학교+Explore Our Campus). 상단 중앙 검색. 브레드크럼(캠퍼스 › 본관동 › 2층). 우측 상세 패널. 하단 중앙 툴바 [전체 지도] [추천 투어] [내 위치] [정보]. 지도 조작 버튼(+/−/맞춤) 우하단.
- 모바일(<1024, 우선 설계): 상단 얇은 바(엠블럼, 브레드크럼, 검색 아이콘), 하단 툴바(안전영역 고려 `env(safe-area-inset-bottom)`), 하단 시트. 터치 타깃 ≥44px. 가로 스크롤 금지.
- 대형 디스플레이(≥1920): `clamp()`로 타이포·UI 스케일 업.

## 6. 디자인 시스템
- 콘셉트: 120년 역사(1906) × 미래지향. 건축 전시 그래픽: 따뜻한 종이색 캔버스, 정밀한 얇은 선, 넓은 여백, 절제된 색.
- 토큰(Tailwind theme + CSS 변수): navy `#0b1f4b`(엠블럼 #001a4b 계열), ink `#111827`, paper `#f5f2ea`, paper-2 `#ece7db`, line `#d8d2c4`, gold `#b8902f`(엠블럼 #ffc40b 절제), leaf `#3a9950`.
  건물 색상은 campus.json의 `color`(2025 배치도 색 체계와 일치 — 학부모가 인쇄물과 대조 가능). 카테고리 명도는 color-mix/HSL로 산출.
- 타이포: 한글 Pretendard(본문 400/500, 제목 600–700, 숫자 tabular), 영문 디스플레이 Cormorant Garamond. 영문 대문자 라벨은 tracking 0.2em+.
- 그림자/라운드: 패널 radius 20–24px, 은은한 다층 그림자, 반투명 블러 표면(backdrop-filter, 미지원 시 불투명 대체).
- 모션: 180–420ms ease-out, `prefers-reduced-motion` 존중. 장식용 과도한 애니메이션 금지.
- 아이콘: 인라인 SVG 컴포넌트(외부 아이콘 폰트 금지). lucide-react 사용 가능(트리셰이킹).
- 대비 WCAG AA, 포커스 링 명확, `lang="ko"`, 의미있는 제목 구조.

## 7. 파일 구조 (소유권 — 병렬 작업 시 자기 파일만 수정)
```
src/
  main.tsx, App.tsx, index.css
  data/campus.json, floors.json, types.ts, index.ts(접근 헬퍼: getBuilding, getFloor, getRoom, roomsIndex, floorLabel)
  store/useAppStore.ts        (view/building/floor/room/tour/gps/panel/search/ui 상태 + 액션, hash 동기화)
  lib/geometry.ts(bounds, centroid, pointInPolygon, polygon path), lib/geo.ts(ENU/latlon/px 변환, fitSimilarity), lib/hangul.ts(초성), lib/content.ts(fetch facilities/photos/tour/calibration)
  map/usePanZoom.ts, map/MapViewport.tsx, map/CampusMap.tsx, map/FloorPlan.tsx, map/FloorSelector.tsx, map/Compass.tsx, map/ScaleBar.tsx, map/icons.tsx
  ui/Shell.tsx(반응형 레이아웃), ui/BottomSheet.tsx, ui/SidePanel.tsx, ui/Toolbar.tsx, ui/Breadcrumb.tsx, ui/Toast.tsx, ui/Intro.tsx, ui/Brand.tsx
  features/detail/DetailPanel.tsx, Gallery.tsx, Lightbox.tsx, PhotoPlaceholder.tsx
  features/search/SearchBox.tsx, searchIndex.ts
  features/tour/TourBar.tsx, useTour.ts
  features/gps/positioning.ts, useGeolocation.ts, GpsLayer.tsx(CampusMap 안에 렌더), GpsControls.tsx, ConsentSheet.tsx, Calibrate.tsx
  features/about/AboutModal.tsx
scripts/sync-photos.mjs
tests/*.test.ts (vitest: geo 변환·fitSimilarity·초성·hash 파싱·데이터 무결성)
```

## 8. 완료 기준
- `npm run build` 무경고 성공, `npx tsc --noEmit` 통과, `npx vitest run` 통과.
- 26개 층·139개 시설 모두 탐색·선택 가능, 검색·투어·GPS(거부/허용/정확도 낮음/학교 밖)·보정·사진 없음 상태 모두 오류 없이 동작.
- 모바일 375×812, 태블릿 768×1024, 데스크톱 1440×900, 대형 2560×1440에서 레이아웃 깨짐 없음.
- 초기 JS gzip ≤ 200 KB 목표.
