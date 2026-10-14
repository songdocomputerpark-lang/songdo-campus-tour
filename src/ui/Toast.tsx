// 전역 토스트. 어디서든 `import { toast } from '../ui/Toast'` 후 toast('메시지') / toast.error('...') 호출.
// <ToastHost /> 는 Shell 에서 한 번만 렌더된다 (aria-live="polite").
import { create } from 'zustand'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

export type ToastKind = 'info' | 'success' | 'warn' | 'error'
export interface ToastOptions {
  kind?: ToastKind
  /** ms. 0 이면 직접 닫을 때까지 유지 (기본 4200) */
  duration?: number
  action?: { label: string; onClick: () => void }
  /** 같은 id 는 하나만 유지(교체) */
  id?: string
}
interface ToastItem {
  id: string
  message: string
  kind: ToastKind
  action?: { label: string; onClick: () => void }
}

interface ToastStore {
  items: ToastItem[]
  push: (message: string, opts?: ToastOptions) => string
  dismiss: (id: string) => void
}

let seq = 0
const timers = new Map<string, number>()

export const useToastStore = create<ToastStore>((set, get) => ({
  items: [],
  push: (message, opts = {}) => {
    const id = opts.id ?? `t${++seq}`
    const item: ToastItem = { id, message, kind: opts.kind ?? 'info', action: opts.action }
    set({ items: [...get().items.filter((t) => t.id !== id), item].slice(-3) })
    const prev = timers.get(id)
    if (prev) window.clearTimeout(prev)
    const duration = opts.duration ?? 4200
    if (duration > 0) timers.set(id, window.setTimeout(() => get().dismiss(id), duration))
    return id
  },
  dismiss: (id) => {
    const t = timers.get(id)
    if (t) window.clearTimeout(t)
    timers.delete(id)
    set({ items: get().items.filter((x) => x.id !== id) })
  },
}))

type Sub = Omit<ToastOptions, 'kind'>
/** toast('저장했습니다') · toast.success · toast.warn · toast.error · toast.dismiss(id) */
export const toast = Object.assign((message: string, opts?: ToastOptions) => useToastStore.getState().push(message, opts), {
  info: (m: string, o?: Sub) => useToastStore.getState().push(m, { ...o, kind: 'info' }),
  success: (m: string, o?: Sub) => useToastStore.getState().push(m, { ...o, kind: 'success' }),
  warn: (m: string, o?: Sub) => useToastStore.getState().push(m, { ...o, kind: 'warn' }),
  error: (m: string, o?: Sub) => useToastStore.getState().push(m, { ...o, kind: 'error' }),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
})

const ICONS = { info: Info, success: CheckCircle2, warn: AlertCircle, error: AlertCircle } as const
const TONE = {
  info: 'text-navy',
  success: 'text-leaf',
  warn: 'text-gold-deep',
  error: 'text-danger',
} as const

export function ToastHost() {
  const items = useToastStore((s) => s.items)
  const dismiss = useToastStore((s) => s.dismiss)
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
      style={{ top: 'calc(var(--safe-top) + 4.25rem)' }}
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      {items.map((t) => {
        const Icon = ICONS[t.kind]
        return (
          <div
            key={t.id}
            className="glass-surface pointer-events-auto flex max-w-[min(32rem,100%)] animate-fade-up items-start gap-2.5 rounded-2xl py-2.5 pl-3.5 pr-2 shadow-panel"
          >
            <Icon size={18} className={`mt-0.5 shrink-0 ${TONE[t.kind]}`} aria-hidden="true" />
            <p className="min-w-0 flex-1 py-0.5 text-[0.875rem] leading-snug text-ink">{t.message}</p>
            {t.action && (
              <button
                type="button"
                className="shrink-0 rounded-full px-2.5 py-1 text-[0.8125rem] font-semibold text-navy hover:bg-paper-2"
                onClick={() => {
                  t.action?.onClick()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-mute hover:bg-paper-2"
              onClick={() => dismiss(t.id)}
              aria-label="알림 닫기"
            >
              <X size={15} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
