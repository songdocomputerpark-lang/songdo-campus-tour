// 위치 보정(Calibration) 저장소 + 현재 적용 중인 GeoTransform 제공.
// 적용 우선순위 (SPEC §4.8): localStorage(이 기기) > public/content/geo-calibration.json > campus.json 기본(OSM 추정)
// localStorage 에는 '보정 결과(변환행렬·점 목록)'만 저장하며, 실시간 GPS 좌표는 어디에도 저장하지 않는다.
import { useMemo } from 'react'
import { create } from 'zustand'
import { campus } from '../data'
import type { Calibration } from '../data/types'
import { isCalibration, useContent } from './content'
import { makeGeoTransform, type GeoTransform } from './geo'

export const CALIBRATION_STORAGE_KEY = 'songdo.geo.calibration.v1'

function readLocal(): Calibration | null {
  try {
    const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isCalibration(parsed) ? parsed : null
  } catch {
    return null
  }
}

interface CalibrationStore {
  /** 이 기기에 적용된 보정 */
  local: Calibration | null
  setLocal: (c: Calibration | null) => void
}

export const useCalibration = create<CalibrationStore>((set) => ({
  local: readLocal(),
  setLocal: (c) => {
    try {
      if (c) localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(c))
      else localStorage.removeItem(CALIBRATION_STORAGE_KEY)
    } catch {
      /* 저장 불가(사생활 보호 모드 등) — 메모리 상태만 갱신 */
    }
    set({ local: c })
  },
}))

/** "이 기기에 적용" */
export function saveLocalCalibration(c: Calibration): void {
  useCalibration.getState().setLocal(c)
}
/** "초기화" */
export function clearLocalCalibration(): void {
  useCalibration.getState().setLocal(null)
}

/** 현재 적용되는 변환기(우선순위 반영). GPS 레이어·보정 화면·About 이 공통으로 사용 */
export function useGeoTransform(): GeoTransform {
  const local = useCalibration((s) => s.local)
  const file = useContent((s) => s.calibration)
  return useMemo(() => {
    if (local) return makeGeoTransform(campus.geo, local, 'device-calibration')
    if (file) return makeGeoTransform(campus.geo, file, 'file-calibration')
    return makeGeoTransform(campus.geo)
  }, [local, file])
}

/** About 용 상태 문구 */
export function geoSourceLabel(t: GeoTransform): string {
  switch (t.source) {
    case 'device-calibration':
      return `현장 보정 적용 (이 기기, 오차 약 ${Math.round(t.rmsErrorM)} m)`
    case 'file-calibration':
      return `현장 보정 적용 (오차 약 ${Math.round(t.rmsErrorM)} m)`
    default:
      return `OSM 공개지도 대조 추정 (RMS 약 ${Math.round(t.rmsErrorM)} m)`
  }
}
