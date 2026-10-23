/**
 * features/event/ProgramTab.tsx — '설명회 안내' > 식순 탭 (#/event · #/event/program)
 *
 *  히어로 카드(남색, 학교 안내문의 머리와 같은 인상) → 한눈에 보는 시간표(막대) → 식순 목록 → 참석 안내 → 행사 문의
 *  · 모든 글자(제목·시간·이름·전화번호)는 public/content/program.json 에서 온다 — 화면이 지어내지 않는다.
 *  · 날짜·시각에 따라 달라지는 표시는 없다 (진행 중 표시 없음) — 어느 날 열어도 같은 화면.
 *  · ProgramView 는 props 만으로 그려지는 순수 표시 컴포넌트다 (스토어·지도 비의존 → 서버 렌더로 테스트).
 *  접근성: 식순은 의미 있는 목록(<ol>), 시간은 <time>, 막대는 요약 라벨이 있는 이미지, 전화는 tel: 링크.
 */
import { MapPin, Phone } from 'lucide-react'
import type { Program, ProgramKind, ProgramRow } from '../../data/types'
import { buildTimeline, circled, durationMin, formatDuration, splitHighlight, telHref, type Timeline, type Venue } from './programModel'

/** 시간표 막대 구간 색: 설명·발표 = 남색/파랑 계열, 퀴즈 이벤트 = 금색, 연수·투어 = 초록 계열 (흰 글자 대비 AA 이상) */
const SEGMENT_CLASS: Record<ProgramKind, string[]> = {
  talk: ['bg-navy text-white', 'bg-[rgb(40_78_146)] text-white', 'bg-navy-700 text-white', 'bg-[rgb(55_104_178)] text-white'],
  quiz: ['bg-star text-navy'],
  tour: ['bg-[rgb(28_104_57)] text-white', 'bg-[rgb(46_132_74)] text-white'],
  reception: ['bg-paper-3 text-ink'],
  end: ['bg-paper-3 text-ink'],
}
const BADGE_CLASS: Record<ProgramKind, string> = {
  talk: 'bg-navy text-white',
  quiz: 'border border-star-deep/40 bg-star text-navy',
  tour: 'bg-[rgb(28_104_57)] text-white',
  reception: 'border border-line bg-paper-2 text-ink-soft',
  end: 'border border-line bg-paper-2 text-ink-soft',
}
const LEGEND: { kind: ProgramKind; label: string; dot: string }[] = [
  { kind: 'talk', label: '설명·발표', dot: 'bg-navy' },
  { kind: 'quiz', label: '퀴즈 이벤트', dot: 'bg-star' },
  { kind: 'tour', label: '연수·투어', dot: 'bg-[rgb(28_104_57)]' },
]

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
          <ul role="list" className="grid gap-2 rounded-card border border-line bg-surface/70 px-4 py-3.5">
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
  return (
    <section aria-labelledby="ev-prog-title" className="relative overflow-hidden rounded-card bg-gradient-to-br from-navy to-navy-700 p-5 text-white shadow-soft">
      <span className="pointer-events-none absolute -right-12 -top-14 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgb(var(--star)/0.28),transparent_68%)]" aria-hidden="true" />
      <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-star/80 to-transparent" aria-hidden="true" />
      <div className="relative">
        {program.eyebrow && <p className="eyebrow !text-[0.6875rem] text-star">{program.eyebrow}</p>}
        <h3 id="ev-prog-title" className="mt-1.5 text-[1.5rem] font-extrabold leading-[1.18] tracking-[-0.035em] [text-wrap:balance]">
          {before}
          {mark && <span className="text-star">{mark}</span>}
          {after}
        </h3>
        {program.lead && <p className="mt-2 text-[0.9375rem] leading-snug text-white/85 [text-wrap:pretty]">{program.lead}</p>}
        {program.anniversary && (
          <p className="mt-3 flex items-center gap-2.5 text-star">
            <span className="h-px w-7 bg-star/60" aria-hidden="true" />
            <span className="font-display text-[0.9375rem] font-medium tracking-[0.12em]">{program.anniversary}</span>
          </p>
        )}
        {program.info.length > 0 && (
          <dl className="mt-4 grid gap-px overflow-hidden rounded-xl border border-white/15 bg-white/15">
            {program.info.map((it, i) => {
              const isVenue = !!venue && !!it.facility && it.facility === venue.roomId
              return (
                <div key={i} className="flex items-stretch bg-navy-700/90">
                  <dt className="grid w-[3.5rem] shrink-0 place-items-center border-r border-white/10 px-2 text-[0.75rem] font-bold tracking-wide text-star">{it.label}</dt>
                  <dd className="min-w-0 flex-1">
                    {isVenue ? (
                      <button
                        type="button"
                        onClick={onShowVenue}
                        aria-label={`${it.value}, 지도에서 ${venue.buildingName} 보기`}
                        className="group flex min-h-[2.75rem] w-full items-center gap-2 px-3.5 py-2 text-left text-[0.9375rem] font-bold transition-colors hover:bg-white/10 focus-visible:bg-white/10"
                      >
                        <span className="min-w-0 flex-1">{it.value}</span>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-star px-2.5 py-1 text-[0.75rem] font-bold text-navy">
                          <MapPin size={13} strokeWidth={2.2} aria-hidden="true" />
                          지도에서 보기
                        </span>
                      </button>
                    ) : (
                      <span className="flex min-h-[2.75rem] items-center px-3.5 py-2 text-[0.9375rem] font-bold tnum">{it.value}</span>
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
      <div className="rounded-card border border-line bg-surface/70 px-3 pb-3 pt-3.5">
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
                    style={{ left: `${g.leftPct}%`, width: `${g.widthPct}%`, boxShadow: i < last ? 'inset -2px 0 0 rgb(var(--surface))' : undefined }}
                  >
                    <span className="text-[0.75rem] font-extrabold leading-tight">{g.head}</span>
                    {g.sub && <span className="text-[0.625rem] font-semibold leading-tight opacity-90">{g.sub}</span>}
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
          ? 'border-gold/45 bg-gradient-to-br from-star-soft/80 to-gold-soft/70'
          : closing
            ? 'border-dashed border-line bg-transparent'
            : 'border-line bg-surface/80 shadow-soft'
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
              <li key={i} className="inline-flex items-baseline gap-1.5 rounded-2xl border border-line bg-paper/80 px-2.5 py-1 text-[0.8125rem] font-semibold leading-snug text-ink">
                <span className="font-bold text-navy" aria-hidden="true">
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
    <section aria-labelledby="ev-contact-h" className="rounded-card border border-navy/20 bg-surface/80 px-4 py-4 shadow-soft">
      <SectionTitle id="ev-contact-h" eyebrow="Contact" title={contact.title} />
      {contact.phones.length > 0 && (
        <ul role="list" className="grid grid-cols-[repeat(auto-fit,minmax(8.75rem,1fr))] gap-2">
          {contact.phones.map((p) => (
            <li key={p} className="min-w-0">
              <a
                href={telHref(p)}
                aria-label={`전화 걸기 ${p}`}
                className="flex min-h-[3rem] items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-navy/25 bg-surface px-2 text-[0.875rem] font-bold text-navy tnum transition-colors hover:border-navy/55 hover:bg-paper active:scale-[0.98]"
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
