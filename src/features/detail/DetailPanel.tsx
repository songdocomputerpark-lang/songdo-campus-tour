/**
 * features/detail/DetailPanel.tsx — 시설(방) 상세 패널 (SPEC §4.4, §0)
 *
 * 렌더 위치: ui/Shell.tsx 가 `roomId` 가 있을 때 데스크톱 SidePanel(420px) / 모바일 BottomSheet 안에 렌더한다.
 *   모바일 peek(≈10.5rem)에는 머리글 + 핵심 액션 줄([지도에서 보기] [‹] [›])이 들어오도록 액션을 사진보다 위에 둔다.
 *
 * 구성: 머리글(시설명 · 건물·층) → 액션 줄 → 사진(PhotoSlot: 갤러리/라이트박스 또는 플레이스홀더) → 칩(카테고리·개략도)
 *       → 소개(summary/description) → 주요 장비·특징 → 교육활동 → "도면 정보" 접힘 섹션 → 같은 층 다른 시설.
 * 데이터 정직성: 내용이 비면 가짜 문구 없이 "학교에서 소개 내용을 준비하고 있습니다." 류의 정중한 안내만 보여 준다.
 *   facilities.json 로딩 중에는 "준비 중" 대신 스켈레톤을 보여 깜빡임을 막는다.
 * roomId 없이 건물만 선택된 상태로 렌더되면 건물 상세(BuildingDetail)로 대체한다.
 */
import { ChevronDown, ChevronLeft, ChevronRight, Crosshair, FileText, MapPin, PenLine, TriangleAlert } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { campus, classroomSubtitle, floorLabel, getRoom, locationLabel } from '../../data'
import type { Building, Floor, Room } from '../../data/types'
import { tint } from '../../lib/color'
import { photosFor, useContent } from '../../lib/content'
import { boundsOf } from '../../lib/geometry'
import { CAT_KEEP } from '../../map/categoryTint'
import { getMapApi } from '../../map/mapBus'
import { useAppStore } from '../../store/useAppStore'
import { PanelHeader } from '../../ui/PanelHeader'
import { useIsDesktop } from '../../ui/useMedia'
import { BuildingDetail } from './BuildingDetail'
import { PhotoSlot } from './PhotoSlot'

/** Cormorant 는 기본이 올드스타일 숫자라 안내판 숫자에는 라이닝 숫자를 쓴다 */
const LINING = { fontVariantNumeric: 'lining-nums tabular-nums' } as const
const EMPTY_INTRO = '학교에서 소개 내용을 준비하고 있습니다.'

export function DetailPanel() {
  const roomId = useAppStore((s) => s.roomId)
  const buildingId = useAppStore((s) => s.buildingId)
  const ref = getRoom(roomId)
  if (!ref) return buildingId ? <BuildingDetail /> : null
  return <RoomDetail room={ref.room} floor={ref.floor} building={ref.building} />
}

// ───────────────────────────── 시설 상세 ─────────────────────────────

