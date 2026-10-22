/**
 * features/about/AboutModal.tsx — 정보 모달 (SPEC §4.9, §4.8)
 *
 * ui/Shell.tsx 가 항상 마운트하고 `ui.aboutOpen` 일 때만 표시한다(props 없음).
 * 내용: 소개 · 자료 출처(campus.meta.sources) · 데이터 유의사항 · GPS 개인정보 · 위치 기준 상태(+관리자 보정 링크) ·
 *       OpenStreetMap ODbL 표기 · 콘텐츠/사진 편집 방법.
 * 접근성: role="dialog" aria-modal · 포커스 트랩 · Esc/배경 클릭으로 닫기 · 닫은 뒤 포커스 복귀 · 뒤 화면 inert.
 * 모바일은 하단 시트, 데스크톱은 중앙 카드. 툴바(backdrop-filter) 조상에 영향받지 않도록 body 로 포털한다.
 */
import { ArrowUpRight, Building2, FileText, Layers, ShieldCheck, SlidersHorizontal, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { campus } from '../../data'
import { geoSourceLabel, useGeoTransform } from '../../lib/calibration'
import { useAppStore } from '../../store/useAppStore'
import { Emblem } from '../../ui/Brand'
import { useDialog } from '../gps/useDialog'

function Section({ icon, eyebrow, title, children }: { icon: ReactNode; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-5 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-paper-2 text-navy" aria-hidden="true">
          {icon}
        </span>
        <div className="min-w-0">
          <div className="eyebrow leading-none text-gold-deep">{eyebrow}</div>
          <h3 className="mt-1 text-[0.9375rem] font-bold leading-tight text-ink">{title}</h3>
        </div>
      </div>
      <div className="mt-3 space-y-2 text-[0.8125rem] leading-relaxed text-ink-soft lg:pl-[2.625rem]">{children}</div>
    </section>
  )
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="relative pl-3.5 before:absolute before:left-0 before:top-[0.7em] before:h-1 before:w-1 before:rounded-full before:bg-gold">
          {it}
        </li>
      ))}
    </ul>
  )
}

const code = 'rounded bg-paper-2 px-1 py-0.5 font-mono text-[0.75rem] text-ink [overflow-wrap:anywhere]'

