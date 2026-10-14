// 카테고리별 건물색 농도 (1 = 원색, 0 = 흰색). 학급교실이 가장 진하고 부속 공간이 가장 연하다.
import type { CategoryId } from '../data/types'

export const CAT_KEEP: Record<CategoryId, number> = {
  classroom: 0.64,
  learning: 0.52,
  hall: 0.56,
  sports: 0.5,
  dining: 0.48,
  study: 0.45,
  student: 0.42,
  amenity: 0.32,
  office: 0.27,
  support: 0.15,
}
