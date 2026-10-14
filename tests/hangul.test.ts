import { describe, expect, it } from 'vitest'
import { extractChoseong, hangulMatch, hangulScore, indexOfHangul, isChoseongJamo, isChoseongQuery, normalizeQuery } from '../src/lib/hangul'

describe('초성 추출', () => {
  it('완성형 한글에서 초성만 뽑는다', () => {
    expect(extractChoseong('도서관')).toBe('ㄷㅅㄱ')
    expect(extractChoseong('학생회실')).toBe('ㅎㅅㅎㅅ')
    expect(extractChoseong('쌍용 까치')).toBe('ㅆㅇㄲㅊ')
  })
  it('한글이 아닌 글자는 유지(소문자), 공백 제거', () => {
    expect(extractChoseong('AI 융합실')).toBe('aiㅇㅎㅅ')
    expect(extractChoseong('1-1')).toBe('1-1')
  })
  it('자모 판별', () => {
    expect(isChoseongJamo('ㄱ')).toBe(true)
    expect(isChoseongJamo('가')).toBe(false)
    expect(isChoseongQuery('ㄷㅅㄱ')).toBe(true)
    expect(isChoseongQuery(' ㄷ ㅅ ㄱ ')).toBe(true)
    expect(isChoseongQuery('도ㅅㄱ')).toBe(false)
    expect(isChoseongQuery('')).toBe(false)
  })
})

describe('매처', () => {
  it('초성 검색: ㄷㅅㄱ → 도서관', () => {
    expect(hangulMatch('도서관', 'ㄷㅅㄱ')).toBe(true)
    expect(hangulMatch('도서관동', 'ㄷㅅㄱ')).toBe(true)
    expect(hangulMatch('체육관', 'ㄷㅅㄱ')).toBe(false)
  })
  it('초성+글자 혼합: 도ㅅ관', () => {
    expect(hangulMatch('도서관', '도ㅅ관')).toBe(true)
    expect(hangulMatch('도서관', '도ㅂ관')).toBe(false)
  })
  it('공백/구두점 무시', () => {
    expect(hangulMatch('학생 회실', '학생회')).toBe(true)
    expect(hangulMatch('학생회실', '학 생 회')).toBe(true)
    expect(hangulMatch('홈베이스(숲터)', '홈베이스 숲터')).toBe(true)
    expect(normalizeQuery(' 1 - 1 ')).toBe('11')
  })
  it('부분 일치 위치와 영문 대소문자', () => {
    expect(indexOfHangul(normalizeQuery('본관동 2층'), normalizeQuery('2층'))).toBeGreaterThan(0)
    expect(hangulMatch('AI 융합실', 'ai')).toBe(true)
    expect(hangulMatch('', 'a')).toBe(false)
    expect(hangulMatch('도서관', '')).toBe(false)
  })
  it('점수: 완전일치 > 접두 > 부분 > 초성', () => {
    const exact = hangulScore('도서관', '도서관')
    const prefix = hangulScore('도서관동', '도서관')
    const inner = hangulScore('열린 도서관', '도서관')
    const cho = hangulScore('도서관', 'ㄷㅅㄱ')
    expect(exact).toBeGreaterThan(prefix)
    expect(prefix).toBeGreaterThan(inner)
    expect(inner).toBeGreaterThan(cho)
    expect(cho).toBeGreaterThan(0)
    expect(hangulScore('체육관', '도서관')).toBe(0)
  })
})