export function AboutModal() {
  const open = useAppStore((s) => s.ui.aboutOpen)
  const close = useAppStore((s) => s.closeAbout)
  const openCalibrate = useAppStore((s) => s.openCalibrate)
  const geo = useGeoTransform()
  const ref = useDialog<HTMLElement>(open, close)
  if (!open || typeof document === 'undefined') return null

  const calibrated = geo.source !== 'osm-estimate'

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:p-6" role="presentation">
      <div className="absolute inset-0 animate-fade-in bg-ink/45" onClick={close} aria-hidden="true" />
      <article
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        tabIndex={-1}
        className="relative flex max-h-[92dvh] w-full animate-fade-up break-keep flex-col overflow-hidden rounded-t-panel border border-line bg-surface shadow-panel outline-none lg:max-h-[min(46rem,calc(100dvh-3rem))] lg:max-w-[38rem] lg:rounded-panel"
      >
        <header className="flex items-start gap-3.5 px-6 pb-4 pt-5 lg:pt-6">
          <Emblem size={44} className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="eyebrow text-gold-deep">Since 1906 · About</div>
            <h2 id="about-title" className="mt-1 text-[1.25rem] font-bold leading-tight text-ink [text-wrap:balance]">
              {campus.meta.title}
            </h2>
            <p className="mt-1 font-display text-[0.9375rem] italic tracking-[0.04em] text-ink-mute">Explore Our Campus</p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="정보 닫기"
            className="-mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-mute transition-colors hover:bg-paper-2 hover:text-ink"
          >
            <X size={20} strokeWidth={1.8} />
          </button>
        </header>

        <div className="scroll-y min-h-0 flex-1 border-t border-line px-6 pt-5" style={{ paddingBottom: 'max(1.5rem, var(--safe-bottom))' }}>
          <Section icon={<FileText size={17} strokeWidth={1.8} />} eyebrow="Sources" title="자료 출처">
            <Bullets items={campus.meta.sources} />
          </Section>

          <Section icon={<Layers size={17} strokeWidth={1.8} />} eyebrow="About the data" title="데이터 유의사항">
            <p>
              시설 명칭은 <b className="font-semibold text-ink">2025 시설배치도</b>, 건물 배치와 층별 평면 좌표는 <b className="font-semibold text-ink">2023 층별평면도</b>를 바탕으로 만들었습니다.{' '}
              <b className="font-semibold text-ink">실제와 일부 다를 수 있습니다.</b>
            </p>
            <Bullets
              items={[
                '‘명칭 대응 검토 중’ 표시가 있는 시설은 두 도면의 명칭을 맞춰 보는 중입니다.',
                '‘개략도’ 표시가 있는 층은 정밀 도면이 아니라 개략적인 배치입니다.',
                '사진이 아직 없는 시설은 ‘사진 준비 중’으로, 소개가 비어 있으면 준비 중 안내로 표시합니다.',
                '추천 투어는 관람 순서만 제안하며 이동 경로나 거리는 안내하지 않습니다.',
                '입학설명회 안내에서 내 위치와 장소를 잇는 점선은 직선 방향·거리일 뿐 실제 걷는 길이 아닙니다.',
              ]}
            />
          </Section>

          <Section icon={<ShieldCheck size={17} strokeWidth={1.8} />} eyebrow="Privacy" title="내 위치와 개인정보">
            <Bullets
              items={[
                <>
                  ‘내 위치’는 동의한 뒤에만 켜지며, 위치는 <b className="font-semibold text-ink">이 기기 안에서만</b> 사용됩니다. 서버로 전송하거나 저장하지 않습니다.
                </>,
                '외부 지도 서비스·분석·추적 스크립트를 사용하지 않습니다. 언제든 ‘추적 중지’로 끌 수 있어요.',
                '건물 안의 층은 자동으로 인식하지 않습니다. 층은 직접 선택해 주세요.',
                '관리자 보정 기능만 보정 결과(변환 값과 기준점)를 이 기기의 브라우저 저장소에 남길 수 있습니다.',
              ]}
            />
          </Section>

          <Section icon={<Building2 size={17} strokeWidth={1.8} />} eyebrow="Map & Location" title="지도 데이터와 위치 기준">
            <div className="rounded-card border border-line bg-paper/70 px-3.5 py-3">
              <div className="eyebrow text-ink-mute">현재 위치 기준</div>
              <p className="mt-0.5 text-[0.875rem] font-semibold text-ink">{geoSourceLabel(geo)}</p>
              <p className="mt-1 text-[0.75rem] leading-relaxed text-ink-mute">
                {calibrated
                  ? '현장에서 측정한 보정값으로 내 위치를 지도에 맞추고 있습니다.'
                  : '건물 윤곽을 공개지도와 맞춘 추정 좌표입니다. 현장 측정으로 보정할 수 있습니다.'}
              </p>
            </div>
            <p>
              위치 기준 좌표는 <b className="font-semibold text-ink">© OpenStreetMap contributors</b> 의 건물 윤곽(ODbL 라이선스)을 대조에 사용했습니다.{' '}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 font-semibold text-navy underline decoration-navy/30 underline-offset-2 hover:decoration-navy"
              >
                라이선스 안내
                <ArrowUpRight size={13} aria-hidden="true" />
              </a>
            </p>
            <button
              type="button"
              onClick={openCalibrate}
              className="group mt-1 flex min-h-11 w-full items-center gap-3 rounded-card border border-line bg-surface/70 px-3.5 py-2 text-left transition-[border-color,background-color,box-shadow] duration-180 hover:border-navy/40 hover:bg-surface hover:shadow-soft"
            >
              <SlidersHorizontal size={17} strokeWidth={1.8} className="shrink-0 text-navy" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.875rem] font-semibold text-ink">위치 보정 (관리자)</span>
                <span className="block text-[0.75rem] text-ink-mute">현장 GPS 측정으로 위치 기준을 보정합니다</span>
              </span>
              <ArrowUpRight size={16} className="shrink-0 text-ink-mute transition-transform duration-180 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          </Section>

          <Section icon={<FileText size={17} strokeWidth={1.8} />} eyebrow="For the school" title="내용·사진 수정하기">
            <p>별도 서버 없이 파일만 고치면 됩니다. 수정한 뒤 다시 빌드해서 올리세요.</p>
            <ol className="space-y-2">
              <li>
                <b className="font-semibold text-ink">시설 소개</b> — <code className={code}>public/content/facilities.json</code> 의 시설 ID별 이름·소개·특징·교육활동을 고칩니다.
              </li>
              <li>
                <b className="font-semibold text-ink">입학설명회 안내·추천 투어</b> — <code className={code}>public/content/tour.json</code> 의 <code className={code}>stops</code> 순서(★ 번호), <code className={code}>label</code>·<code className={code}>note</code>·<code className={code}>howto</code>(찾아가는 방법), <code className={code}>event</code>(날짜·제목)를 고칩니다.
              </li>
              <li>
                <b className="font-semibold text-ink">사진</b> — <code className={code}>public/photos/&lt;시설ID&gt;/</code> 폴더에 이미지를 넣고(건물 사진은{' '}
                <code className={code}>building-&lt;건물ID&gt;</code>), 설명은 같은 폴더의 <code className={code}>captions.json</code> 에 적습니다.
              </li>
              <li>
                <b className="font-semibold text-ink">반영</b> — <code className={code}>npm run photos</code> 로 사진 목록을 갱신하고 <code className={code}>npm run build</code> 후{' '}
                <code className={code}>dist/</code> 폴더를 웹 서버에 올립니다.
              </li>
              <li>
                <b className="font-semibold text-ink">위치 보정</b> — 보정 화면에서 내보낸 JSON을 <code className={code}>public/content/geo-calibration.json</code> 에 붙여넣습니다.
              </li>
            </ol>
          </Section>
        </div>
      </article>
    </div>,
    document.body,
  )
}
