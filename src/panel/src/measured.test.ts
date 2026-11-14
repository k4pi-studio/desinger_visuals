import { describe, expect, it } from 'vitest'
import type { Graph } from '@shared/types'
import { mergeMeasured } from './measured'

const graph = (...ids: string[]): Graph => ({
  version: 1,
  nodes: ids.map((id) => ({ id, type: 'LFO', params: {} })),
  edges: []
})

describe('mergeMeasured', () => {
  it('dopisuje nowe wymiary i zachowuje stare', () => {
    const prev = { a: { width: 10, height: 20 } }
    const out = mergeMeasured(prev, { b: { width: 5, height: 6 } }, graph('a', 'b'))
    expect(out).toEqual({ a: { width: 10, height: 20 }, b: { width: 5, height: 6 } })
  })

  it('nadpisuje zmienione wymiary', () => {
    const out = mergeMeasured(
      { a: { width: 10, height: 20 } },
      { a: { width: 11, height: 20 } },
      graph('a')
    )
    expect(out.a).toEqual({ width: 11, height: 20 })
  })

  it("usuwa wpisy node'ów, których nie ma w grafie", () => {
    const prev = { a: { width: 1, height: 1 }, gone: { width: 2, height: 2 } }
    expect(mergeMeasured(prev, {}, graph('a'))).toEqual({ a: { width: 1, height: 1 } })
  })

  it('zwraca ten sam obiekt, gdy nic się nie zmieniło', () => {
    const prev = { a: { width: 1, height: 1 } }
    expect(mergeMeasured(prev, { a: { width: 1, height: 1 } }, graph('a'))).toBe(prev)
  })
})
