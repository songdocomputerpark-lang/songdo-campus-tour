/**
 * features/detail/PhotoSlot.tsx — "사진 영역" 한 덩어리: Gallery(→ 탭 시 lazy Lightbox) 또는 PhotoPlaceholder.
 *
 * 시설 상세·건물 상세·투어 카드가 같은 방식으로 사진을 보여 주도록 묶어 둔 편의 컴포넌트다.
 *   photos 가 있으면 Gallery + 라이트박스, 없으면 건물 색 플레이스홀더(roomId 가 있으면 미니맵에 위치 강조).
 * Lightbox 는 React.lazy 로 분리되어 처음 쓸 때(또는 호버/포커스 시 미리) 내려받는다.
 */
import { lazy, Suspense, useState } from 'react'
import type { BuildingId, PhotoItem } from '../../data/types'
import { Gallery } from './Gallery'
import { PhotoPlaceholder } from './PhotoPlaceholder'

const Lightbox = lazy(() => import('./Lightbox'))
const prefetchLightbox = () => {
  void import('./Lightbox')
}

export interface PhotoSlotProps {
  photos: PhotoItem[]
  /** 사진 대체 텍스트의 기본값이자 라이트박스 제목 (예: "본관동 2층 1-1") */
  alt: string
  buildingId: BuildingId
  /** 시설 상세/투어일 때: 플레이스홀더 미니맵에 위치를 표시할 방 */
  roomId?: string
  placeholderLabel?: string
  autoplay?: boolean
  autoplayMs?: number
  autoplayLoop?: boolean
  onInteract?: () => void
  onIndexChange?: (index: number, source: 'user' | 'auto') => void
  /** 크기·모서리 (기본 16:9) */
  className?: string
}

export function PhotoSlot({
  photos,
  alt,
  buildingId,
  roomId,
  placeholderLabel,
  autoplay,
  autoplayMs,
  autoplayLoop,
  onInteract,
  onIndexChange,
  className = 'aspect-[16/9]',
}: PhotoSlotProps) {
  const [open, setOpen] = useState<number | null>(null)

  if (photos.length === 0) {
    return <PhotoPlaceholder buildingId={buildingId} roomId={roomId} label={placeholderLabel} className={`rounded-card ${className}`} />
  }
  return (
    <div className="contents" onPointerEnter={prefetchLightbox} onFocus={prefetchLightbox}>
      <Gallery
        photos={photos}
        alt={alt}
        autoplay={autoplay}
        autoplayMs={autoplayMs}
        autoplayLoop={autoplayLoop}
        onInteract={onInteract}
        onIndexChange={onIndexChange}
        onOpen={setOpen}
        buildingId={buildingId}
        roomId={roomId}
        className={className}
      />
      {open !== null && (
        <Suspense fallback={null}>
          <Lightbox photos={photos} index={Math.min(open, photos.length - 1)} onIndexChange={setOpen} onClose={() => setOpen(null)} alt={alt} />
        </Suspense>
      )}
    </div>
  )
}
