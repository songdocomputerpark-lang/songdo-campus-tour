# 송도고를 걷다 — 인터랙티브 스마트 캠퍼스 투어

송도고등학교(Since 1906)의 입학설명회용 **캠퍼스 탐방 웹앱**입니다. 학부모와 예비 신입생이 스마트폰·PC·대형 디스플레이에서 캠퍼스 배치도와 층별 평면도를 직접 둘러보고, 입학설명회 학교 투어 장소 안내와 추천 투어, 시설 검색을 사용할 수 있습니다.

- 서버·데이터베이스·외부 API·외부 지도 타일·추적 스크립트가 **없는 정적 웹앱**입니다. 위치(GPS) 정보도 쓰지 않습니다. `dist/` 폴더만 올리면 동작합니다.
- 글꼴(Pretendard, Cormorant Garamond)도 모두 번들에 포함되어 외부 CDN을 쓰지 않습니다.
- 기술 구성: Vite · React 18 · TypeScript(strict) · Tailwind CSS 3.4 · zustand. 지도는 순수 SVG와 자체 pan/zoom 구현입니다.
- 구현 명세 원본은 [`docs/SPEC.md`](docs/SPEC.md) 입니다.

---

## 1. 실행 방법

필요한 것: **Node.js 20.19 이상 또는 22.12 이상**(개발·검증은 Node 24, npm 11)

```bash
npm install          # 처음 한 번 — 패키지 설치
npm run dev          # 개발 서버 (기본 http://localhost:5173)
npm run build        # 배포용 빌드 → dist/
npm run preview      # 빌드 결과를 로컬에서 미리보기
npm test             # 단위 테스트(vitest)
npx tsc --noEmit     # 타입 검사만
```

- `npm run dev` 와 `npm run build` 는 실행 전에 `npm run photos` 를 자동으로 실행해 `public/content/photos.json` 을 갱신합니다.
- 개발 서버를 휴대폰으로 확인하려면 `npm run dev -- --host` 로 실행하고 같은 Wi-Fi 의 `http://<PC의 IP>:5173` 으로 접속합니다.

### 배포 (dist)

1. `npm run build` 를 실행합니다.
2. 생성된 **`dist/` 폴더의 내용 전체**를 정적 웹 호스팅(학교 웹서버, GitHub Pages, Netlify, Cloudflare Pages, S3 등)에 올립니다.
3. 주소 방식은 `#/…`(hash) 이므로 별도의 서버 설정(SPA 리다이렉트)이 필요 없고, `base: './'` 설정으로 **어느 하위 경로(예: `https://school.kr/tour/`)에 올려도** 동작합니다.
4. 가능하면 HTTPS 로 제공하세요(GitHub Pages 는 기본이 HTTPS).
5. 입학설명회 안내문 QR 코드에는 아래 주소를 쓰면 편리합니다.

| 주소 | 열리는 화면 |
| --- | --- |
| `https://…/` | 인트로 → 캠퍼스 전체 지도 |
| `https://…/#/event` | **입학설명회 안내** — ★ 장소 전체 안내 (인트로 생략) |
| `https://…/#/event/5` | 입학설명회 안내: ★5 장소 상세 (`0` = 출발 지점) |
| `https://…/#/tour/1` | 추천 투어 1번째 지점부터 (인트로 생략) |
| `https://…/#/b/main` | 본관동 건물 안내 |
| `https://…/#/b/main/2F` | 본관동 2층 평면도 |
| `https://…/#/b/main/2F/main-2f-c1-1` | 특정 시설(방) 상세 |

예전 주소 `#/event/program`·`#/event/spots`(식순·투어 장소 탭)는 `#/event` 로, `#/calibrate`(위치 보정)는 첫 화면으로 열립니다.

건물 ID: `main`(본관동) · `new`(신관동) · `science`(과학관동) · `library`(도서관동) · `gym`(체육관동) · `dining`(급식관동) · `restroom`(화장실동)

### 유용한 조작

| 조작 | 동작 |
| --- | --- |
| `/` 또는 `Ctrl/⌘ + K` | 검색 열기 (한글 초성 검색 지원: `ㄷㅅㄱ` → 도서관) |
| `Esc` | 한 단계 뒤로 (선택 해제 → 건물 → 전체 지도 / 투어 중에는 투어 종료) |
| `+` `-` `0`, 방향키 | 지도 확대·축소·맞춤·이동 (지도에 포커스가 있을 때) |
| `←` `→` | 투어·입학설명회 안내의 이전·다음 지점, 사진 넘기기 |
| `Esc` (입학설명회 안내) | 장소 상세 → 전체 안내 |

---

## 2. 콘텐츠 편집 (코드 수정 없이)

