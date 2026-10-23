/**
 * features/gps/Calibrate.tsx — 관리자 위치 보정 (SPEC §4.8) · 라우트 `#/calibrate`
 *
 * ui/Shell.tsx 가 store.screen==='calibrate' 일 때 React.lazy 로 전체 화면에 렌더한다(기본 지도·툴바는 언마운트).
 * 그래서 이 화면이 자신의 <CampusMap mode="pick" /> 을 소유한다.
 *
 *  ① 지도에서 서 있는 지점을 정확히 탭(확대할수록 정확)  ② "현재 위치 기록" — 10초 평균(정확도 표시)
 *  ③ 점 목록 + 적합: 1점 = 평행이동 / 2점↑ = 2D 닮음변환(Procrustes) 최소제곱, 점별 잔차(m)
 *  ④ "이 기기에 적용"(localStorage) · "JSON 내보내기"(복사/다운로드 → public/content/geo-calibration.json) · "초기화"
 *
 * 적용 우선순위(lib/calibration.useGeoTransform): localStorage > geo-calibration.json > campus.json 기본(OSM 추정).
 * 실시간 GPS 좌표는 저장하지 않는다 — 기록 중 표본은 메모리에서 평균 1개로만 남고, 저장 대상은 '보정 결과'(변환행렬·점 목록)뿐이다.
 */
import { ArrowLeft, Check, ChevronDown, ChevronUp, Copy, Crosshair, Download, LocateFixed, RotateCcw, Trash2, TriangleAlert } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { campus } from '../../data'
import type { CalibrationPoint, Pt } from '../../data/types'
import { clearLocalCalibration, geoSourceLabel, saveLocalCalibration, useCalibration, useGeoTransform } from '../../lib/calibration'
import { remPx } from '../../lib/env'
import type { GeoTransform } from '../../lib/geo'
import { CampusMap } from '../../map/CampusMap'
import { useRegisteredMap } from '../../map/mapBus'
import { MapControls } from '../../map/MapControls'
import { useAppStore } from '../../store/useAppStore'
import { toast } from '../../ui/Toast'
import { useIsDesktop } from '../../ui/useMedia'
import { calibrationFileJson, computeCalibration, roundPoint, type CalibrationResult } from './calibrationFit'
import { stopLocationTracking } from './useGeolocation'
import { RECORD_MS, useRecorder } from './useRecorder'

interface Entry {
  point: CalibrationPoint
  /** 평균에 쓴 표본 수 / 흩어짐(m) — 화면 표시용(저장·내보내기 대상 아님) */
  samples: number
  spreadM: number
}

const SCALE = 'calc(var(--ik, 1) * var(--ui-scale, 1))'

// ───────────── 지도 위 보정 표식 ─────────────

function Screen({ at, children }: { at: Pt; children: ReactNode }) {
  return <g style={{ transform: `translate(${at[0]}px, ${at[1]}px) scale(${SCALE})` }}>{children}</g>
}

function CalibLayer({ picked, entries, geo, recording }: { picked: Pt | null; entries: Entry[]; geo: GeoTransform; recording: boolean }) {
  return (
    <g data-layer="calibration" pointerEvents="none" aria-hidden="true">
      {entries.map((e, i) => {
        const measured = geo.latLonToPx(e.point)
        const [px, py] = e.point.px
        const showMeasured = Number.isFinite(measured[0]) && Number.isFinite(measured[1])
        return (
          <g key={`${i}-${px}-${py}`}>
            {showMeasured && (
              <>
                <line
                  x1={px}
                  y1={py}
                  x2={measured[0]}
                  y2={measured[1]}
                  style={{ stroke: 'rgb(var(--gold-deep))', strokeWidth: 1.4, strokeDasharray: '4 3', vectorEffect: 'non-scaling-stroke' }}
                />
                <Screen at={measured}>
                  <circle r={8} style={{ fill: 'rgb(var(--leaf) / 0.18)', stroke: 'rgb(var(--leaf))', strokeWidth: 2 }} />
                </Screen>
              </>
            )}
            <Screen at={e.point.px}>
              <circle r={12} style={{ fill: 'rgb(var(--navy))', stroke: '#fff', strokeWidth: 2.2 }} />
              <text textAnchor="middle" dominantBaseline="central" style={{ fontSize: 12, fontWeight: 700, fill: '#fff' }}>
                {i + 1}
              </text>
            </Screen>
          </g>
        )
      })}
      {picked && (
        <Screen at={picked}>
          {recording && (
            <circle
              r={14}
              style={{ fill: 'rgb(var(--gold) / 0.35)', animation: 'gps-pulse 1.6s var(--ease-out) infinite', transformBox: 'fill-box', transformOrigin: 'center' }}
            />
          )}
          <circle r={14} style={{ fill: 'rgb(var(--gold) / 0.16)', stroke: 'rgb(var(--gold-deep))', strokeWidth: 2.2 }} />
          <g style={{ stroke: 'rgb(var(--navy))', strokeWidth: 2, strokeLinecap: 'round' }}>
            <line x1={-23} y1={0} x2={-8} y2={0} />
            <line x1={8} y1={0} x2={23} y2={0} />
            <line x1={0} y1={-23} x2={0} y2={-8} />
            <line x1={0} y1={8} x2={0} y2={23} />
          </g>
          <circle r={2.6} style={{ fill: 'rgb(var(--navy))' }} />
        </Screen>
      )}
    </g>
  )
}

