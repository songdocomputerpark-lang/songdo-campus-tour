/**
 * features/event/ProgramTab.tsx — '설명회 안내' > 식순 탭 (#/event · #/event/program)
 *
 *  히어로 카드(흰색→하늘색 그라데이션 + 금빛 광채, 학교 안내문의 머리와 같은 인상) → 한눈에 보는 시간표(막대) → 식순 목록 → 참석 안내 → 행사 문의
 *  · 모든 글자(제목·시간·이름·전화번호)는 public/content/program.json 에서 온다 — 화면이 지어내지 않는다.
 *  · 날짜·시각에 따라 달라지는 표시는 없다 (진행 중 표시 없음) — 어느 날 열어도 같은 화면.
 *  · ProgramView 는 props 만으로 그려지는 순수 표시 컴포넌트다 (스토어·지도 비의존 → 서버 렌더로 테스트).
 *  접근성: 식순은 의미 있는 목록(<ol>), 시간은 <time>, 막대는 요약 라벨이 있는 이미지, 전화는 tel: 링크.
 */
import { MapPin, Phone } from 'lucide-react'
import type { Program, ProgramKind, ProgramRow } from '../../data/types'
import { buildTimeline, circled, durationMin, formatDuration, splitHighlight, telHref, type Timeline, type Venue } from './programModel'

/**
 * 시간표 막대 구간 색 — 밝고 화사한 톤. 설명·발표 = 파랑 계열, 퀴즈 이벤트 = 금색, 연수·투어 = 초록 계열.
 * 글자색은 구간 색마다 AA(≥ 4.5)가 되도록 고른다:
 *   #5b8def·#7aa6f5·#ffc83d·#3fbf86·#7fd6ab 위 = 남색 / #3f6fd6 위 = 흰색
 */
const SEGMENT_CLASS: Record<ProgramKind, string[]> = {
  talk: ['bg-[#5b8def] text-navy', 'bg-[#7aa6f5] text-navy', 'bg-[#3f6fd6] text-white'],
  quiz: ['bg-[#ffc83d] text-navy'],
  tour: ['bg-[#3fbf86] text-navy', 'bg-[#7fd6ab] text-navy'],
  reception: ['bg-paper-2 text-ink'],
  end: ['bg-paper-2 text-ink'],
}
/** 식순 줄의 부 배지: 연한 틴트 배경 + 같은 계열의 진한 글자 (알약) */
const BADGE_CLASS: Record<ProgramKind, string> = {
  talk: 'border border-sky-200 bg-primary-soft text-primary-hover',
  quiz: 'border border-gold-200 bg-gold-50 text-gold-deep',
  tour: 'border border-mint-200 bg-mint-50 text-mint-ink',
  reception: 'border border-line bg-paper-2 text-ink-soft',
  end: 'border border-line bg-paper-2 text-ink-soft',
}
const LEGEND: { kind: ProgramKind; label: string; dot: string }[] = [
  { kind: 'talk', label: '설명·발표', dot: 'bg-[#5b8def]' },
  { kind: 'quiz', label: '퀴즈 이벤트', dot: 'bg-[#ffc83d]' },
  { kind: 'tour', label: '연수·투어', dot: 'bg-[#3fbf86]' },
]
/** 히어로 정보 타일 색(차례로 하늘 · 금 · 민트) — 라벨 글자는 각 틴트 위 AA */
const TILE_CLASS = ['border-sky-200 bg-sky-50', 'border-gold-200 bg-gold-50', 'border-mint-200 bg-mint-50']
const TILE_LABEL_CLASS = ['text-primary-hover', 'text-gold-deep', 'text-mint-ink']

export interface ProgramViewProps {
  program: Program
  /** 장소 줄이 가리키는 건물 (없으면 장소 줄은 글자만) */
  venue: Venue | null
  /** 5부 줄의 "투어 장소 보기 →" — 학교 투어 장소 탭으로 */
  onShowSpots: () => void
  /** 장소 줄 — 지도에서 설명회 장소(체육관동)로 이동 */
  onShowVenue: () => void
}