function RoomDetail({ room, floor, building }: { room: Room; floor: Floor; building: Building }) {
  const closePanel = useAppStore((s) => s.closePanel)
  const selectRoom = useAppStore((s) => s.selectRoom)
  const clearRoom = useAppStore((s) => s.clearRoom)
  const openPanel = useAppStore((s) => s.openPanel)
  const setPanelSnap = useAppStore((s) => s.setPanelSnap)
  const isDesktop = useIsDesktop()
  const ready = useContent((s) => s.status === 'ready')
  const facility = useContent((s) => s.facilities[room.id])
  const allPhotos = useContent((s) => s.photos)
  const pics = photosFor(allPhotos, room.id)
  const articleRef = useRef<HTMLElement>(null)

  // 다른 시설로 바뀌면 패널(스크롤 컨테이너) 맨 위로
  useLayoutEffect(() => {
    articleRef.current?.closest<HTMLElement>('.scroll-y, .sheet-scroll')?.scrollTo({ top: 0 })
  }, [room.id])

  const summary = facility?.summary.trim() ?? ''
  const description = facility?.description.trim() ?? ''
  const features = facility?.features ?? []
  const activities = facility?.activities ?? []
  const hasIntro = !!(summary || description)
  const allEmpty = !hasIntro && features.length === 0 && activities.length === 0

  const classroomLabel = classroomSubtitle(room)
  const rooms = floor.rooms
  const at = rooms.findIndex((r) => r.id === room.id)
  const prev = rooms.length > 1 ? rooms[(at - 1 + rooms.length) % rooms.length] : null
  const next = rooms.length > 1 ? rooms[(at + 1) % rooms.length] : null
  const others = rooms.filter((r) => r.id !== room.id)

  const zoomToRoom = () => {
    if (!isDesktop) setPanelSnap('peek') // 시트가 지도를 가리지 않도록
    window.setTimeout(
      () => {
        const api = getMapApi('floor')
        if (!api) return
        // 시설을 보이는 영역 한가운데로. 이미 더 확대돼 있으면 축소하지 않고, 작게 보이면 영역의 약 절반까지 확대한다.
        const rb = boundsOf(room.poly)
        const avail = api.availableRect()
        const fitK = Math.min((avail.w * 0.5) / Math.max(rb.w, 1), (avail.h * 0.55) / Math.max(rb.h, 1), 6)
        api.focus([rb.x + rb.w / 2, rb.y + rb.h / 2], { k: Math.max(api.getTransform().k, fitK) })
      },
      isDesktop ? 0 : 200,
    )
  }
  const showList = () => {
    clearRoom()
    openPanel('half')
  }

  return (
    <article ref={articleRef} aria-label={`${room.name} 상세 안내`}>
      <PanelHeader
        eyebrow={building.en}
        title={room.name}
        subtitle={
          <>
            <span className="inline-flex items-center gap-1">
              <MapPin size={13} strokeWidth={1.9} className="shrink-0 text-gold-deep" aria-hidden="true" />
              {locationLabel({ building, floor })}
            </span>
            {room.sub && (
              <>
                <span className="mx-1.5 text-line-strong" aria-hidden="true">
                  ·
                </span>
                {room.sub}
              </>
            )}
            {classroomLabel && <span className="mt-0.5 block text-ink-soft">{classroomLabel}</span>}
          </>
        }
        accent={building.color}
        onClose={closePanel}
        closeLabel="상세 닫기"
      />

      <div key={room.id} className="animate-fade-in px-5 pb-8">
        {/* 핵심 액션 — 모바일 peek 안에 들어오도록 사진보다 위 */}
        <div className="flex items-center gap-2" role="group" aria-label="시설 이동">
          <button type="button" onClick={zoomToRoom} className="btn btn-primary min-w-0 flex-1">
            <Crosshair size={17} strokeWidth={1.9} aria-hidden="true" />
            지도에서 보기
          </button>
          {prev && next && (
            <>
              <StepButton label={`이전 시설: ${prev.name}`} onClick={() => selectRoom(prev.id)}>
                <ChevronLeft size={19} aria-hidden="true" />
              </StepButton>
              <StepButton label={`다음 시설: ${next.name}`} onClick={() => selectRoom(next.id)}>
                <ChevronRight size={19} aria-hidden="true" />
              </StepButton>
            </>
          )}
        </div>

        <div className="mt-4">
          <PhotoSlot photos={pics} alt={`${building.name} ${floorLabel(floor.floor)} ${room.name}`} buildingId={building.id} roomId={room.id} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="chip">
            <span className="h-2.5 w-2.5 rounded-[3px] border border-ink/15" style={{ background: tint(building.color, CAT_KEEP[room.cat]) }} aria-hidden="true" />
            {campus.categories[room.cat]}
          </span>
          {floor.schematic && <Badge>개략도</Badge>}
        </div>

        {/* ── 소개 · 장비 · 활동 ── */}
        {!ready ? (
          <TextSkeleton />
        ) : allEmpty ? (
          <EmptyIntro />
        ) : (
          <>
            <section aria-label="시설 소개" className="mt-5">
              {hasIntro ? (
                <>
                  {summary && <p className="text-[1.0625rem] font-medium leading-relaxed text-ink [text-wrap:pretty]">{summary}</p>}
                  {description && <p className={`whitespace-pre-line text-[0.9375rem] leading-[1.75] text-ink-soft [text-wrap:pretty] ${summary ? 'mt-2.5' : ''}`}>{description}</p>}
                </>
              ) : (
                <p className="text-[0.875rem] leading-relaxed text-ink-mute">{EMPTY_INTRO}</p>
              )}
            </section>

            <section className="mt-6" aria-labelledby={`${room.id}-features`}>
              <SectionTitle id={`${room.id}-features`} en="Features" ko="주요 장비·특징" />
              {features.length > 0 ? (
                <ul className="divide-y divide-line/70 overflow-hidden rounded-card border border-line bg-surface/60">
                  {features.map((f, i) => (
                    <li key={i} className="flex gap-3 px-3.5 py-2.5 text-[0.9375rem] leading-snug text-ink">
                      <span className="mt-[0.5em] h-1.5 w-1.5 shrink-0 rotate-45 bg-gold" aria-hidden="true" />
                      <span className="min-w-0 [text-wrap:pretty]">{f}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[0.8125rem] text-ink-mute">주요 장비·특징 안내를 준비 중입니다.</p>
              )}
            </section>

            <section className="mt-6" aria-labelledby={`${room.id}-activities`}>
              <SectionTitle id={`${room.id}-activities`} en="Activities" ko="교육활동" />
              {activities.length > 0 ? (
                <ol className="grid gap-1.5">
                  {activities.map((a, i) => (
                    <li key={i} className="flex gap-3 rounded-card bg-leaf-soft/45 px-3.5 py-2.5 text-[0.9375rem] leading-snug text-ink">
                      <span className="mt-[0.05em] w-5 shrink-0 font-display text-[1.0625rem] font-semibold leading-snug text-navy-500" style={LINING} aria-hidden="true">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="min-w-0 [text-wrap:pretty]">{a}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-[0.8125rem] text-ink-mute">교육활동 안내를 준비 중입니다.</p>
              )}
            </section>
          </>
        )}

        <FloorInfo room={room} floor={floor} />

        {/* ── 같은 층 다른 시설 ── */}
        {others.length > 0 && (
          <section className="mt-7" aria-labelledby={`${room.id}-siblings`}>
            <SectionTitle
              id={`${room.id}-siblings`}
              en="Same Floor"
              ko={`${floorLabel(floor.floor)} 다른 시설`}
              trailing={
                <button type="button" onClick={showList} className="-mr-1 inline-flex min-h-[2.25rem] items-center rounded-full px-2.5 text-[0.75rem] font-semibold text-ink-mute transition-colors hover:bg-paper-2 hover:text-navy">
                  목록으로 보기
                </button>
              }
            />
            <ul className="grid grid-cols-2 gap-1.5">
              {others.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => selectRoom(r.id)}
                    className="group flex min-h-[2.75rem] w-full items-center gap-2 rounded-xl border border-line bg-surface/60 px-3 py-1.5 text-left text-[0.875rem] leading-snug text-ink transition-[border-color,background-color,box-shadow] duration-180 hover:border-navy/40 hover:bg-surface hover:shadow-soft"
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] border border-ink/15" style={{ background: tint(building.color, CAT_KEEP[r.cat]) }} aria-hidden="true" />
                    <span className="min-w-0 break-keep [overflow-wrap:anywhere] line-clamp-2">{r.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-6 text-[0.75rem] leading-relaxed text-ink-mute">시설 명칭과 위치는 학교 도면을 바탕으로 하며 실제와 일부 다를 수 있습니다.</p>
      </div>
    </article>
  )
}

// ───────────────────────────── 조각 컴포넌트 ─────────────────────────────

function StepButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="btn btn-ghost !min-h-[2.75rem] w-11 shrink-0 !px-0">
      {children}
    </button>
  )
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-full border border-gold/50 bg-gold-soft/60 px-2 py-0.5 text-[0.6875rem] font-semibold leading-snug text-gold-deep">{children}</span>
}

/** 영문 eyebrow + 한글 제목 (전시 안내판 느낌) */
function SectionTitle({ id, en, ko, trailing }: { id?: string; en: string; ko: string; trailing?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <h3 id={id} className="flex min-w-0 flex-1 items-baseline gap-2.5">
        <span className="eyebrow shrink-0 text-gold-deep">{en}</span>
        <span className="truncate text-[0.875rem] font-semibold text-ink">{ko}</span>
      </h3>
      {trailing}
    </div>
  )
}

function EmptyIntro() {
  return (
    <section aria-label="시설 소개" className="mt-5 flex gap-3.5 rounded-card border border-dashed border-line-strong bg-paper/60 p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold-soft/70 text-gold-deep" aria-hidden="true">
        <PenLine size={17} strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <p className="text-[0.9375rem] font-semibold text-ink">소개 준비 중</p>
        <p className="mt-0.5 text-[0.875rem] leading-relaxed text-ink-soft">{EMPTY_INTRO}</p>
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-mute">주요 장비·특징과 교육활동 안내도 함께 준비 중입니다.</p>
      </div>
    </section>
  )
}

function TextSkeleton() {
  return (
    <div className="mt-5 space-y-2.5" aria-hidden="true">
      <div className="h-4 w-11/12 animate-pulse rounded bg-paper-3/70" />
      <div className="h-4 w-4/5 animate-pulse rounded bg-paper-3/70" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-paper-3/70" />
    </div>
  )
}

// ───────────────────────────── 도면 정보 (접힘) ─────────────────────────────

function FloorInfo({ room, floor }: { room: Room; floor: Floor }) {
  const medium = room.conf === 'medium'
  const [open, setOpen] = useState(medium) // 검토가 필요한 시설은 note 가 바로 보이도록 펼쳐 둔다
  const uid = useId()
  const names = room.src.name2023
  const inert = open ? {} : ({ inert: '' } as Record<string, string>)

  return (
    <section className="mt-7 overflow-hidden rounded-card border border-line bg-surface/50" aria-label="도면 정보">
      <h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={`${uid}-body`}
          className="flex min-h-[3rem] w-full flex-wrap items-center gap-x-2 gap-y-1 px-3.5 py-2 text-left transition-colors hover:bg-paper/70"
        >
          <FileText size={16} strokeWidth={1.8} className="shrink-0 text-ink-mute" aria-hidden="true" />
          <span className="text-[0.875rem] font-semibold text-ink">도면 정보</span>
          {medium && <Badge>명칭 대응 검토 중</Badge>}
          {floor.schematic && <Badge>개략도</Badge>}
          <ChevronDown size={18} className={`ml-auto shrink-0 text-ink-mute transition-transform duration-280 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </h3>
      <div id={`${uid}-body`} className="grid transition-[grid-template-rows] duration-280 ease-out" style={{ gridTemplateRows: open ? '1fr' : '0fr' }} aria-hidden={!open} {...inert}>
        <div className="min-h-0 overflow-hidden">
          <dl className="grid gap-3.5 border-t border-line/80 px-3.5 pb-4 pt-3.5 text-[0.875rem]">
            <Row label="2023 평면도 명칭">
              {names.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {names.map((nm) => (
                    <li key={nm} className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-[0.8125rem] font-medium text-ink-soft">
                      {nm}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-ink-mute">대응하는 명칭 기록 없음</span>
              )}
            </Row>
            <Row label="도면 출처">
              <span className="text-ink-soft">{floor.source}</span>
            </Row>
            {floor.schematic && (
              <Row label="도면 유형">
                <span className="text-ink-soft">개략도 — 실제 형태와 크기는 다를 수 있습니다.</span>
              </Row>
            )}
            {medium && (
              <div className="flex gap-2.5 rounded-xl border border-gold/45 bg-gold-soft/45 p-3 text-gold-deep" role="note">
                <TriangleAlert size={16} strokeWidth={1.9} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-[0.8125rem] font-semibold">검토 메모</p>
                  <p className="mt-0.5 text-[0.8125rem] leading-relaxed [text-wrap:pretty]">{room.note || '2023 평면도 명칭과 2025 시설배치도 명칭의 대응을 확인하고 있습니다.'}</p>
                </div>
              </div>
            )}
          </dl>
        </div>
      </div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="text-[0.75rem] font-semibold text-ink-mute">{label}</dt>
      <dd className="m-0 min-w-0 leading-snug">{children}</dd>
    </div>
  )
}
