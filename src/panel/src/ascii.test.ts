import { describe, expect, it } from 'vitest'
import { asciiBar } from './ascii'

describe('asciiBar', () => {
  it('ma stałą liczbę komórek', () => {
    for (const v of [-1, 0, 0.13, 0.5, 0.99, 1, 2, NaN]) expect(asciiBar(v, 24)).toHaveLength(24)
  })

  it('0 i 1 to pusty i pełny pasek', () => {
    expect(asciiBar(0, 4)).toBe('░░░░')
    expect(asciiBar(1, 4)).toBe('████')
  })

  it('ułamek ostatniej komórki jako ▓ / ▒', () => {
    expect(asciiBar(0.5, 4)).toBe('██░░')
    expect(asciiBar(0.6, 4)).toBe('██▒░')
    expect(asciiBar(0.7, 4)).toBe('██▓░')
  })
})
