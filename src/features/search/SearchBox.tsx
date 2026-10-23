/**
 * features/search/SearchBox.tsx — 시설·건물·층 검색 (SPEC §4.5)
 *
 * 렌더 위치(ui/Shell.tsx): 데스크톱 = 상단 중앙 variant="bar", 모바일 = 상단 바 우측 variant="icon". 한 번에 하나만 마운트된다.
 *  - 트리거(버튼)는 제자리에 남고, 열린 검색창은 body 로 포털되어 렌더된다 (부모의 transform 이 fixed 기준을 바꾸지 않도록).
 *  - 열림 상태는 store.search.open — Shell 의 ⌘K / Ctrl+K / "/" 전역 단축키가 openSearch() 를 호출한다.
 *  - 데스크톱: 지도 위에 떠 있는 검색 패널(스크림 포함, 트리거 자리에서 펼쳐지는 모양). 모바일: 전체화면 오버레이
 *    (가상 키보드가 올라오면 visualViewport 높이에 맞춰 줄어든다).
 *  - 접근성: role="combobox" + listbox/group/option, aria-activedescendant, 결과 건수 aria-live, 포커스 트랩, 닫으면 트리거로 포커스 복귀.
 *  - 키보드: ↑↓ 이동(순환) · PageUp/PageDown · Enter 선택 · Esc 닫기 · ⌘/Ctrl+K 입력 전체선택. IME 조합 중에는 모든 키를 무시한다.
 *  - 선택 → store.selectRoom / selectFloor / selectBuilding 후 closeSearch().
 */
import { Building2, ChevronRight, CornerDownLeft, Layers, Search, SearchX, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { readableOn, tint } from '../../lib/color'
import { useContent } from '../../lib/content'
import { useAppStore } from '../../store/useAppStore'
import { useIsDesktop } from '../../ui/useMedia'
import { browseHits, categoryChips, searchDetailed, splitByRanges, type Range, type SearchHit } from './searchIndex'

export interface SearchBoxProps {
  variant: 'bar' | 'icon'
  className?: string
}

function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
}

export function SearchBox({ variant, className = '' }: SearchBoxProps) {
  const open = useAppStore((s) => s.search.open)
  const openSearch = useAppStore((s) => s.openSearch)
  const closeSearch = useAppStore((s) => s.closeSearch)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)

  // 닫히면 포커스를 트리거로 되돌린다 (다른 요소가 이미 포커스를 가져갔다면 건드리지 않는다)
  useEffect(() => {
    if (wasOpen.current && !open) {
      const a = document.activeElement
      if (!a || a === document.body) triggerRef.current?.focus({ preventScroll: true })
    }
    wasOpen.current = open
  }, [open])

  return (
    <div className={className}>
      {variant === 'bar' ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={openSearch}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-keyshortcuts="Control+K Meta+K /"
          aria-label="시설 검색 열기 (단축키 슬래시 또는 Ctrl K)"
          className="glass-surface flex h-12 w-[min(26rem,40vw)] items-center gap-3 rounded-full px-5 text-left text-[0.9375rem] text-ink-mute shadow-float transition-[box-shadow,transform] duration-180 hover:shadow-panel active:scale-[0.995]"
        >
          <Search size={18} strokeWidth={1.9} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            시설 · 건물 검색 <span className="opacity-75">(예: ㄷㅅㄱ)</span>
          </span>
          <kbd className="tnum rounded-md border border-line px-1.5 py-px text-[0.6875rem] font-semibold text-ink-mute">{isApplePlatform() ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={openSearch}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="grid h-11 w-11 place-items-center rounded-full text-ink-soft transition-colors hover:bg-paper-2 active:bg-paper-3"
          aria-label="검색 열기"
        >
          <Search size={21} strokeWidth={1.8} />
        </button>
      )}

      {open && <SearchOverlay onClose={closeSearch} />}
    </div>
  )
}

// ───────────────────────────── 검색 오버레이 ─────────────────────────────