// ───────────── 작은 UI 조각 ─────────────

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: ReactNode }) {
  return (
    <li className="relative pl-9">
      <span
        className={`tnum absolute left-0 top-0 grid h-6 w-6 place-items-center rounded-full text-[0.75rem] font-bold ${done ? 'bg-leaf text-white' : 'bg-primary text-white'}`}
        aria-hidden="true"
      >
        {done ? <Check size={14} strokeWidth={3} /> : n}
      </span>
      <h2 className="text-[0.9375rem] font-bold leading-6 text-ink">{title}</h2>
      <div className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-soft">{children}</div>
    </li>
  )
}

function readSafeTopPx(): number {
  try {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;padding-top:env(safe-area-inset-top,0px)'
    document.body.appendChild(probe)
    const v = parseFloat(getComputedStyle(probe).paddingTop) || 0
    probe.remove()
    return v
  } catch {
    return 0
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    /* 비보안 연결 등 — 아래 대체 방법 */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function residualTone(r: number): string {
  return r <= 5 ? 'text-leaf' : r <= 8 ? 'text-gold-deep' : 'text-danger'
}

const METHOD_LABEL = { translation: '1점 평행이동 보정', similarity: '닮음변환 최소제곱 (회전·배율·이동)' } as const

// ───────────── 화면 ─────────────

export default function Calibrate() {
  const goCampus = useAppStore((s) => s.goCampus)
  const geo = useGeoTransform()
  const local = useCalibration((s) => s.local)
  const isDesktop = useIsDesktop()
  const campusApi = useRegisteredMap('campus')

  const [picked, setPicked] = useState<Pt | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [panelH, setPanelH] = useState(0)
  const [safeTop] = useState(readSafeTopPx)
  const panelRef = useRef<HTMLElement>(null)
  const pickedRef = useRef<Pt | null>(null)
  pickedRef.current = picked

  const points = useMemo(() => entries.map((e) => e.point), [entries])
  const result: CalibrationResult | null = useMemo(() => computeCalibration(points), [points])

  const recorder = useRecorder((avg) => {
    const at = pickedRef.current
    if (!at) return
    const point = roundPoint(at, avg)
    setEntries((prev) => [...prev, { point, samples: avg.samples, spreadM: avg.spreadM }])
    setPicked(null)
    toast.success(`${entries.length + 1}번 점을 기록했습니다 · 표본 ${avg.samples}개 · 평균 정확도 ±${point.acc} m`, { id: 'calib-rec' })
  })
  const recording = recorder.state.phase === 'recording'

  useEffect(() => {
    document.title = '위치 보정 · 송도고등학교 캠퍼스 투어'
    // 앱의 '내 위치' 추적은 끄고(보정 기록은 자체 구독 사용) 중복 watch 를 피한다
    stopLocationTracking()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (recording) recorder.cancel()
      else if (picked) setPicked(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [recording, picked, recorder])

  // 모바일: 하단 패널 높이를 측정해 지도 보이는 영역(insets)에 반영
  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setPanelH(el.getBoundingClientRect().height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const topBarH = 60 + safeTop // 모바일: 지도 위 안내 필이 차지하는 높이
  const insets = useMemo(() => {
    if (isDesktop) {
      const rem = remPx()
      return { top: Math.round(1.5 * rem), right: Math.round(1.5 * rem), bottom: Math.round(1.5 * rem), left: Math.round(26.25 * rem + 3 * rem) }
    }
    return { top: topBarH + 8, right: 10, bottom: Math.round(panelH) + 8, left: 10 }
  }, [isDesktop, topBarH, panelH])

  const onTap = (pt: Pt) => {
    if (recording) {
      toast.info('기록 중에는 지점을 바꿀 수 없어요. 취소한 뒤 다시 탭해 주세요.', { id: 'calib-note' })
      return
    }
    setPicked(pt)
  }

  const layers = useMemo(() => <CalibLayer picked={picked} entries={entries} geo={geo} recording={recording} />, [picked, entries, geo, recording])

  const removeEntry = (i: number) => setEntries((prev) => prev.filter((_, k) => k !== i))

  const fresh = () => computeCalibration(points, new Date())

  const apply = () => {
    const r = fresh()
    if (!r) return
    saveLocalCalibration(r.calibration)
    toast.success(`이 기기에 보정을 적용했습니다 · 오차 약 ${Math.round(r.rmsErrorM)} m`, { id: 'calib-apply' })
  }
  const exportCopy = async () => {
    const r = fresh()
    if (!r) return
    const ok = await copyText(calibrationFileJson(r.calibration))
    if (ok) toast.success('JSON을 복사했습니다. public/content/geo-calibration.json 에 붙여넣으세요.', { id: 'calib-copy' })
    else {
      setPreviewOpen(true)
      toast.warn('자동 복사가 막혀 있어요. 아래 미리보기를 길게 눌러 직접 복사해 주세요.', { id: 'calib-copy' })
    }
  }
  const exportDownload = () => {
    const r = fresh()
    if (!r) return
    downloadText('geo-calibration.json', calibrationFileJson(r.calibration))
    toast.success('geo-calibration.json 을 내려받았습니다. public/content/ 의 같은 이름 파일과 교체하세요.', { id: 'calib-dl' })
  }
  const reset = () => {
    recorder.cancel()
    setEntries([])
    setPicked(null)
    clearLocalCalibration()
    setConfirmReset(false)
    toast.info('초기화했습니다. 기본(OSM 공개지도 대조) 기준으로 돌아갑니다.', { id: 'calib-reset' })
  }

  const previewJson = useMemo(() => (result ? calibrationFileJson(result.calibration) : ''), [result])
  const dupError = points.length >= 2 && !result ? '기록한 점들이 같은 위치에 있어 보정을 계산할 수 없습니다. 서로 다른 지점을 기록해 주세요.' : null
  const lowSamples = !recording && entries.length > 0 && entries[entries.length - 1].samples < 3
  const hasAnything = entries.length > 0 || !!local

  const mobileHint = !picked && !recording

  return (
    <div className="fixed inset-0 overflow-hidden bg-paper">
      <CampusMap insets={insets} mode="pick" onSiteTap={onTap} showGps={false} extraLayers={layers} />

      {/* 지도 위 한 줄 안내 */}
      {mobileHint && (
        <div
          className="pointer-events-none fixed left-1/2 z-20 flex -translate-x-1/2 justify-center lg:left-[calc(50%+14rem)]"
          style={{ top: isDesktop ? '1.5rem' : 'calc(var(--safe-top) + 0.75rem)', width: 'min(26rem, calc(100vw - 2rem))' }}
          aria-hidden="true"
        >
          <p className="glass-surface flex animate-fade-in items-center gap-2 rounded-full px-4 py-2 text-[0.8125rem] font-semibold text-navy shadow-float">
            <Crosshair size={16} strokeWidth={1.9} />
            서 있는 지점을 정확히 탭하세요
          </p>
        </div>
      )}

      {/* 지도 조작 */}
      <div className="fixed right-3 z-20 lg:bottom-6 lg:right-6" style={isDesktop ? undefined : { bottom: Math.round(panelH) + 12 }}>
        <MapControls api={campusApi} />
      </div>

      {/* 보정 패널: 데스크톱 좌측 카드 / 모바일 하단 시트 */}
      <aside
        ref={panelRef}
        aria-label="위치 보정 도구"
        className="glass-surface fixed inset-x-0 bottom-0 z-30 flex max-h-[min(58dvh,34rem)] break-keep flex-col rounded-t-panel border-b-0 shadow-panel lg:inset-x-auto lg:bottom-6 lg:left-6 lg:top-6 lg:max-h-none lg:w-[var(--panel-w)] lg:max-w-[calc(100vw-3rem)] lg:rounded-panel lg:border-b"
      >
        <div className="flex items-start gap-3 px-5 pb-2 pt-3 lg:pb-3 lg:pt-5">
          <div className="min-w-0 flex-1">
            <div className="eyebrow whitespace-nowrap text-gold-deep">
              Admin<span className="hidden lg:inline"> · Calibration</span>
            </div>
            <h1 className="mt-0.5 text-[1.25rem] font-bold leading-tight text-ink">위치 보정</h1>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            aria-controls="calib-body"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-mute hover:bg-paper-2 hover:text-ink lg:hidden"
            aria-label={collapsed ? '보정 도구 펼치기' : '보정 도구 접기'}
          >
            {collapsed ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
          <button type="button" onClick={goCampus} className="btn btn-ghost !min-h-10 !gap-1.5 !px-4 text-[0.8125rem]">
            <ArrowLeft size={16} aria-hidden="true" />
            나가기
          </button>
        </div>

        <div id="calib-body" className={`scroll-y min-h-0 flex-1 px-5 pb-6 ${collapsed ? 'hidden lg:block' : ''}`} style={{ paddingBottom: 'max(1.5rem, var(--safe-bottom))' }}>
          <div className="rounded-card border border-line bg-paper/70 px-3.5 py-2.5">
            <div className="eyebrow text-ink-mute">현재 위치 기준</div>
            <p className="mt-0.5 text-[0.875rem] font-semibold text-ink">{geoSourceLabel(geo)}</p>
            {local && (
              <p className="tnum mt-0.5 text-[0.75rem] text-ink-mute">
                이 기기에 {local.points.length}점 보정 저장됨 · {new Date(local.createdAt).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            )}
          </div>
          <ol className="mt-4 grid gap-5 lg:mt-5 lg:gap-6">
            <Step n={1} title="서 있는 지점을 지도에서 탭" done={!!picked || recording}>
              {picked ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="tnum">
                    선택한 지점 · {Math.round(picked[0])}, {Math.round(picked[1])} px
                  </p>
                  {!recording && (
                    <button type="button" className="rounded-full px-3 py-2 text-[0.8125rem] font-semibold text-navy hover:bg-paper-2" onClick={() => setPicked(null)}>
                      다시 선택
                    </button>
                  )}
                </div>
              ) : (
                <p>지도를 충분히 확대한 뒤, 지금 서 있는 지점(문 앞 계단·모서리처럼 눈에 띄는 곳이 좋아요)을 정확히 탭하세요.</p>
              )}
            </Step>

            <Step n={2} title="현재 위치 기록 (10초 평균)">
              {recording ? (
                <div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-paper-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(recorder.state.progress * 100)} aria-label="기록 진행률">
                    <div className="h-full rounded-full bg-primary transition-[width] duration-100 ease-linear" style={{ width: `${recorder.state.progress * 100}%` }} />
                  </div>
                  <p className="tnum mt-2" aria-live="polite">
                    측정 중 · {recorder.state.remainingSec}초 남음 · 표본 {recorder.state.samples}개
                    {recorder.state.lastAccuracy != null && ` · 정확도 ±${Math.round(recorder.state.lastAccuracy)} m`}
                  </p>
                  <p className="mt-0.5 text-[0.75rem] text-ink-mute">가만히 서 계세요. 기기를 흔들거나 걸으면 평균이 부정확해집니다.</p>
                  <button type="button" className="btn btn-ghost mt-3 w-full" onClick={recorder.cancel}>
                    기록 취소
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-primary w-full disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={!picked}
                    onClick={() => {
                      toast.dismiss('calib-note')
                      recorder.start()
                    }}
                  >
                    <LocateFixed size={18} strokeWidth={1.8} aria-hidden="true" />
                    현재 위치 기록 ({RECORD_MS / 1000}초)
                  </button>
                  {!picked && <p className="mt-1.5 text-[0.75rem] text-ink-mute">먼저 1단계에서 지점을 탭하세요.</p>}
                  {recorder.state.error && (
                    <p role="alert" className="mt-2 flex gap-2 rounded-card border border-danger/30 bg-danger/5 px-3 py-2 text-[0.8125rem] text-danger">
                      <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                      {recorder.state.error}
                    </p>
                  )}
                  {lowSamples && <p className="mt-2 text-[0.75rem] text-gold-deep">방금 점은 표본이 적어 불안정할 수 있어요. 기록 시간 동안 신호가 잘 잡히는 곳에서 다시 기록해 보세요.</p>}
                </>
              )}
            </Step>

            <Step n={3} title={`보정점 ${entries.length > 0 ? `(${entries.length})` : ''}`.trim()} done={!!result}>
              {entries.length === 0 ? (
                <p>아직 기록한 점이 없습니다. 1점이면 위치만 맞추고, 서로 떨어진 2점 이상이면 회전·배율까지 맞춥니다.</p>
              ) : (
                <>
                  <ul className="grid gap-2">
                    {entries.map((e, i) => (
                      <li key={`${i}-${e.point.px[0]}-${e.point.px[1]}`} className="rounded-card border border-line bg-surface/70 py-2 pl-2.5 pr-1">
                        <div className="flex items-center gap-2.5">
                          <span className="tnum grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-[0.75rem] font-bold text-white">{i + 1}</span>
                          <div className="min-w-0 flex-1 leading-tight">
                            <p className="tnum text-[0.8125rem] font-semibold text-ink">
                              {Math.round(e.point.px[0])}, {Math.round(e.point.px[1])} px
                            </p>
                            <p className="tnum truncate text-[0.6875rem] text-ink-mute">
                              {e.point.lat.toFixed(6)}, {e.point.lon.toFixed(6)}
                            </p>
                          </div>
                          <div className="shrink-0 text-right leading-tight">
                            <p className="text-[0.6875rem] text-ink-mute">잔차</p>
                            <p className={`tnum text-[0.9375rem] font-bold ${result ? residualTone(result.residuals[i] ?? 0) : 'text-ink-mute'}`}>
                              {result ? `${(result.residuals[i] ?? 0).toFixed(1)} m` : '—'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeEntry(i)}
                            disabled={recording}
                            aria-label={`${i + 1}번 점 삭제`}
                            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-mute hover:bg-paper-2 hover:text-danger disabled:opacity-40"
                          >
                            <Trash2 size={17} strokeWidth={1.8} />
                          </button>
                        </div>
                        <p className="tnum -mt-1 pb-1 pl-[2.125rem] pr-2 text-[0.6875rem] text-ink-mute">
                          정확도 ±{e.point.acc} m · 표본 {e.samples}개 · 흩어짐 {e.spreadM.toFixed(1)} m
                        </p>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-mute">
                    지도의 파란 번호 = 탭한 지점 · 초록 원 = GPS가 가리킨 위치(지금 적용 중인 기준) · 점선 = 둘의 차이
                  </p>

                  {result && (
                    <dl className="tnum mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-card bg-paper px-3.5 py-3 text-[0.8125rem]">
                      <dt className="text-ink-mute">방식</dt>
                      <dd className="text-right font-semibold text-ink">{METHOD_LABEL[result.method]}</dd>
                      <dt className="text-ink-mute">추정 오차</dt>
                      <dd className="text-right font-semibold text-ink">약 {result.rmsErrorM.toFixed(1)} m</dd>
                      <dt className="text-ink-mute">기본 대비 이동</dt>
                      <dd className="text-right font-semibold text-ink">약 {result.shiftFromBaseM.toFixed(1)} m</dd>
                      {result.method === 'similarity' && (
                        <>
                          <dt className="text-ink-mute">배율 · 회전</dt>
                          <dd className="text-right font-semibold text-ink">
                            {result.scaleChangePct >= 0 ? '+' : ''}
                            {result.scaleChangePct.toFixed(1)}% · {result.rotationDeltaDeg >= 0 ? '+' : ''}
                            {result.rotationDeltaDeg.toFixed(1)}°
                          </dd>
                          <dt className="text-ink-mute">점 사이 최대 거리</dt>
                          <dd className="text-right font-semibold text-ink">약 {Math.round(result.spanM)} m</dd>
                        </>
                      )}
                    </dl>
                  )}
                  {dupError && (
                    <p role="alert" className="mt-3 flex gap-2 rounded-card border border-danger/30 bg-danger/5 px-3 py-2 text-[0.8125rem] text-danger">
                      <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                      {dupError}
                    </p>
                  )}
                  {result && result.warnings.length > 0 && (
                    <ul className="mt-3 grid gap-2">
                      {result.warnings.map((w) => (
                        <li key={w} className="flex gap-2 rounded-card border border-gold/40 bg-gold-soft/50 px-3 py-2 text-[0.75rem] leading-relaxed text-gold-deep">
                          <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-mute">
                    추정 오차는 점별 잔차와 GPS 측정 정확도 중 큰 값입니다(점이 적으면 잔차가 0에 가까워도 오차를 낮게 잡지 않습니다).
                  </p>
                </>
              )}
            </Step>

            <Step n={4} title="적용 · 내보내기">
              <button type="button" className="btn btn-primary w-full disabled:cursor-not-allowed disabled:opacity-45" disabled={!result || recording} onClick={apply}>
                <Check size={18} strokeWidth={2} aria-hidden="true" />이 기기에 적용
              </button>
              <p className="mt-1.5 text-[0.75rem] text-ink-mute">이 브라우저에만 저장되어 즉시 &lsquo;내 위치&rsquo; 변환에 쓰입니다.</p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" className="btn btn-ghost !px-3 disabled:cursor-not-allowed disabled:opacity-45" disabled={!result} onClick={exportCopy}>
                  <Copy size={16} aria-hidden="true" />
                  JSON 복사
                </button>
                <button type="button" className="btn btn-ghost !px-3 disabled:cursor-not-allowed disabled:opacity-45" disabled={!result} onClick={exportDownload}>
                  <Download size={16} aria-hidden="true" />
                  다운로드
                </button>
              </div>
              <p className="mt-1.5 text-[0.75rem] leading-relaxed text-ink-mute">
                내보낸 JSON을 <code className="rounded bg-paper-2 px-1 py-0.5 text-[0.6875rem] text-ink [overflow-wrap:anywhere]">public/content/geo-calibration.json</code> 에 붙여넣고(파일 전체 교체 또는{' '}
                <code className="rounded bg-paper-2 px-1 py-0.5 text-[0.6875rem] text-ink [overflow-wrap:anywhere]">calibration</code> 값만) 다시 빌드하면 모든 기기에 적용됩니다.
              </p>

              {result && (
                <details open={previewOpen} onToggle={(e) => setPreviewOpen((e.currentTarget as HTMLDetailsElement).open)} className="mt-3 rounded-card border border-line bg-surface/60">
                  <summary className="cursor-pointer select-none rounded-card px-3.5 py-2.5 text-[0.8125rem] font-semibold text-navy">내보낼 JSON 미리보기</summary>
                  <pre className="scroll-y max-h-52 overflow-auto border-t border-line px-3.5 py-3 font-mono text-[0.6875rem] leading-relaxed text-ink-soft" tabIndex={0}>
                    {previewJson}
                  </pre>
                </details>
              )}

              <p className="mt-4 text-[0.75rem] leading-relaxed text-ink-mute">
                적용 우선순위 · <b className="font-semibold text-ink-soft">이 기기 저장값</b> &gt; geo-calibration.json &gt; 기본(OSM 공개지도 대조 추정, RMS 약 {Math.round(campus.geo.rmsErrorM)} m)
              </p>

              <div className="mt-3 border-t border-line pt-3">
                {confirmReset ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 text-[0.8125rem] font-semibold text-danger">기록한 점과 이 기기의 보정을 모두 지울까요?</p>
                    <button type="button" className="btn btn-ghost !min-h-10 !px-4 text-[0.8125rem]" onClick={() => setConfirmReset(false)}>
                      취소
                    </button>
                    <button type="button" className="btn !min-h-10 !bg-danger !px-4 text-[0.8125rem] text-white" onClick={reset}>
                      초기화
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[0.8125rem] font-semibold text-ink-soft hover:bg-paper-2 hover:text-danger disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={!hasAnything}
                    onClick={() => setConfirmReset(true)}
                  >
                    <RotateCcw size={15} aria-hidden="true" />
                    초기화 (기록·이 기기 보정 삭제)
                  </button>
                )}
              </div>
            </Step>
          </ol>
          <p className="mt-6 text-[0.6875rem] leading-relaxed text-ink-mute">
            현장 GPS 측정값은 이 기기 안에서만 계산되며 서버로 전송되지 않습니다. 저장되는 것은 보정 결과(변환 값과 기준점)뿐입니다.
          </p>
        </div>
      </aside>
    </div>
  )
}
