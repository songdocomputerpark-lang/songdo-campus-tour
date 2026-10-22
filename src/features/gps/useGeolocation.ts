/**
 * features/gps/useGeolocation.ts — 위치 추적 수명주기 (SPEC §4.7)
 *
 * store.gps ↔ PositionProvider 연결.
 *   request()  첫 사용이면 안내 시트(status 'consent'), 이미 동의했으면 바로 start().
 *              미지원·비보안 연결이면 시트 없이 곧바로 친절한 토스트로 안내한다.
 *   start()    status 'requesting' → 첫 fix 에서 'tracking'. 권한 거부/미지원/비보안은 구독을 끝내고 status 에 반영.
 *              시간 초과·일시적 불가는 (첫 fix 전에만) status 'timeout'/'error' 로 알리되 구독은 유지해 신호가 잡히면 자동 복귀.
 *   stop()     구독 해제 + gps 초기화.
 *
 * 규칙
 *   · 구독은 모듈 단위로 1개 — 여러 컴포넌트(툴바·상태 칩)가 훅을 써도 중복 watch 없음.
 *   · 화면이 숨겨지면(visibilitychange) 구독을 잠시 멈추고 돌아오면 이어 간다. pagehide 에서는 완전히 해제.
 *   · 좌표는 메모리(zustand gps.fix)에만 둔다. localStorage·네트워크·콘솔 어디에도 쓰지 않는다.
 *     (저장하는 것은 '이번 세션에서 안내에 동의했다'는 불리언 플래그 하나뿐 — sessionStorage)
 */
import { useCallback, useEffect } from 'react'
import { focusSitePoint, getMapApi } from '../../map/mapBus'
import { useAppStore, type GpsFix, type GpsStatus } from '../../store/useAppStore'
import { toast } from '../../ui/Toast'
import { resetLowLatch, updateLowLatch, formatDistance, type FixAssessment } from './assess'
import { getPositionProvider, type PositionError, type PositionProvider } from './positioning'
import { useFixAssessment } from './useFixAssessment'

export { useFixAssessment }

const CONSENT_KEY = 'songdo.gps.consented'
/** 내 위치로 이동할 때의 최소 배율 — 화면 가로로 대략 50~60 m 가 보이는 정도 */
const FOCUS_K = 0.8

// ───────────── 모듈 상태 ─────────────
let unsubscribe: (() => void) | null = null
/** 사용자가 추적을 켜 둔 상태 (화면 숨김 후 복귀 시 재개 판단) */
let wanted = false
let pausedByHidden = false
/** 첫 '좋은' fix 에서 한 번만 내 위치로 카메라 이동 */
let autoCentered = false
let lifecycleBound = false

function readConsent(): boolean {
  try {
    return sessionStorage.getItem(CONSENT_KEY) === '1'
  } catch {
    return false
  }
}
function writeConsent(): void {
  try {
    sessionStorage.setItem(CONSENT_KEY, '1')
  } catch {
    /* 저장 불가 — 메모리 상태만 사용 */
  }
}
// 같은 세션에서 새로고침해도 안내 시트를 반복해서 보이지 않게
if (readConsent()) useAppStore.getState().setGps({ consented: true })

function endWatch(): void {
  unsubscribe?.()
  unsubscribe = null
}

// ───────────── 오류 문구(친절한 토스트) ─────────────

const GENTLE_TAIL = '지도는 지금처럼 자유롭게 둘러보세요.'

function failToast(code: PositionError['code'], fallback: string): void {
  switch (code) {
    case 'denied':
      toast.warn(`위치 권한이 꺼져 있어요. 브라우저 설정에서 허용하면 내 위치를 볼 수 있어요. ${GENTLE_TAIL}`, { id: 'gps-fail', duration: 7000 })
      break
    case 'unsupported':
      toast.warn(`이 기기(브라우저)는 위치 기능을 지원하지 않아요. ${GENTLE_TAIL}`, { id: 'gps-fail', duration: 6000 })
      break
    case 'insecure':
      toast.warn(`위치 기능은 보안 연결(https://)에서만 사용할 수 있어요. 주소를 https:// 로 열어 주세요. ${GENTLE_TAIL}`, { id: 'gps-fail', duration: 8000 })
      break
    case 'timeout':
      toast.warn('위치 신호를 아직 찾지 못했어요. 하늘이 트인 실외에서 잠시 기다려 주세요.', {
        id: 'gps-fail',
        duration: 6000,
        action: { label: '다시 시도', onClick: () => startTracking() },
      })
      break
    default:
      toast.warn(fallback || '현재 위치를 확인할 수 없어요. 잠시 후 다시 시도해 주세요.', { id: 'gps-fail', duration: 6000 })
  }
}

const FATAL_STATUS = { denied: 'denied', unsupported: 'unsupported', insecure: 'insecure' } as const

function handleFix(fix: GpsFix): void {
  updateLowLatch(fix.accuracy)
  toast.dismiss('gps-fail')
  useAppStore.getState().setGps({ status: 'tracking', fix, error: null })
}

