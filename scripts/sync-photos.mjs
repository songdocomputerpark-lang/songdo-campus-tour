// 사진 동기화: public/photos/<시설ID>/ 의 이미지를 스캔해 public/content/photos.json 을 만든다. (SPEC §3)
//   - 시설 사진 폴더: public/photos/<roomId>/       예) public/photos/main-2f-c1-1/
//   - 건물 사진 폴더: public/photos/building-<id>/  예) public/photos/building-main/
//   - 지원 형식: jpg, jpeg, png, webp, avif
//   - 캡션(선택): 같은 폴더의 captions.json  →  { "파일명.jpg": "사진 설명" }
//   - 출력: { [id]: [{ src: "photos/<id>/<파일>", caption?: "..." }] }   (폴더가 없으면 {})
//   - public/photos/README.md (폴더 이름 안내 + 시설 ID 목록)도 함께 갱신한다.
// npm run photos 로 직접 실행하거나, dev/build 전에 자동 실행된다(predev, prebuild).
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PHOTOS_DIR = join(ROOT, 'public', 'photos')
const CONTENT_DIR = join(ROOT, 'public', 'content')
const OUT = join(CONTENT_DIR, 'photos.json')
const EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif'])
const BUILDINGS = {
  main: '본관동',
  new: '신관동',
  science: '과학관동',
  library: '도서관동',
  gym: '체육관동',
  dining: '급식관동',
  restroom: '화장실동',
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' })

function main() {
  const facilities = readJson(join(CONTENT_DIR, 'facilities.json'))?.facilities ?? {}
  const knownIds = new Set([...Object.keys(facilities), ...Object.keys(BUILDINGS).map((b) => `building-${b}`)])

  mkdirSync(PHOTOS_DIR, { recursive: true })
  mkdirSync(CONTENT_DIR, { recursive: true })

  const result = {}
  const unknown = []
  let total = 0

  for (const entry of readdirSync(PHOTOS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.startsWith('_')) continue
    const id = entry.name
    const dir = join(PHOTOS_DIR, id)
    const captions = readJson(join(dir, 'captions.json')) ?? {}
    const files = readdirSync(dir)
      .filter((f) => !f.startsWith('.') && EXT.has(extname(f).toLowerCase()) && statSync(join(dir, f)).isFile())
      .sort(collator.compare)
    if (files.length === 0) continue
    if (!knownIds.has(id)) unknown.push(id)
    result[id] = files.map((f) => {
      const caption = typeof captions[f] === 'string' ? captions[f].trim() : ''
      // URL 안전: 폴더/파일 이름의 공백·한글 등은 브라우저가 인코딩하므로 원본 이름을 그대로 둔다
      return caption ? { src: `photos/${id}/${f}`, caption } : { src: `photos/${id}/${f}` }
    })
    total += files.length
  }

  const sorted = Object.fromEntries(Object.entries(result).sort(([a], [b]) => collator.compare(a, b)))
  writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n', 'utf8')
  writeReadme(facilities)

  console.log(`[photos] ${Object.keys(sorted).length}개 폴더, 사진 ${total}장 → public/content/photos.json`)
  if (unknown.length) console.warn(`[photos] 경고: 알 수 없는 폴더 이름(시설 ID 확인 필요): ${unknown.join(', ')}`)
}

function writeReadme(facilities) {
  const byLocation = new Map()
  for (const [id, f] of Object.entries(facilities)) {
    const loc = f?.location || '기타'
    if (!byLocation.has(loc)) byLocation.set(loc, [])
    byLocation.get(loc).push([id, f?.name ?? ''])
  }
  const lines = []
  lines.push('# 사진 넣는 방법')
  lines.push('')
  lines.push('이 폴더(`public/photos/`)에 **시설 ID 이름의 폴더**를 만들고 사진을 넣으면, 해당 시설의 상세 안내와 추천 투어에 사진이 표시됩니다.')
  lines.push('')
  lines.push('## 규칙')
  lines.push('')
  lines.push('1. 폴더 이름은 아래 표의 **시설 ID** 와 정확히 같아야 합니다. 예) `public/photos/main-2f-c1-1/`')
  lines.push('2. 건물 전경 사진은 `building-<건물ID>` 폴더에 넣습니다. 예) `public/photos/building-main/`')
  lines.push('   건물 ID: ' + Object.entries(BUILDINGS).map(([id, n]) => `\`${id}\`(${n})`).join(', '))
  lines.push('3. 형식: `jpg` `jpeg` `png` `webp` `avif`. 파일 이름 순서(숫자 순)대로 표시됩니다 (`01.jpg`, `02.jpg` …).')
  lines.push('4. 권장 크기: 가로 1600px 이하, 파일당 300KB 안팎 (스마트폰에서 빠르게 열리도록).')
  lines.push('5. 사진 설명(선택): 같은 폴더에 `captions.json` 을 만들고 `{ "01.jpg": "사진 설명" }` 형식으로 적습니다.')
  lines.push('6. 터미널에서 `npm run photos` 를 실행하면 `public/content/photos.json` 이 갱신됩니다. `npm run dev` / `npm run build` 는 자동으로 실행합니다.')
  lines.push('7. 학생 얼굴이 식별되는 사진은 학교 개인정보 보호 지침과 초상권 동의를 확인한 뒤에만 사용하세요.')
  lines.push('')
  lines.push('## 시설 ID 목록')
  lines.push('')
  for (const [loc, items] of byLocation) {
    lines.push(`### ${loc}`)
    lines.push('')
    lines.push('| 시설 ID (폴더 이름) | 시설명 |')
    lines.push('| --- | --- |')
    for (const [id, name] of items) lines.push(`| \`${id}\` | ${name} |`)
    lines.push('')
  }
  writeFileSync(join(PHOTOS_DIR, 'README.md'), lines.join('\n'), 'utf8')
}

main()
