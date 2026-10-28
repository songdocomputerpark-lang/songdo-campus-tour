// 모달 대화상자 공통 동작: 포커스 이동·트랩, Esc 닫기, 배경 비활성(inert), 닫은 뒤 포커스 복귀.
// AboutModal 이 사용한다. 대화상자는 createPortal(…, document.body) 로 렌더할 것
// (backdrop-filter 를 가진 조상 안의 position:fixed 는 화면 전체를 덮지 못하기 때문).
import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

let lockCount = 0

/** 앱 루트(#root)를 inert 로 만들어 뒤 화면의 포커스·스크린리더 접근을 막는다 (중첩 안전) */
function lockBackground(): () => void {
  const root = typeof document !== 'undefined' ? document.getElementById('root') : null
  if (!root) return () => {}
  lockCount += 1
  root.setAttribute('inert', '')
  return () => {
    lockCount = Math.max(0, lockCount - 1)
    if (lockCount === 0) root.removeAttribute('inert')
  }
}

function visibleFocusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
}

export interface DialogOptions {
  /** 열릴 때 처음 포커스할 요소 (기본: 대화상자 자체) */
  initialFocus?: () => HTMLElement | null | undefined
}

export function useDialog<T extends HTMLElement>(open: boolean, onClose: () => void, options: DialogOptions = {}): RefObject<T> {
  const ref = useRef<T>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const optRef = useRef(options)
  optRef.current = options

  useEffect(() => {
    if (!open) return
    const node = ref.current
    if (!node) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const release = lockBackground()

    const target = optRef.current.initialFocus?.() ?? node
    target.focus({ preventScroll: true })

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = visibleFocusables(node)
      if (items.length === 0) {
        e.preventDefault()
        node.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === node || !node.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !node.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('keydown', onKey)
      release()
      // inert 해제 뒤 원래 있던 곳으로 포커스 복귀 (요소가 사라졌으면 생략)
      if (previous && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }, [open])

  return ref
}
