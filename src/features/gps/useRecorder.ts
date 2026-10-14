// 보정용 "현재 위치 기록" — 10초 동안 위치 공급자를 직접 구독해 표본을 모으고 평균낸다.
// 앱의 "내 위치"(store.gps) 와 독립이며, 모은 표본은 이 훅의 지역 변수에만 있다가 평균값 1개만 남기고 버려진다.
import { useCallback, useEffect, useRef, useState } from 'react'
import { averageFixes, type AveragedFix } from './calibrationFit'
import { getPositionProvider, type GpsFix, type PositionError } from './positioning'

export const RECORD_MS = 10_000

export interface RecorderState {
  phase: 'idle' | 'recording'
  /** 0..1 */
  progress: number
  remainingSec: number
  samples: number
  /** 마지막 표본의 보고 정확도(m) */
  lastAccuracy: number | null
  /** 마지막 기록의 실패 사유 (성공하면 null) */
  error: string | null
}

const IDLE: RecorderState = { phase: 'idle', progress: 0, remainingSec: RECORD_MS / 1000, samples: 0, lastAccuracy: null, error: null }

function messageFor(err: PositionError): string {
  switch (err.code) {
    case 'denied':
      return '위치 권한이 꺼져 있어 기록할 수 없어요. 브라우저의 사이트 설정에서 위치를 허용해 주세요.'
    case 'unsupported':
      return '이 기기(브라우저)는 위치 기능을 지원하지 않아요. 스마트폰으로 열어 주세요.'
    case 'insecure':
      return '위치 기능은 보안 연결(https://)에서만 사용할 수 있어요. 주소를 https:// 로 열어 주세요.'
    case 'timeout':
      return '위치 신호를 찾지 못했어요. 하늘이 트인 실외에서 다시 시도해 주세요.'
    default:
      return '현재 위치를 확인할 수 없어요. 잠시 후 다시 시도해 주세요.'
  }
}

export function useRecorder(onDone: (avg: AveragedFix) => void) {
  const [state, setState] = useState<RecorderState>(IDLE)
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  const cleanupRef = useRef<(() => void) | null>(null)

  const cancel = useCallback(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
    setState(IDLE)
  }, [])

  const start = useCallback(() => {
    cleanupRef.current?.()
    const fixes: GpsFix[] = []
    const t0 = performance.now()
    const wallStart = Date.now()
    let lastErr: PositionError | null = null
    let finished = false
    let unsub: () => void = () => {}
    let timer = 0

    const finish = (failure: string | null) => {
      if (finished) return
      finished = true
      unsub()
      window.clearInterval(timer)
      cleanupRef.current = null
      const avg = failure ? null : averageFixes(fixes)
      if (avg) {
        setState(IDLE)
        doneRef.current(avg)
      } else {
        setState({ ...IDLE, error: failure ?? (lastErr ? messageFor(lastErr) : messageFor({ code: 'timeout', message: '' })) })
      }
    }

    unsub = getPositionProvider().subscribe(
      (fix) => {
        // maximumAge 때문에 캐시된 이전 위치가 섞일 수 있어, 기록 시작 직전보다 오래된 표본은 버린다
        if (fix.timestamp < wallStart - 1000) return
        fixes.push(fix)
      },
      (err) => {
        lastErr = err
        if (err.code === 'denied' || err.code === 'unsupported' || err.code === 'insecure') finish(messageFor(err))
      },
    )

    // 비보안 연결·미지원처럼 구독 즉시 실패한 경우
    if (finished) return

    timer = window.setInterval(() => {
      const elapsed = performance.now() - t0
      if (elapsed >= RECORD_MS) {
        finish(null)
        return
      }
      setState({
        phase: 'recording',
        progress: elapsed / RECORD_MS,
        remainingSec: Math.ceil((RECORD_MS - elapsed) / 1000),
        samples: fixes.length,
        lastAccuracy: fixes.length ? fixes[fixes.length - 1].accuracy : null,
        error: null,
      })
    }, 100)

    cleanupRef.current = () => {
      finished = true
      unsub()
      window.clearInterval(timer)
    }
    setState({ ...IDLE, phase: 'recording' })
  }, [])

  // 화면을 떠나면 구독 해제
  useEffect(() => () => cleanupRef.current?.(), [])

  return { state, start, cancel }
}