function handleError(err: PositionError): void {
  const store = useAppStore.getState()
  if (err.code === 'denied' || err.code === 'unsupported' || err.code === 'insecure') {
    endWatch()
    wanted = false
    resetLowLatch()
    store.setGps({ status: FATAL_STATUS[err.code], error: err.message, fix: null })
    failToast(err.code, err.message)
    return
  }
  // 시간 초과·일시적 불가 — 이미 위치를 받은 적이 있으면 마지막 위치를 유지하고 조용히 재시도를 기다린다
  if (store.gps.fix) return
  const status: GpsStatus = err.code === 'timeout' ? 'timeout' : 'error'
  if (store.gps.status !== status) {
    store.setGps({ status, error: err.message })
    failToast(err.code, err.message)
  }
}

function bindLifecycle(): void {
  if (lifecycleBound || typeof document === 'undefined') return
  lifecycleBound = true
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (unsubscribe) {
        endWatch()
        pausedByHidden = true
      }
    } else if (pausedByHidden && wanted) {
      pausedByHidden = false
      unsubscribe = getPositionProvider().subscribe(handleFix, handleError)
    }
  })
  window.addEventListener('pagehide', () => {
    endWatch()
    pausedByHidden = false
  })
}

function blockedReason(provider: PositionProvider): PositionError | null {
  if (provider.availability) return provider.availability()
  return provider.isSupported() ? null : { code: 'unsupported', message: '이 기기(브라우저)는 위치 기능을 지원하지 않아요.' }
}

/** 구독 시작(이미 있으면 교체). 동의 이후에만 호출한다 */
function startTracking(): void {
  const provider = getPositionProvider()
  const blocked = blockedReason(provider)
  const store = useAppStore.getState()
  bindLifecycle()
  endWatch()
  pausedByHidden = false
  autoCentered = false
  resetLowLatch()
  wanted = true
  writeConsent()
  store.setGps({ status: 'requesting', error: null, consented: true })
  if (blocked) {
    handleError(blocked)
    return
  }
  unsubscribe = provider.subscribe(handleFix, handleError)
}

function stopTracking(): void {
  wanted = false
  pausedByHidden = false
  endWatch()
  resetLowLatch()
  autoCentered = false
  toast.dismiss('gps-fail')
  useAppStore.getState().resetGps()
}

function requestTracking(): void {
  const store = useAppStore.getState()
  const { status, consented } = store.gps
  if (status === 'tracking' || status === 'requesting') return
  const provider = getPositionProvider()
  // 안내 시트를 보여 주기 전에, 어차피 안 될 환경이면 바로 알려 준다
  const blocked = blockedReason(provider)
  if (blocked) {
    handleError(blocked)
    return
  }
  if (consented || store.gps.consented) startTracking()
  else store.setGps({ status: 'consent', error: null })
}

/** 훅 밖에서 추적을 끌 때(예: 보정 화면 진입) */
export const stopLocationTracking = stopTracking

// ───────────── 훅 ─────────────

export function useGeolocation() {
  const gps = useAppStore((s) => s.gps)
  const start = useCallback(() => startTracking(), [])
  const stop = useCallback(() => stopTracking(), [])
  const request = useCallback(() => requestTracking(), [])
  /** 구독이 살아 있는 상태 (신호 대기 중 포함) */
  const watching = gps.status === 'requesting' || gps.status === 'tracking' || gps.status === 'timeout' || gps.status === 'error'
  return { gps, request, start, stop, watching }
}

/**
 * "내 위치로 이동". 층 평면도에서는 캠퍼스 지도로 돌아간 뒤 이동한다.
 * 정확도가 낮거나 학교 밖이면 이동하지 않고 이유를 토스트로 알린다.
 */
export function useRecenter(): () => void {
  const a = useFixAssessment()
  return useCallback(() => {
    if (!a) {
      toast.info('아직 위치를 받지 못했어요. 잠시만 기다려 주세요.', { id: 'gps-note' })
      return
    }
    if (a.quality === 'off-campus') {
      toast.info(`학교 밖에 계십니다 · ${formatDistance(a.distanceToCampusM)}`, { id: 'gps-note' })
      return
    }
    if (a.quality === 'low-accuracy') {
      toast.warn('정확도가 낮습니다 — 실외에서 잠시 기다려 주세요', { id: 'gps-note' })
      return
    }
    const k = Math.max(getMapApi('campus')?.getTransform().k ?? 0, FOCUS_K)
    const st = useAppStore.getState()
    if (st.view === 'floor') {
      st.goCampus()
      window.setTimeout(() => focusSitePoint(a.px, { k }), 140) // 캠퍼스 지도 복귀(맞춤 이동) 뒤에 이동
    } else {
      focusSitePoint(a.px, { k })
    }
  }, [a])
}

/** 첫 '좋은' fix 를 받으면 한 번만 내 위치로 카메라 이동 (건물·투어를 보고 있으면 방해하지 않는다) */
export function useAutoCenter(a: FixAssessment | null): void {
  useEffect(() => {
    if (!a || autoCentered || a.quality !== 'good') return
    autoCentered = true
    const st = useAppStore.getState()
    if (st.view === 'campus' && !st.buildingId && !st.tour.active && !st.event.active && st.screen === 'map') {
      focusSitePoint(a.px, { k: Math.max(getMapApi('campus')?.getTransform().k ?? 0, FOCUS_K) })
    }
  }, [a])
}
