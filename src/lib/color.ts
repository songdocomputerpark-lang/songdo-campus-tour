// 색 유틸: 건물 색(hex)에서 카테고리 명도/그림자/가독 텍스트색을 산출한다.
export type RGB = [number, number, number]

export function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex([r, g, b]: RGB): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** a 와 b 를 t(0..1) 비율로 섞음 (t=0 → a, t=1 → b) */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return rgbToHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t])
}

/** 건물 색을 white 와 섞어 연하게: keep=1 이면 원색, 0 이면 흰색 */
export function tint(hex: string, keep: number, base = '#ffffff'): string {
  return mix(base, hex, keep)
}
export function shade(hex: string, amount: number): string {
  return mix(hex, '#0b1220', amount)
}

export function luminance(hex: string): number {
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** 배경색 위에서 AA 대비를 만족하는 글자색 */
export function readableOn(bg: string, dark = '#111827', light = '#ffffff'): string {
  return contrast(bg, dark) >= contrast(bg, light) ? dark : light
}