/** 모바일 가상 키보드가 올라와도 오버레이가 보이는 영역에 맞도록 visualViewport 를 따른다 */
function useVisualViewportBox(enabled: boolean): { top: number; height: number } | null {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null)
  useEffect(() => {
    const vv = typeof window === 'undefined' ? null : window.visualViewport
    if (!enabled || !vv) {
      setBox(null)
      return
    }
    const on = () => setBox({ top: vv.offsetTop, height: vv.height })
    on()
    vv.addEventListener('resize', on)
    vv.addEventListener('scroll', on)
    return () => {
      vv.removeEventListener('resize', on)
      vv.removeEventListener('scroll', on)
    }
  }, [enabled])
  return box
}

const EXAMPLES: Array<{ q: string; label: string }> = [
  { q: 'ㄷㅅㄱ', label: '초성' },
  { q: '본관 2층', label: '건물 + 층' },
  { q: '1-1', label: '교실 번호' },
]

function SearchOverlay({ onClose }: { onClose: () => void }) {
  const uid = useId()
  const isDesktop = useIsDesktop()
  const vv = useVisualViewportBox(!isDesktop)
  const selectRoom = useAppStore((s) => s.selectRoom)
  const selectFloor = useAppStore((s) => s.selectFloor)
  const selectBuilding = useAppStore((s) => s.selectBuilding)
  const facilities = useContent((s) => s.facilities) // 소개 문구가 늦게 로드되면 다시 검색

  const [q, setQ] = useState('')
  const [active, setActive] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastScrollTop = useRef(0)
  const viaKeyboard = useRef(false)

  const trimmed = q.trim()
  const res = useMemo(() => searchDetailed(q), [q, facilities]) // eslint-disable-line react-hooks/exhaustive-deps
  const browse = useMemo(() => browseHits(), [])
  const chips = useMemo(() => categoryChips(), [])
  const hits = useMemo<SearchHit[]>(() => (trimmed ? res.groups.flatMap((g) => g.hits) : browse), [trimmed, res, browse])
  const activeIdx = Math.min(active, hits.length - 1)

  const optId = (i: number) => `${uid}-o${i}`
  const listId = `${uid}-list`

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
  }, [])

  // 키보드로 이동한 활성 항목만 보이도록 스크롤 (마우스 호버로는 스크롤하지 않는다)
  useEffect(() => {
    if (activeIdx < 0 || !viaKeyboard.current) return
    document.getElementById(optId(activeIdx))?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (h: SearchHit) => {
    if (h.kind === 'room') selectRoom(h.roomId)
    else if (h.kind === 'floor' && h.floorId) selectFloor(h.floorId, h.buildingId)
    else selectBuilding(h.buildingId)
    onClose()
  }

  const setQuery = (next: string) => {
    setQ(next)
    setActive(next.trim() ? 0 : -1)
    viaKeyboard.current = true
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return // IME 조합 중(한글 입력)에는 키를 가로채지 않는다
    const n = hits.length
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        viaKeyboard.current = true
        if (n) setActive((a) => (a + 1) % n)
        break
      case 'ArrowUp':
        e.preventDefault()
        viaKeyboard.current = true
        if (n) setActive((a) => (a <= 0 ? n - 1 : a - 1))
        break
      case 'PageDown':
        e.preventDefault()
        viaKeyboard.current = true
        if (n) setActive((a) => Math.min(n - 1, Math.max(0, a) + 6))
        break
      case 'PageUp':
        e.preventDefault()
        viaKeyboard.current = true
        if (n) setActive((a) => Math.max(0, a - 6))
        break
      case 'Enter': {
        e.preventDefault()
        const h = hits[activeIdx]
        if (h) choose(h)
        break
      }
      case 'k':
      case 'K':
        if (e.metaKey || e.ctrlKey) {
          // 전역 ⌘K 핸들러가 다시 열지 않도록 전파를 막고, 입력 내용을 전체 선택한다
          e.preventDefault()
          e.stopPropagation()
          e.currentTarget.select()
        }
        break
    }
  }

  const onDialogKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key === 'Tab') {
      // 포커스 트랩: 입력 · 지우기 · 닫기 버튼 사이에서만 순환
      const els = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('input, button') ?? []).filter((el) => el.getClientRects().length > 0)
      if (els.length === 0) return
      const first = els[0]
      const last = els[els.length - 1]
      const cur = document.activeElement
      if (e.shiftKey && cur === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && cur === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  // 모바일: 결과를 스크롤하면 가상 키보드를 내려 더 많은 결과가 보이게 한다 (탭 도중에는 건드리지 않는다)
  const onListScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const moved = Math.abs(el.scrollTop - lastScrollTop.current)
    lastScrollTop.current = el.scrollTop
    if (!isDesktop && moved > 8 && document.activeElement === inputRef.current) inputRef.current?.blur()
  }

  const status = trimmed ? (res.total > 0 ? `검색 결과 ${res.total}건` : '검색 결과가 없습니다') : ''
  const hasList = hits.length > 0
  let flat = -1
  const boxStyle = !isDesktop && vv ? { top: vv.top, height: vv.height } : { top: 0, bottom: 0 }

  return createPortal(
    <div className="fixed inset-x-0 z-50" style={boxStyle}>
      {/* 데스크톱 스크림 (모바일은 패널이 화면 전체) */}
      <div aria-hidden="true" className="absolute inset-0 hidden animate-fade-in bg-navy/15 backdrop-blur-[2px] [animation-duration:220ms] lg:block" onClick={onClose} />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="시설 검색"
        onKeyDown={onDialogKeyDown}
        className={[
          'absolute inset-0 flex animate-fade-in flex-col bg-paper [animation-duration:240ms]',
          'lg:inset-x-0 lg:bottom-auto lg:top-6 lg:mx-auto lg:max-h-[calc(100vh-3rem)] lg:w-[min(38rem,calc(100vw-3rem))] lg:animate-fade-up lg:[animation-duration:280ms]',
          'lg:overflow-hidden lg:rounded-panel lg:border lg:border-line/80 lg:bg-surface/90 lg:shadow-panel lg:backdrop-blur-[18px] lg:backdrop-saturate-[1.25]',
        ].join(' ')}
      >
        {/* 입력줄 */}
        <div
          className="flex shrink-0 items-center gap-1 border-b border-line/80 pl-4 pr-1.5 transition-colors focus-within:border-gold lg:pr-2"
          style={isDesktop ? undefined : { paddingTop: 'var(--safe-top)' }}
        >
          <Search size={20} strokeWidth={1.9} className="shrink-0 text-ink-mute" aria-hidden="true" />
          <input
            ref={inputRef}
            autoFocus
            type="text"
            role="combobox"
            aria-expanded={hasList}
            aria-controls={hasList ? listId : undefined}
            aria-activedescendant={hasList && activeIdx >= 0 ? optId(activeIdx) : undefined}
            aria-autocomplete="list"
            aria-label="시설 · 건물 · 층 검색"
            value={q}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="시설 · 건물 · 층 검색"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="h-14 min-w-0 flex-1 bg-transparent px-2 text-[1.0625rem] font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-mute focus-visible:shadow-none"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
              aria-label="검색어 지우기"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-mute transition-colors hover:bg-paper-2 hover:text-ink"
            >
              <X size={18} strokeWidth={1.9} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="검색 닫기"
            className="hidden h-8 shrink-0 items-center rounded-lg border border-line px-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-mute transition-colors hover:border-navy/40 hover:text-navy lg:inline-flex"
          >
            esc
          </button>
          <button type="button" onClick={onClose} className="min-h-[2.75rem] shrink-0 rounded-full px-3 text-[0.9375rem] font-semibold text-navy active:bg-paper-2 lg:hidden">
            취소
          </button>
        </div>

        {/* 결과 */}
        <div ref={scrollRef} onScroll={onListScroll} className="scroll-y min-h-0 flex-1 px-2 pb-3 lg:max-h-[min(31rem,calc(100vh-11rem))]">
          {!trimmed && (
            <>
              <div role="listbox" id={listId} aria-label="건물 바로가기">
                <div role="group" aria-labelledby={`${uid}-browse`}>
                  <GroupHeader id={`${uid}-browse`} label="건물 바로가기" count={browse.length} />
                  {browse.map((h) => {
                    flat += 1
                    const i = flat
                    return <ResultRow key={h.key} hit={h} id={optId(i)} active={i === activeIdx} onChoose={choose} onHover={() => { viaKeyboard.current = false; setActive(i) }} />
                  })}
                </div>
              </div>

              <section aria-label="검색 도움말" className="px-2 pb-1 pt-4">
                <h3 className="eyebrow mb-2 text-ink-mute">Search tips · 이렇게 검색해 보세요</h3>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLES.map((ex) => (
                    <button key={ex.q} type="button" onClick={() => { setQuery(ex.q); inputRef.current?.focus() }} className="chip min-h-[2rem] cursor-pointer transition-colors hover:border-navy/40 hover:bg-surface hover:text-navy">
                      <span className="font-semibold text-ink">{ex.q}</span>
                      <span className="text-ink-mute">{ex.label}</span>
                    </button>
                  ))}
                </div>
                <h3 className="eyebrow mb-2 mt-5 text-ink-mute">Categories · 분류로 찾기</h3>
                <div className="flex flex-wrap gap-2">
                  {chips.map((c) => (
                    <button key={c.id} type="button" onClick={() => { setQuery(c.label); inputRef.current?.focus() }} className="chip min-h-[2rem] cursor-pointer transition-colors hover:border-navy/40 hover:bg-surface hover:text-navy">
                      {c.label}
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}

          {trimmed && res.total > 0 && (
            <div role="listbox" id={listId} aria-label="검색 결과">
              {res.groups.map((g) => (
                <div key={g.buildingId} role="group" aria-labelledby={`${uid}-g-${g.buildingId}`}>
                  <GroupHeader id={`${uid}-g-${g.buildingId}`} label={g.buildingName} color={g.color} count={g.hits.length} />
                  {g.hits.map((h) => {
                    flat += 1
                    const i = flat
                    return <ResultRow key={h.key} hit={h} id={optId(i)} active={i === activeIdx} onChoose={choose} onHover={() => { viaKeyboard.current = false; setActive(i) }} />
                  })}
                </div>
              ))}
            </div>
          )}

          {trimmed && res.total > res.shown && (
            <p className="px-4 pb-1 pt-3 text-[0.75rem] leading-relaxed text-ink-mute">
              일치하는 곳이 {res.total}건이라 상위 {res.shown}건만 보여 드립니다. 검색어를 조금 더 입력해 보세요.
            </p>
          )}

          {trimmed && res.total === 0 && (
            <div className="grid justify-items-center px-6 py-12 text-center">
              <SearchX size={30} strokeWidth={1.5} className="text-ink-mute" aria-hidden="true" />
              <p className="mt-3 max-w-full break-words text-[0.9375rem] font-semibold text-ink">‘{trimmed}’에 맞는 곳을 찾지 못했어요</p>
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-mute">
                시설 이름의 일부나 초성(ㄷㅅㄱ), 건물 · 층(본관 2층)으로 다시 찾아보세요.
              </p>
            </div>
          )}
        </div>

        {/* 데스크톱 키보드 안내 */}
        <div className="hidden shrink-0 items-center gap-4 border-t border-line/70 px-4 py-2 text-[0.75rem] text-ink-mute lg:flex" aria-hidden="true">
          <span className="inline-flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd>이동</span>
          <span className="inline-flex items-center gap-1.5"><Kbd><CornerDownLeft size={11} strokeWidth={2.2} /></Kbd>선택</span>
          <span className="inline-flex items-center gap-1.5"><Kbd>esc</Kbd>닫기</span>
          <span className="ml-auto">초성 검색 · 공백 무시</span>
        </div>

        <div className="sr-only-live" role="status" aria-live="polite">
          {status}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="grid min-w-[1.25rem] place-items-center rounded-md border border-line bg-paper/70 px-1 py-px text-[0.6875rem] font-semibold leading-none text-ink-soft">{children}</kbd>
}

function GroupHeader({ id, label, color, count }: { id: string; label: string; color?: string; count: number }) {
  return (
    <div id={id} className="sticky top-0 z-10 flex items-center gap-2 bg-paper/95 px-3 pb-1.5 pt-3 backdrop-blur-sm lg:bg-surface/95">
      {color && <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] border border-ink/10" style={{ background: color }} aria-hidden="true" />}
      <span className="text-[0.75rem] font-semibold tracking-[0.04em] text-ink-mute">{label}</span>
      <span className="tnum ml-auto text-[0.75rem] text-ink-mute">{count}</span>
    </div>
  )
}

function Hl({ text, ranges }: { text: string; ranges: Range[] }) {
  return (
    <>
      {splitByRanges(text, ranges).map((p, i) =>
        p.hit ? (
          <mark key={i} className="-mx-px rounded-[3px] bg-gold-soft px-px text-inherit">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  )
}

function Glyph({ hit }: { hit: SearchHit }) {
  const c = hit.buildingColor
  if (hit.kind === 'room') {
    return (
      <span
        className="grid h-9 w-11 shrink-0 place-items-center rounded-xl font-display text-[1.0625rem] font-semibold leading-none lining-nums tabular-nums"
        style={{ background: c, color: readableOn(c) }}
        aria-hidden="true"
      >
        {hit.floorId}
      </span>
    )
  }
  const Icon = hit.kind === 'building' ? Building2 : Layers
  return (
    <span
      className="grid h-9 w-11 shrink-0 place-items-center rounded-xl text-ink"
      style={{ background: hit.kind === 'building' ? tint(c, 0.55) : tint(c, 0.22), boxShadow: `inset 0 0 0 1px ${tint(c, 0.6)}` }}
      aria-hidden="true"
    >
      <Icon size={18} strokeWidth={1.7} />
    </span>
  )
}

function ResultRow({ hit, id, active, onChoose, onHover }: { hit: SearchHit; id: string; active: boolean; onChoose: (h: SearchHit) => void; onHover: () => void }) {
  const showMatch = hit.kind === 'room' && hit.matchedOn && hit.matchedOn !== '분류'
  const kindLabel = hit.kind === 'building' ? '건물' : hit.kind === 'floor' ? '층' : ''
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      onMouseMove={onHover}
      onMouseDown={(e) => e.preventDefault() /* 입력창 포커스 유지 */}
      onClick={() => onChoose(hit)}
      className={`relative flex min-h-[3.5rem] scroll-mt-10 cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 transition-colors duration-100 ${active ? 'bg-primary-soft' : ''}`}
    >
      <span
        className={`absolute bottom-2.5 left-0 top-2.5 w-[3px] rounded-full transition-opacity duration-100 ${active ? 'opacity-100' : 'opacity-0'}`}
        style={{ background: hit.buildingColor }}
        aria-hidden="true"
      />
      <Glyph hit={hit} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-[0.9375rem] font-semibold text-ink">
            <Hl text={hit.name} ranges={hit.nameRanges} />
          </span>
          {hit.sub && (
            <span className={`truncate text-[0.8125rem] text-ink-mute ${hit.kind === 'building' ? 'font-display text-[0.9375rem] italic tracking-[0.03em]' : ''}`}>
              <Hl text={hit.sub} ranges={hit.subRanges} />
            </span>
          )}
          {kindLabel && <span className="shrink-0 rounded-full border border-line px-1.5 text-[0.6875rem] font-semibold leading-[1.1rem] text-ink-mute">{kindLabel}</span>}
        </div>
        <div className="mt-0.5 truncate text-[0.75rem] text-ink-mute">
          {hit.kind === 'room' ? (
            <>
              {hit.floorLabel} · {hit.categoryLabel}
              {showMatch && (
                <>
                  {' · '}
                  <span className="font-semibold text-gold-deep">{hit.matchedOn}</span> “<Hl text={hit.matchedText} ranges={hit.matchedRanges} />”
                </>
              )}
            </>
          ) : (
            <>
              {hit.meta}
              {hit.schematic && <span className="ml-1.5 rounded-full border border-gold/50 bg-gold-soft/60 px-1.5 text-[0.6875rem] font-semibold text-gold-deep">개략도</span>}
            </>
          )}
        </div>
      </div>
      {active ? (
        <CornerDownLeft size={16} strokeWidth={1.9} className="hidden shrink-0 text-navy lg:block" aria-hidden="true" />
      ) : null}
      <ChevronRight size={17} strokeWidth={1.8} className={`shrink-0 text-ink-mute ${active ? 'lg:hidden' : ''}`} aria-hidden="true" />
    </div>
  )
}
