/**
 * features/gps/positioning.ts — 위치 공급자 추상화 (SPEC §4.7 "확장 구조")
 *
 * 지금은 브라우저 Geolocation(GeolocationProvider)만 구현한다. 나중에 실내 측위(BLE 비콘·Wi-Fi RTT 등) 공급자를
 * 같은 `PositionProvider` 인터페이스로 구현해 `setPositionProvider()` 로 교체(또는 합성)하면 나머지 코드는 그대로 동작한다.
 *   - 공급자가 내보내는 `GpsFix` 의 좌표계는 위경도(WGS84). 실내 측위가 층 정보를 줄 수 있게 되면 GpsFix 에 선택 필드를
 *     추가하면 된다(현재는 실외 위치만 다룬다).
 *   - 좌표는 메모리(zustand gps.fix)에만 둔다. 저장·전송·로깅 금지 (SPEC §0).
 *   - watchPosition({ enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }).
 *   - 오류 코드 → PositionErrorCode: PERMISSION_DENIED=denied, POSITION_UNAVAILABLE=unavailable, TIMEOUT=timeout.
 *   - HTTPS 가 아니면(localhost·127.0.0.1·[::1] 은 보안 컨텍스트로 취급됨) 'insecure' 로 즉시 오류.
 */
import type { GpsFix } from '../../store/useAppStore'

export type { GpsFix }

export type PositionErrorCode = 'denied' | 'unavailable' | 'timeout' | 'unsupported' | 'insecure'
export interface PositionError {
  code: PositionErrorCode
  message: string
}

export interface PositionProvider {
  readonly id: string
  isSupported(): boolean
  /**
   * 구독 전에 알 수 있는 사용 불가 사유(미지원·비보안 연결). 없으면 null.
   * 동의 시트를 보여 주기 전에 미리 안내하는 데 쓴다.
   */
  availability?(): PositionError | null
  /** 구독 시작. 반환값(해제 함수)을 호출하면 중지 */
  subscribe(onFix: (fix: GpsFix) => void, onError: (err: PositionError) => void): () => void
}

const MSG_UNSUPPORTED = '이 기기(브라우저)는 위치 기능을 지원하지 않아요. 지도는 그대로 자유롭게 둘러볼 수 있습니다.'
const MSG_INSECURE = '위치 기능은 보안 연결(https://)에서만 사용할 수 있어요. 주소를 https:// 로 열어 주세요.'

function isValidFix(lat: number, lon: number, accuracy: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    Number.isFinite(accuracy) &&
    !(lat === 0 && lon === 0)
  )
}

export class GeolocationProvider implements PositionProvider {
  readonly id = 'geolocation'

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'geolocation' in navigator
  }

  availability(): PositionError | null {
    if (!this.isSupported()) return { code: 'unsupported', message: MSG_UNSUPPORTED }
    if (typeof window !== 'undefined' && window.isSecureContext === false) return { code: 'insecure', message: MSG_INSECURE }
    return null
  }

  subscribe(onFix: (fix: GpsFix) => void, onError: (err: PositionError) => void): () => void {
    const blocked = this.availability()
    if (blocked) {
      onError(blocked)
      return () => {}
    }
    let watchId: number
    try {
      watchId = navigator.geolocation.watchPosition(
        (p) => {
          const { latitude: lat, longitude: lon, accuracy } = p.coords
          if (!isValidFix(lat, lon, accuracy)) return
          onFix({
            lat,
            lon,
            accuracy,
            // 정지 중에는 heading 이 NaN/null — 숫자일 때만 사용
            heading: typeof p.coords.heading === 'number' && Number.isFinite(p.coords.heading) ? p.coords.heading : null,
            speed: typeof p.coords.speed === 'number' && Number.isFinite(p.coords.speed) ? p.coords.speed : null,
            timestamp: p.timestamp,
          })
        },
        (e) => {
          const code: PositionErrorCode = e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable'
          onError({ code, message: e.message })
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
      )
    } catch {
      // 정책(Permissions-Policy)·임베드 환경 등에서 호출 자체가 막힌 경우
      onError({ code: 'unavailable', message: '현재 위치를 확인할 수 없어요.' })
      return () => {}
    }
    return () => {
      try {
        navigator.geolocation.clearWatch(watchId)
      } catch {
        /* ignore */
      }
    }
  }
}

/** 기본 공급자(브라우저 Geolocation) */
export const defaultProvider: PositionProvider = new GeolocationProvider()

let active: PositionProvider = defaultProvider

/** 앱이 현재 사용하는 공급자 */
export function getPositionProvider(): PositionProvider {
  return active
}

/** 실내 측위 공급자 등으로 교체 (예: BLE → setPositionProvider(new BleProvider())) */
export function setPositionProvider(p: PositionProvider): void {
  active = p
}
