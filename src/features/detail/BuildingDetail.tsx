/**
 * features/detail/BuildingDetail.tsx — 건물 상세 (방은 선택하지 않고 건물만 선택된 상태, SPEC §4.4)
 *
 *  건물명 · 영문 · 규모(dims) → 건물 사진(photos["building-<id>"], 없으면 외곽선 모형 플레이스홀더)
 *  → 층/시설 수 요약 → 시설 구성(카테고리별 개수) → 층별 안내(층마다 시설 수·대표 시설, 탭하면 그 층 평면도로)
 *
 * 학생 안내 장소(★, content/tour.json)가 있는 건물이면 사진 위에 그 목록을 먼저 보여 준다 (탭하면 안내 코스의 그 지점으로).
 * 모든 수치는 floors.json / campus.json 에서 계산한다 (없는 정보를 만들지 않는다).
 * 사용: ui/Shell 이 캠퍼스 지도에서 건물을 선택했을 때(roomId 없음) 패널에 렌더하며, DetailPanel 도 roomId 없이 렌더되면 이 컴포넌트로 대체한다
 *   (export function BuildingDetail — props 없음, 스토어의 buildingId 사용).
 */
import { ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { campus, floorLabel, floorsOf, getBuilding } from '../../data'
import type { CategoryId } from '../../data/types'
import { tint } from '../../lib/color'
import { photosFor, useContent } from '../../lib/content'
import { CAT_KEEP } from '../../map/categoryTint'
import { useAppStore } from '../../store/useAppStore'
import { PanelHeader } from '../../ui/PanelHeader'
import { SpotMark } from '../tour/SpotChip'
import { spotFloorKey, useSpots } from '../tour/spots'
import { PhotoSlot } from './PhotoSlot'

const CAT_ORDER = Object.keys(campus.categories) as CategoryId[]

export function BuildingDetail() {
  const buildingId = useAppStore((s) => s.buildingId)
  const selectFloor = useAppStore((s) => s.selectFloor)
  const closePanel = useAppStore((s) => s.closePanel)
  const startTour = useAppStore((s) => s.startTour)
  const photos = useContent((s) => s.photos)
  const spots = useSpots()
  const building = getBuilding(buildingId)

  const floors = useMemo(() => (building ? floorsOf(building.id).reverse() : []), [building])
  const stats = useMemo(() => {
    const counts = new Map<CategoryId, number>()
    let rooms = 0
    for (const f of floors) {
      for (const r of f.rooms) {
        rooms++
        counts.set(r.cat, (counts.get(r.cat) ?? 0) + 1)
      }
    }
    return { rooms, byCat: CAT_ORDER.filter((c) => counts.has(c)).map((c) => ({ cat: c, n: counts.get(c) ?? 0 })) }
  }, [floors])

  if (!building) return null
  const bPhotos = photosFor(photos, `building-${building.id}`)
  const hasBasement = building.floors.includes('B1')
  const aboveGround = building.floors.filter((f) => f !== 'B1').length
  const here = spots.byBuilding.get(building.id) ?? []

  return (
    <article aria-label={`${building.name} 안내`}>
      <PanelHeader
        eyebrow={`Building ${building.code}`}
        title={building.name}
        subtitle={
          <>
            <span className="font-display text-[0.9375rem] italic tracking-[0.04em]">{building.en}</span>
            <span className="mx-1.5 text-line-strong" aria-hidden="true">
              ·
            </span>
            {building.dims}
          </>
        }
        accent={building.color}
        onClose={closePanel}
        closeLabel="건물 선택 해제"
      />

      <div key={building.id} className="animate-fade-in px-5 pb-8">
        {here.length > 0 && (
          <section className="mb-4 overflow-hidden rounded-card border border-star-deep/35 bg-star-soft/55" aria-labelledby="bd-spots">
            <h3 id="bd-spots" className="flex items-baseline gap-2.5 px-3.5 pb-1 pt-3">
              <span className="eyebrow text-gold-deep">Student Guide</span>
              <span className="text-[0.875rem] font-semibold text-ink">학생 안내 장소</span>
            </h3>
            <ul className="px-1.5 pb-1.5">
              {here.map((s) => (
                <li key={s.roomId}>
                  <button
                    type="button"
                    onClick={() => startTour(s.index)}
                    aria-label={`${s.no === null ? '출발 지점' : `학생 안내 장소 ${s.no}번`} ${s.label}, ${floorLabel(s.floorId)}. 안내 코스에서 보기`}
                    className="group flex min-h-[2.75rem] w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface/80"
                  >
                    <SpotMark spot={s} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9375rem] font-bold text-ink">{s.label}</span>
                      <span className="block truncate text-[0.75rem] text-ink-mute">
                        {floorLabel(s.floorId)}
                        {s.label !== s.roomName && ` · ${s.roomName}`}
                        {s.no === null && ' · 안내 코스 출발'}
                      </span>
                    </span>
                    <ChevronRight size={17} className="shrink-0 text-ink-mute transition-transform duration-180 group-hover:translate-x-0.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <PhotoSlot photos={bPhotos} alt={`${building.name} 사진`} buildingId={building.id} placeholderLabel="건물 사진 준비 중" />

        {/* 요약 지표 */}
        <dl className="mt-4 grid grid-cols-3 divide-x divide-line overflow-hidden rounded-card border border-line bg-surface/60 text-center">
          <Stat label="Floors" value={`${aboveGround}`} unit="층" note={hasBasement ? '+ 지하 1층' : '지상'} />
          <Stat label="Types" value={`${stats.byCat.length}`} unit="종" note="시설 유형" />
          <Stat label="Spaces" value={`${stats.rooms}`} unit="곳" note="도면 기준 시설" />
        </dl>

        {/* 시설 구성 */}
        {stats.byCat.length > 0 && (
          <section className="mt-6" aria-labelledby="bd-comp">
            <Title id="bd-comp" en="Composition" ko="시설 구성" />
            <ul className="flex flex-wrap gap-1.5">
              {stats.byCat.map(({ cat, n }) => (
                <li key={cat} className="chip">
                  <span className="h-2.5 w-2.5 rounded-[3px] border border-ink/15" style={{ background: tint(building.color, CAT_KEEP[cat]) }} aria-hidden="true" />
                  {campus.categories[cat]}
                  <span className="tnum font-semibold text-ink">{n}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 층별 안내 */}
        <section className="mt-6" aria-labelledby="bd-floors">
          <Title id="bd-floors" en="Floors" ko="층별 안내" />
          <ul className="grid gap-2">
            {floors.map((f) => {
              const named = f.rooms.filter((r) => r.cat !== 'classroom').slice(0, 3).map((r) => r.name)
              const fSpots = spots.byFloor.get(spotFloorKey(building.id, f.floor)) ?? []
              return (
                <li key={f.floor}>
                  <button
                    type="button"
                    onClick={() => selectFloor(f.floor, building.id)}
                    aria-label={`${building.name} ${floorLabel(f.floor)} 평면도 보기, 시설 ${f.rooms.length}곳${f.schematic ? ', 개략도' : ''}${fSpots.length ? `, 학생 안내 장소 ${fSpots.map((s) => s.label).join(', ')}` : ''}`}
                    className="group flex min-h-[3.5rem] w-full items-center gap-3.5 rounded-card border border-line bg-surface/70 px-3.5 py-2.5 text-left transition-[border-color,background-color,transform,box-shadow] duration-180 hover:border-navy/40 hover:bg-surface hover:shadow-soft active:scale-[0.99]"
                  >
                    <span className="grid h-10 w-12 shrink-0 place-items-center rounded-xl font-display text-[1.375rem] font-semibold leading-none text-white" style={{ background: building.color, fontVariantNumeric: 'lining-nums tabular-nums' }} aria-hidden="true">
                      {f.floor}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[0.9375rem] font-semibold text-ink">
                        {floorLabel(f.floor)}
                        <span className="tnum text-[0.8125rem] font-normal text-ink-mute">시설 {f.rooms.length}곳</span>
                        {f.schematic && <span className="rounded-full border border-gold/50 bg-gold-soft/60 px-1.5 text-[0.6875rem] font-semibold text-gold-deep">개략도</span>}
                      </span>
                      {fSpots.length > 0 ? (
                        <span className="mt-0.5 flex flex-wrap gap-1">
                          {fSpots.map((s) => (
                            <span key={s.roomId} className={`inline-flex items-center gap-1 rounded-full py-px pl-px pr-2 text-[0.75rem] font-bold ${s.no === null ? 'border border-gold-200 bg-gold-50 text-navy' : 'bg-star text-navy'}`}>
                              <SpotMark spot={s} size={16} />
                              {s.label}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="block truncate text-[0.8125rem] text-ink-mute">{named.length > 0 ? named.join(' · ') : '학급교실'}</span>
                      )}
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-ink-mute transition-transform duration-180 group-hover:translate-x-0.5" aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        <p className="mt-5 text-[0.75rem] leading-relaxed text-ink-mute">층을 선택하면 평면도로 이동합니다. 시설 명칭과 위치는 학교 도면 기준이며 실제와 일부 다를 수 있습니다.</p>
      </div>
    </article>
  )
}

function Title({ id, en, ko }: { id: string; en: string; ko: string }) {
  return (
    <h3 id={id} className="mb-2.5 flex items-baseline gap-2.5">
      <span className="eyebrow text-gold-deep">{en}</span>
      <span className="text-[0.875rem] font-semibold text-ink">{ko}</span>
    </h3>
  )
}

function Stat({ label, value, unit, note }: { label: string; value: string; unit: string; note: string }) {
  return (
    <div className="px-2 py-3">
      <dt className="eyebrow text-[0.625rem] text-ink-mute">{label}</dt>
      <dd className="m-0 mt-0.5">
        <span className="font-display text-[1.75rem] font-semibold leading-none text-navy" style={{ fontVariantNumeric: 'lining-nums tabular-nums' }}>
          {value}
        </span>
        <span className="ml-0.5 text-[0.8125rem] font-semibold text-ink-soft">{unit}</span>
        <span className="mt-1 block text-[0.6875rem] leading-tight text-ink-mute">{note}</span>
      </dd>
    </div>
  )
}
