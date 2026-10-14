// 범례: 현재 층에 실제로 존재하는 카테고리 색 + 코어 아이콘만 표시
import { campus } from '../data'
import type { Building, CoreType, Floor } from '../data/types'
import { tint } from '../lib/color'
import { CAT_KEEP } from './categoryTint'
import { CORE_LABELS, CoreIconInline } from './icons'

const CORE_ORDER: CoreType[] = ['stairs', 'elevator', 'toilet', 'aed', 'kit', 'entrance', 'bridge']

export function Legend({ floor, building, className = '' }: { floor: Floor; building: Building; className?: string }) {
  const cats = Array.from(new Set(floor.rooms.map((r) => r.cat))).sort((a, b) => CAT_KEEP[b] - CAT_KEEP[a])
  const cores = CORE_ORDER.filter((t) => floor.cores.some((c) => c.type === t))
  return (
    <section aria-label="범례" className={`glass-surface rounded-2xl p-3.5 shadow-float ${className}`}>
      <h3 className="eyebrow mb-2 text-ink-mute">Legend · 범례</h3>
      <ul className="grid gap-1.5">
        {cats.map((c) => (
          <li key={c} className="flex items-center gap-2.5 text-[0.8125rem] text-ink-soft">
            <span
              className="h-4 w-6 shrink-0 rounded-[4px] border"
              style={{ background: tint(building.color, CAT_KEEP[c]), borderColor: 'rgb(11 18 32 / 0.18)' }}
              aria-hidden="true"
            />
            {campus.categories[c]}
          </li>
        ))}
      </ul>
      {cores.length > 0 && (
        <ul className="mt-2.5 grid gap-1.5 border-t border-line pt-2.5">
          {cores.map((t) => (
            <li key={t} className="flex items-center gap-2.5 text-[0.8125rem] text-ink-soft">
              <span className="grid h-5 w-6 shrink-0 place-items-center text-navy">
                <CoreIconInline type={t} size={18} />
              </span>
              {CORE_LABELS[t]}
            </li>
          ))}
        </ul>
      )}
      {floor.schematic && <p className="mt-2.5 border-t border-line pt-2.5 text-[0.75rem] leading-snug text-ink-mute">이 층은 개략도입니다. 실제 구조와 다를 수 있습니다.</p>}
    </section>
  )
}
