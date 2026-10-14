// 인트로 (SPEC §4.1): 첫 진입 · 세션당 1회 · 건너뛰기 가능 · 2초 이내 상호작용 가능.
//  종이색 배경에 캠퍼스 배치도 실루엣이 은은히 드러나는 연출 → 엠블럼 · SONGDO HIGH SCHOOL · Explore Our Campus · 송도고를 걷다 · Since 1906
//  버튼: [추천 투어 시작] [자유롭게 둘러보기]. 버튼은 처음부터 활성 — 애니메이션을 기다리지 않아도 누를 수 있다.
import { useEffect, useRef, useState } from 'react'
import { buildings, campus, site } from '../data'
import { polygonPoints } from '../lib/geometry'
import { useAppStore } from '../store/useAppStore'
import { Emblem } from './Brand'

const D = (ms: number) => ({ animationDelay: `${ms}ms` })

export function Intro() {
  const open = useAppStore((s) => s.ui.intro)
  const dismissIntro = useAppStore((s) => s.dismissIntro)
  const [leaving, setLeaving] = useState(false)
  const [gone, setGone] = useState(false)
  const primary = useRef<HTMLButtonElement>(null)

  const finish = (next?: 'tour' | 'free') => {
    if (leaving) return
    setLeaving(true)
    // 지도/투어는 즉시 시작해 전환이 겹치게 하고, 인트로는 페이드아웃
    dismissIntro(next)
    window.setTimeout(() => setGone(true), 650)
  }

  useEffect(() => {
    if (!open) return
    primary.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish('free')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (gone || (!open && !leaving)) return null

  const [vx, vy, vw, vh] = site.viewBox
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-title"
      className="fixed inset-0 z-[70] overflow-hidden bg-paper"
      style={{ opacity: leaving ? 0 : 1, transform: leaving ? 'scale(1.025)' : 'none', transition: 'opacity 600ms ease, transform 700ms var(--ease-out)', pointerEvents: leaving ? 'none' : undefined }}
    >
      {/* 캠퍼스 실루엣 */}
      <svg
        className="absolute inset-0 h-full w-full animate-fade-in opacity-0"
        style={{ animationDuration: '1400ms', animationDelay: '150ms', animationFillMode: 'forwards' }}
        viewBox={`${vx} ${vy} ${vw} ${vh}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <g style={{ transformOrigin: '50% 50%', animation: 'introDrift 28s ease-in-out infinite alternate' }}>
          <polygon points={polygonPoints(site.boundary)} fill="none" stroke="rgb(11 31 75 / 0.26)" strokeWidth={2.5} strokeDasharray="10 8" />
          <polygon points={polygonPoints(site.field)} fill="rgb(58 153 80 / 0.11)" stroke="rgb(11 31 75 / 0.16)" strokeWidth={1.5} />
          {campus.minor.map((m) => (
            <polygon key={m.id} points={polygonPoints(m.poly)} fill="rgb(11 31 75 / 0.11)" />
          ))}
          {buildings.map((b) => (
            <polygon key={b.id} points={polygonPoints(b.poly)} fill="rgb(11 31 75 / 0.2)" stroke="rgb(11 31 75 / 0.45)" strokeWidth={2.5} />
          ))}
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 46%, rgb(var(--paper) / 0.9) 0%, rgb(var(--paper) / 0.7) 42%, rgb(var(--paper) / 0.1) 100%)' }} />

      <div className="relative z-10 mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-6 text-center">
        <div className="animate-fade-up" style={D(80)}>
          <Emblem size={84} />
        </div>
        <p className="eyebrow mt-6 animate-fade-up !tracking-[0.42em] text-navy/80" style={D(200)}>
          Songdo High School
        </p>
        <p className="mt-2 animate-fade-up font-display text-[1.5rem] italic leading-tight tracking-[0.03em] text-gold-deep sm:text-[1.875rem]" style={D(300)}>
          Explore Our Campus
        </p>
        <h1 id="intro-title" className="mt-4 animate-fade-up text-[clamp(2.75rem,10vw,4.75rem)] font-extrabold leading-[1.08] tracking-[-0.035em] text-navy" style={D(400)}>
          송도고를 걷다
        </h1>
        <div className="mt-5 flex animate-fade-up items-center gap-3 text-gold-deep" style={D(520)} aria-label="1906년부터">
          <span className="h-px w-10 bg-gold/60" />
          <span className="font-display text-[1rem] font-medium tracking-[0.3em]">SINCE 1906</span>
          <span className="h-px w-10 bg-gold/60" />
        </div>

        <div className="mt-10 flex w-full max-w-sm animate-fade-up flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center" style={D(640)}>
          <button ref={primary} type="button" className="btn btn-primary min-h-[3.25rem] px-7 text-[1rem]" onClick={() => finish('tour')}>
            추천 투어 시작
          </button>
          <button type="button" className="btn btn-ghost min-h-[3.25rem] px-7 text-[1rem]" onClick={() => finish('free')}>
            자유롭게 둘러보기
          </button>
        </div>
        <button type="button" onClick={() => finish('free')} className="mt-5 animate-fade-up rounded-full px-4 py-2 text-[0.8125rem] font-medium text-ink-mute underline-offset-4 hover:text-navy hover:underline" style={D(760)}>
          건너뛰기
        </button>
      </div>
    </div>
  )
}
