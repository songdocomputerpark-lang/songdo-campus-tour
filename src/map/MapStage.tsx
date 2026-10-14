// 지도 무대: 캠퍼스 배치도(CampusMap)와 층 평면도(FloorPlan)를 겹쳐 두고 크로스페이드로 전환한다.
//  캠퍼스 → (건물 줌: CampusMap 자체 카메라 애니메이션) → 층 선택 → 캠퍼스 페이드아웃(+살짝 확대) / 평면도 페이드인(+0.95→1)
//  FloorPlan 은 층 화면에 들어갈 때 마운트하고, 나간 뒤 전환이 끝나면 언마운트한다.
import { useEffect, useState } from 'react'
import type { Insets } from '../data/types'
import { useAppStore } from '../store/useAppStore'
import { CampusMap } from './CampusMap'
import { FloorPlan } from './FloorPlan'

export function MapStage({ insets }: { insets: Insets }) {
  const view = useAppStore((s) => s.view)
  const [mounted, setMounted] = useState(view === 'floor')
  const [front, setFront] = useState(view === 'floor')

  useEffect(() => {
    if (view === 'floor') {
      setMounted(true)
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setFront(true)))
      return () => cancelAnimationFrame(r)
    }
    setFront(false)
    const t = window.setTimeout(() => setMounted(false), 700)
    return () => window.clearTimeout(t)
  }, [view])

  const floorFront = view === 'floor' && front
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="stage-layer stage-campus" data-behind={floorFront}>
        <CampusMap active={!floorFront} insets={insets} />
      </div>
      {mounted && (
        <div className="stage-layer stage-floor" data-front={floorFront}>
          <FloorPlan active={floorFront} insets={insets} />
        </div>
      )}
    </div>
  )
}