학교가 직접 고치는 내용은 모두 **`public/content/`** 폴더의 JSON 파일입니다. 파일을 고친 뒤 다시 `npm run build` 하여 `dist/` 를 올리면 반영됩니다. (개발 서버 실행 중에는 새로고침만 하면 됩니다.)

> JSON 은 따옴표·쉼표에 민감합니다. 편집 후 [jsonlint.com](https://jsonlint.com) 같은 검사기나 VS Code 에서 오류가 없는지 확인하세요. 파일을 읽지 못하면 앱은 해당 내용을 "준비 중"으로 표시하고 계속 동작합니다.

### 2-1. 시설 소개 — `public/content/facilities.json`

시설(방) ID 를 키로, 시설마다 아래 필드를 가집니다. **현재 모든 시설의 소개 내용은 비어 있으며**, 비어 있는 항목은 앱에서 "학교에서 소개 내용을 준비하고 있습니다."로 표시됩니다. 내용을 채운 항목만 화면에 나타납니다.

```json
{
  "facilities": {
    "main-2f-c1-1": {
      "name": "1-1",
      "location": "본관동 2층",
      "summary": "한두 문장의 짧은 소개 (목록·투어 카드에 표시)",
      "description": "자세한 설명 (상세 패널에 표시)",
      "features": ["주요 장비·특징 1", "주요 장비·특징 2"],
      "activities": ["교육활동 1", "교육활동 2"]
    }
  }
}
```

- `name`, `location` 은 도면 데이터(`src/data/floors.json`)와 일치해야 합니다. **바꾸지 마세요.** (테스트가 검사합니다)
- `summary`(요약), `description`(설명), `features`(주요 장비·특징 목록), `activities`(교육활동 목록)를 채웁니다.
- 시설 ID 목록은 [`public/photos/README.md`](public/photos/README.md) 의 표에서 찾을 수 있습니다.
- **없는 시설·활동·수치를 만들어 넣지 마세요.** 확인된 사실만 적습니다.

### 2-2. 추천 투어 — `public/content/tour.json`

```json
{
  "title": "추천 캠퍼스 투어",
  "stops": [
    { "facility": "main-1f-lobby", "note": "본관동 1층 중앙 현관입니다." },
    { "facility": "main-2f-c1-1", "note": "이 지점에서 보여 줄 짧은 안내 문구" }
  ]
}
```

- `stops` 의 **배열 순서가 곧 관람 순서**입니다. 지점을 추가·삭제·순서 변경할 수 있습니다.
- **같은 `stops` 가 입학설명회 안내(`#/event`, 안내문 QR 화면)의 ★ 장소·번호 목록입니다.** 지점을 추가·삭제하거나 순서를 바꾸면 ★ 번호도 함께 바뀝니다(2-3 참고). 위 예시는 줄인 것이며, 실제 파일에는 `event`·`start`·`label`·`howto` 도 함께 있습니다.
- `facility` 는 실제 시설 ID 여야 하고, `note` 는 그 지점의 짧은 안내입니다.
- 투어는 "순서"만 안내하며 **이동 경로·거리·소요 시간은 표시하지 않습니다**(정확한 실측 자료가 없기 때문입니다).

### 2-3. 입학설명회 안내 (`#/event`)

2026. 10. 31.(토) 입학설명회에서 **처음 오신 학부모님이 지도만 보고 장소를 찾아가도록** 만든 화면입니다. 인트로의 첫 번째 버튼 "입학설명회 안내"와 하단 툴바의 "설명회 안내"(★)로 열리며, 안내문 QR 에는 `https://…/#/event` 를 쓰면 됩니다.

- **지도**: 안내 장소가 있는 건물만 금빛으로 강조하고 나머지는 흐리게 합니다. 건물마다 말풍선 카드("★n 장소명 nF", 출발은 깃발 + "출발")가 붙고, 좁은 화면·축소 상태에서는 "★5–8 도서관동" 같은 작은 배지로 접힙니다. 본관 현관·도서관동 출입구는 화살표로 표시합니다.
- **패널**: 날짜 · 제목 → 부제 → 출발 카드(체육관) → ★ 장소(건물별) → "순서대로 따라가기". 장소를 누르면 위치(건물·층), 층 구성 도해, "찾아가는 방법", 같은 건물의 다른 장소, "평면도에서 보기", 이전/다음이 나옵니다.
- 식순(행사 시간표)은 사이트에 싣지 않습니다. 식순은 인쇄용 '학부모용 식순 안내'로만 안내합니다(2026-10-28 삭제).
- **편집은 `public/content/tour.json`(★ 장소)** 입니다. 코드를 고칠 필요가 없습니다.

```json
{
  "event": { "title": "입학설명회 안내", "date": "2026. 10. 31.(토)", "subtitle": "지도에 ★로 표시된 곳을 찾아가 보세요" },
  "stops": [
    { "facility": "gym-4f-p91", "start": true, "label": "체육관", "note": "체육관에서 출발합니다. …",
      "howto": ["캠퍼스 동쪽, 주차장 출입구 옆에 있는 건물이 체육관동입니다.", "체육관은 체육관동 4층에 있습니다."] },
    { "facility": "dining-3f-p115", "label": "급식실", "note": "…", "howto": ["…", "…"] }
  ]
}
```

  | 항목 | 설명 |
  | --- | --- |
  | `event.title` · `date` · `subtitle` | 패널 머리글과 인트로 버튼의 날짜 배지. 없으면 제목은 "입학설명회 안내", 날짜 배지·부제는 생략됩니다. |
  | `stops` 의 순서 | **★ 번호가 정해지는 순서**입니다(`start: true` 는 번호 없이 "출발"). 순서를 바꾸면 지도·목록 번호가 모두 따라 바뀝니다. |
  | `label` | 지도 카드·목록에 보일 이름 (예: 학생식당 → "급식실"). 도면상 시설명이 다르면 상세에 "도면상 명칭"으로 함께 적힙니다. |
  | `note` | 장소 상세 머리글 아래 한두 문장. 출발 지점의 `note` 가 "재학생" 안내를 말하면 범례가 "★ = 재학생 안내 장소", 아니면 "★ 표시 장소"가 됩니다. |
  | `howto` | "찾아가는 방법" — **짧은 문장 한 줄이 한 단계**입니다. 도면(배치도·평면도)으로 확인되는 사실만 적으세요. 없으면 그 섹션은 생략됩니다. |

  `facility` 는 실제 시설 ID 여야 합니다(`public/photos/README.md` 표). 이동 경로·거리·소요 시간은 쓰지 마세요 — 도면에 없는 정보입니다. 시설 사진은 3장의 방법으로 넣으면 장소 상세에 자동으로 나타나고, 없으면 사진 칸 없이 간결하게 표시됩니다.
  말풍선 카드가 건물 어느 쪽에 놓일지는 `src/map/eventLayout.ts` 의 `CARD_SIDE`(건물별 기본 방향)에서 바꿉니다.

### 2-4. 도면에 대한 표시 규칙

- 명칭 대응이 불확실한 시설(`conf: "medium"`)은 상세 패널의 "도면 정보"에 **"명칭 대응 검토 중"** 배지와 메모가 표시됩니다.
- 개략도(`schematic: true`) 층에는 **"개략도"** 배지가 표시됩니다.
- 이 정보는 `src/data/` 의 데이터에서 오며, 임의로 수정하지 않습니다.

---

## 3. 사진 추가 방법

사진은 `public/photos/` 아래에 **시설 ID 이름의 폴더**를 만들어 넣습니다. 사진이 없는 시설은 건물 색 그라디언트와 위치 미니맵이 있는 "사진 준비 중" 화면이 표시됩니다.

```
public/photos/
  main-2f-c1-1/          ← 시설 ID (정확히 같은 이름)
    01.jpg
    02.jpg
    captions.json        ← 선택: 사진 설명
  building-main/         ← 건물 전경 사진은 building-<건물ID>
    01.jpg
```

1. 폴더 이름은 시설 ID 와 **정확히** 같아야 합니다. (ID 표: `public/photos/README.md`)
2. 지원 형식: `jpg` `jpeg` `png` `webp` `avif`. 파일 이름 순서(숫자 순)대로 표시됩니다.
3. 권장 크기: 가로 1600px 이하, 파일당 300KB 안팎 (스마트폰에서 빠르게 열리도록).
4. 사진 설명(선택): 같은 폴더의 `captions.json` 에 `{ "01.jpg": "도서관 열람실 전경" }` 형식으로 적습니다.
5. 터미널에서 **`npm run photos`** 를 실행합니다. `public/content/photos.json` 이 다시 만들어집니다. (`npm run dev`·`npm run build` 는 자동 실행)
   - 알 수 없는 폴더 이름이 있으면 경고가 출력됩니다. 시설 ID 철자를 확인하세요.
6. 학생 얼굴이 식별되는 사진은 학교 개인정보 보호 지침과 초상권 동의를 확인한 뒤에만 사용하세요.

사진은 시설 상세 패널·건물 안내·추천 투어에 갤러리(스와이프, 화살표, 점 표시)로 나타나고, 탭하면 확대 보기(키보드 `←` `→` `Esc`, 핀치 확대)가 열립니다.

---

## 4. 위치 정보와 개인정보

- 이 사이트는 **위치(GPS) 정보를 쓰지 않습니다.** 위치 권한을 묻지 않으며, 개인정보를 수집·저장하지 않습니다.
- '내 위치' 표시와 관리자용 위치 보정(`#/calibrate`)은 2026-10-28 에 삭제했습니다(필요하면 git 기록에서 되살릴 수 있습니다).

---

## 5. 데이터 출처와 한계

| 자료 | 용도 |
| --- | --- |
| `학교배치도_2025.pdf` (2025 교내 시설배치도) | 시설 명칭·층 구성 기준 |
| `★학교배치도 및 층별평면도(2023).pptx` | 건물 배치도(1:800)와 층별 평면도 좌표 기준 |
| OpenStreetMap 건물 윤곽 (© OpenStreetMap contributors, ODbL) | 지도 방위·축척 대조 기준 |

한계와 주의:

- **2025 시설배치도의 명칭 + 2023 층별평면도의 좌표**를 합친 것이라 **실제와 일부 다를 수 있습니다.** 명칭 대응이 불확실한 시설은 "명칭 대응 검토 중"으로 표시합니다.
- 일부 층은 CAD 도면이 없어 **개략도**입니다(평면도 위에 "개략도" 배지 표시). 정확한 치수는 아닙니다.
- 시설 소개·교육활동·사진은 **학교가 채워 넣기 전까지 비어 있습니다.** 앱은 비어 있는 곳에 가짜 내용을 넣지 않습니다.
- CCTV·보안 관련 정보는 포함하지 않았습니다.
- 지도 배경 타일은 쓰지 않고 배치도 데이터로 직접 그립니다. OpenStreetMap 은 방위·축척 대조에만 사용했습니다(ODbL 출처 표기).

---

## 6. 폴더 구조

```
campus-tour/
  index.html, vite.config.ts, tailwind.config.js, tsconfig.json
  docs/SPEC.md                 구현 명세(단일 기준 문서)
  scripts/sync-photos.mjs      public/photos → public/content/photos.json 생성 (npm run photos)
  public/
    content/                   ★ 편집 가능한 콘텐츠
      facilities.json            시설 소개
      tour.json                  추천 투어 순서 · 입학설명회 안내(★ 장소·머리말·찾아가는 방법)
      photos.json                사진 목록 (npm run photos 가 자동 생성)
    photos/                    ★ 사진 (시설ID/ , building-건물ID/)
    plans/                     층별 CAD 도면 레이어 (webp)
    brand/emblem.svg           학교 엠블럼
  src/
    data/                      읽기 전용 도면 데이터: campus.json(배치도·건물·방위·축척), floors.json(26개 층·139개 시설), types.ts, index.ts(조회 헬퍼)
    store/                     useAppStore.ts(전체 상태·내비게이션), hash.ts(주소 hash 파싱·생성)
    lib/                       geometry · hangul(초성) · content(콘텐츠 로더) · color · env
    map/                       SVG 지도: usePanZoom, MapViewport, CampusMap, FloorPlan, FloorSelector, Compass, ScaleBar, Legend, icons …
    ui/                        Shell(반응형 레이아웃), BottomSheet, SidePanel, Toolbar, Breadcrumb, Intro, Toast, FloorList, useDialog …
    features/
      detail/                  시설·건물 상세, 갤러리, 라이트박스, 사진 플레이스홀더
      search/                  검색 UI와 검색 색인(초성·공백 무시)
      tour/                    추천 투어 UI와 진행 로직, 안내 장소(★) 색인(spots.ts)
      event/                   입학설명회 안내 패널(EventPanel: 학교 투어 장소), 층 구성 도해(FloorStack), 순수 함수(eventModel)
      about/                   정보(About) 창 — 현재 하단 메뉴에서 뺀 상태(코드만 유지)
  tests/                       vitest: 도형·이름표 배치·안내 카드 배치·초성·hash·스토어·데이터 무결성
```

### 개발 메모

- 데이터 무결성 테스트(`tests/data.test.ts`)는 26개 층 · 139개 시설 · id 유일성, 모든 방 좌표가 층 크기 안에 있는지, `facilities.json`·`tour.json` 의 모든 키가 `floors.json` 에 존재하는지를 검사합니다. 데이터 파일(`src/data/*.json`)을 고치면 `npm test` 로 확인하세요.
- 라이트박스는 `React.lazy` 로 분리되어 있고, 처음 화면의 JS 는 약 130 KB(gzip) 입니다.
- 모션은 CSS/rAF 만 사용하며 `prefers-reduced-motion` 을 존중합니다. 사진 자동 넘김은 그 설정에서 꺼지고, 투어 자동 진행은 기본이 꺼짐이며 사용자가 직접 켜야 합니다.