export function ProgramView({ program, venue, onShowSpots, onShowVenue }: ProgramViewProps) {
  const timeline = buildTimeline(program)
  return (
    <div className="grid grid-cols-1 gap-6">
      <Hero program={program} venue={venue} onShowVenue={onShowVenue} />
      {timeline && <TimelineBar timeline={timeline} />}
      <section aria-labelledby="ev-list-h">
        <SectionTitle id="ev-list-h" eyebrow="Program" title="식순" />
        <ol role="list" className="grid gap-2">
          {program.program.map((row, i) => (
            <li key={`${row.start}-${i}`}>
              <ProgramRowCard row={row} onShowSpots={onShowSpots} />
            </li>
          ))}
        </ol>
      </section>
      {program.notes.length > 0 && (
        <section aria-labelledby="ev-notes-h">
          <SectionTitle id="ev-notes-h" eyebrow="Notice" title="참석 안내" />
          <ul role="list" className="grid gap-2 rounded-card border border-line bg-white px-4 py-3.5 shadow-soft">
            {program.notes.map((n, i) => (
              <li key={i} className="flex gap-2.5 text-[0.9375rem] leading-relaxed text-ink-soft [text-wrap:pretty]">
                <span className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden="true" />
                <span className="min-w-0">
                  {n.strong && <strong className="font-bold text-ink">{n.strong}</strong>}
                  {n.text}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {program.contact && <ContactCard contact={program.contact} />}
    </div>
  )
}

function SectionTitle({ id, eyebrow, title }: { id: string; eyebrow: string; title: string }) {
  return (
    <h3 id={id} className="mb-2.5 flex items-baseline gap-2.5">
      <span className="eyebrow text-gold-deep">{eyebrow}</span>
      <span className="text-[0.9375rem] font-bold text-ink">{title}</span>
    </h3>
  )
}

// ───────────── 히어로 ─────────────

function Hero({ program, venue, onShowVenue }: { program: Program; venue: Venue | null; onShowVenue: () => void }) {
  const [before, mark, after] = splitHighlight(program.title, '입학설명회')
  // 정보 칸이 홀수면 첫 칸(일시)을 두 칸 폭으로 — 긴 날짜가 한 줄에 들어가고 나머지는 나란히
  const wideFirst = program.info.length % 2 === 1
  return (
    <section aria-labelledby="ev-prog-title" className="relative overflow-hidden rounded-card border border-sky-200 bg-gradient-to-br from-white via-white to-sky-50 p-5 shadow-soft">
      <span className="pointer-events-none absolute -right-12 -top-14 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgb(var(--star)/0.34),transparent_68%)]" aria-hidden="true" />
      <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-star to-transparent" aria-hidden="true" />
      <div className="relative">
        {program.eyebrow && <p className="eyebrow !text-[0.6875rem] text-gold-deep">{program.eyebrow}</p>}
        <h3 id="ev-prog-title" className="mt-1.5 text-[1.5rem] font-extrabold leading-[1.18] tracking-[-0.035em] text-navy [text-wrap:balance]">
          {before}
          {mark && (
            // 노란 형광펜 띠 위의 진한 금색 글자
            <span className="-mx-0.5 rounded-[3px] bg-[linear-gradient(to_top,rgb(255_222_110/0.85)_0_46%,transparent_46%)] px-0.5 text-gold-deep [box-decoration-break:clone]">{mark}</span>
          )}
          {after}
        </h3>
        {program.lead && <p className="mt-2 text-[0.9375rem] leading-snug text-ink-soft [text-wrap:pretty]">{program.lead}</p>}
        {program.anniversary && (
          <p className="mt-3 flex items-center gap-2.5 text-gold-deep">
            <span className="h-px w-7 bg-gold/60" aria-hidden="true" />
            <span className="font-display text-[0.9375rem] font-medium tracking-[0.12em]">{program.anniversary}</span>
          </p>
        )}
        {program.info.length > 0 && (
          <dl className="mt-4 grid grid-cols-2 gap-2">
            {program.info.map((it, i) => {
              const isVenue = !!venue && !!it.facility && it.facility === venue.roomId
              const tone = i % TILE_CLASS.length
              return (
                <div
                  key={i}
                  className={`relative min-w-0 rounded-xl border px-3 py-2 ${TILE_CLASS[tone]} ${wideFirst && i === 0 ? 'col-span-2' : ''} ${
                    isVenue ? 'transition-colors hover:bg-white/70 has-[:focus-visible]:bg-white/70' : ''
                  }`}
                >
                  <dt className={`text-[0.6875rem] font-bold tracking-wide ${TILE_LABEL_CLASS[tone]}`}>{it.label}</dt>
                  <dd className="mt-0.5 min-h-[1.5rem]">
                    {isVenue ? (
                      // 버튼의 눌림 영역은 타일 전체로 넓힌다(::after) — 터치 타깃 ≥ 44px
                      <button
                        type="button"
                        onClick={onShowVenue}
                        aria-label={`${it.value}, 지도에서 ${venue.buildingName} 보기`}
                        className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-left after:absolute after:inset-0 after:rounded-xl after:content-['']"
                      >
                        <span className="min-w-0 text-[0.9375rem] font-bold text-navy">{it.value}</span>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-star px-2 py-0.5 text-[0.75rem] font-bold text-navy shadow-soft">
                          <MapPin size={13} strokeWidth={2.2} aria-hidden="true" />
                          지도에서 보기
                        </span>
                      </button>
                    ) : (
                      <span className="block text-[0.9375rem] font-bold text-navy tnum">{it.value}</span>
                    )}
                  </dd>
                </div>
              )
            })}
          </dl>
        )}
      </div>
    </section>
  )
}

// ───────────── 시간표 막대 ─────────────

function TimelineBar({ timeline }: { timeline: Timeline }) {
  const present = new Set(timeline.segments.map((g) => g.kind))
  const summary = `시간표: ${timeline.segments.map((g) => `${g.row.badge || g.row.title} ${g.row.start}에서 ${g.row.end}`).join(', ')}`
  const last = timeline.segments.length - 1
  return (
    <section aria-labelledby="ev-timeline-h">
      <SectionTitle id="ev-timeline-h" eyebrow="Timetable" title="한눈에 보는 시간표" />
      <div className="rounded-card border border-line bg-white px-3 pb-3 pt-3.5 shadow-soft">
        {/* 막대는 자기 안에서 좌우로 밀어 본다 — 폭이 좁은 화면에서도 페이지가 옆으로 밀리지 않는다 */}
        <div className="-mx-1 overflow-x-auto px-1 pb-1" tabIndex={-1} style={{ scrollbarWidth: 'thin' }} data-timeline-scroll="">
          <div className="min-w-[35rem]" role="img" aria-label={summary}>
            <div className="relative h-14 overflow-hidden rounded-xl">
              {timeline.segments.map((g, i) => {
                const list = SEGMENT_CLASS[g.kind]
                return (
                  <div
                    key={g.index}
                    className={`absolute inset-y-0 flex flex-col items-center justify-center px-0.5 text-center ${list[g.shade % list.length]}`}
                    style={{ left: `${g.leftPct}%`, width: `${g.widthPct}%`, boxShadow: i < last ? 'inset -2px 0 0 #fff' : undefined }}
                  >
                    <span className="text-[0.75rem] font-extrabold leading-tight">{g.head}</span>
                    {g.sub && <span className="text-[0.625rem] font-semibold leading-tight">{g.sub}</span>}
                  </div>
                )
              })}
            </div>
            <div className="relative mt-1 h-7">
              {timeline.ticks.map((t) => (
                <span
                  key={`${t.min}-${t.last}`}
                  className={`absolute top-0 flex flex-col text-[0.625rem] font-semibold leading-tight text-ink-mute tnum ${t.last ? 'items-end' : 'items-start'}`}
                  style={t.last ? { right: 0 } : { left: `${t.leftPct}%` }}
                >
                  <span className="mb-0.5 block h-1.5 w-px bg-line-strong" aria-hidden="true" />
                  {t.text}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[0.75rem] font-semibold text-ink-soft">
          {LEGEND.filter((l) => present.has(l.kind)).map((l) => (
            <span key={l.kind} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-[3px] ${l.dot}`} aria-hidden="true" />
              {l.label}
            </span>
          ))}
          <span className="ml-auto text-[0.6875rem] font-medium text-ink-mute">좌우로 밀어서 보기</span>
        </div>
      </div>
    </section>
  )
}

// ───────────── 식순 줄 ─────────────

function ProgramRowCard({ row, onShowSpots }: { row: ProgramRow; onShowSpots: () => void }) {
  const minutes = durationMin(row)
  const brk = row.kind === 'quiz'
  const closing = row.kind === 'end'
  return (
    <div
      className={`grid grid-cols-[3.75rem_minmax(0,1fr)] gap-x-3 rounded-card border px-3.5 py-3 ${
        brk
          ? 'border-gold-200 bg-gradient-to-br from-gold-50 to-[#fffbea]'
          : closing
            ? 'border-dashed border-line bg-transparent'
            : 'border-line bg-white shadow-soft'
      }`}
    >
      <div className="pt-0.5">
        <time dateTime={row.start} className="block text-[1.0625rem] font-extrabold leading-tight text-ink tnum">
          {row.start}
        </time>
        {row.end && (
          <span className="mt-0.5 block text-[0.75rem] font-medium leading-tight text-ink-mute tnum">
            ~ <time dateTime={row.end}>{row.end}</time>
          </span>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {row.badge && <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.75rem] font-bold leading-snug ${BADGE_CLASS[row.kind]}`}>{row.badge}</span>}
          <h4 className="min-w-0 text-[1rem] font-bold leading-snug text-ink [text-wrap:balance]">{row.title}</h4>
          {minutes !== null && <span className="ml-auto shrink-0 text-[0.75rem] font-semibold text-ink-mute tnum">{formatDuration(minutes)}</span>}
        </div>
        {row.desc && <p className="mt-1 text-[0.875rem] leading-relaxed text-ink-soft [text-wrap:pretty]">{row.desc}</p>}
        {row.items && row.items.length > 0 && (
          <ol role="list" className="mt-2 flex flex-wrap gap-1.5">
            {row.items.map((t, i) => (
              <li key={i} className="inline-flex items-baseline gap-1.5 rounded-2xl border border-sky-200 bg-sky-50 px-2.5 py-1 text-[0.8125rem] font-semibold leading-snug text-ink">
                <span className="font-bold text-primary-hover" aria-hidden="true">
                  {circled(i)}
                </span>
                {t}
              </li>
            ))}
          </ol>
        )}
        {row.action === 'spots' && (
          <button type="button" onClick={onShowSpots} className="btn btn-primary mt-2.5 min-h-[2.75rem] px-4 text-[0.9375rem]">
            투어 장소 보기 <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
    </div>
  )
}

// ───────────── 행사 문의 ─────────────

function ContactCard({ contact }: { contact: NonNullable<Program['contact']> }) {
  return (
    <section aria-labelledby="ev-contact-h" className="rounded-card border border-sky-200 bg-white px-4 py-4 shadow-soft">
      <SectionTitle id="ev-contact-h" eyebrow="Contact" title={contact.title} />
      {contact.phones.length > 0 && (
        <ul role="list" className="grid grid-cols-[repeat(auto-fit,minmax(8.75rem,1fr))] gap-2">
          {contact.phones.map((p) => (
            <li key={p} className="min-w-0">
              <a
                href={telHref(p)}
                aria-label={`전화 걸기 ${p}`}
                className="flex min-h-[3rem] items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-sky-200 bg-sky-50 px-2 text-[0.875rem] font-bold text-navy tnum transition-colors hover:border-primary/45 hover:bg-primary-soft active:scale-[0.98]"
              >
                <Phone size={15} strokeWidth={2} aria-hidden="true" />
                {p}
              </a>
            </li>
          ))}
        </ul>
      )}
      {contact.org && <p className="mt-2.5 text-[0.8125rem] font-medium text-ink-mute">{contact.org}</p>}
    </section>
  )
}
