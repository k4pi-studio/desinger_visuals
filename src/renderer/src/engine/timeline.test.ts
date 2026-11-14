import { describe, expect, it } from 'vitest'
import { Sequencer, beatTriggered } from './timeline'

const DT = 1 / 60

/** Numer kroku (od 1), w którym `step` zwróciło true; -1, gdy wcale. */
function cutAt(
  item: { id: string; duration: number; waitBeat: boolean },
  steps: number,
  beatAt: (step: number) => boolean = () => false
): number {
  const s = new Sequencer()
  for (let i = 1; i <= steps; i++) if (s.step(DT, beatAt(i), item)) return i
  return -1
}

describe('Sequencer', () => {
  it('bez czekania na beat tnie po czasie elementu', () => {
    const at = cutAt({ id: 'a', duration: 2, waitBeat: false }, 400)
    expect(Math.abs(at - 120)).toBeLessThanOrEqual(1)
  })

  it('z czekaniem: beat przed czasem nic nie daje, pierwszy beat po czasie tnie', () => {
    const item = { id: 'a', duration: 2, waitBeat: true }
    expect(cutAt(item, 200, (i) => i === 60)).toBe(-1)
    expect(cutAt(item, 300, (i) => i === 60 || i === 150)).toBe(150)
  })

  it('z czekaniem i ciszą tnie najpóźniej 4 s po czasie elementu', () => {
    const at = cutAt({ id: 'a', duration: 2, waitBeat: true }, 600)
    expect(Math.abs(at - 360)).toBeLessThanOrEqual(1)
  })

  it('tnie raz na element, nowe id liczy od zera, brak elementu zeruje', () => {
    const s = new Sequencer()
    const a = { id: 'a', duration: 1, waitBeat: false }
    let cuts = 0
    for (let i = 0; i < 300; i++) if (s.step(DT, false, a)) cuts++
    expect(cuts).toBe(1)
    const b = { id: 'b', duration: 1, waitBeat: false }
    let at = -1
    for (let i = 1; i <= 100 && at < 0; i++) if (s.step(DT, false, b)) at = i
    expect(Math.abs(at - 60)).toBeLessThanOrEqual(1)
    expect(s.step(DT, true, null)).toBe(false)
  })
})

describe('beatTriggered', () => {
  it('true tylko w klatce uderzenia (obwiednia = 1)', () => {
    expect(beatTriggered(1)).toBe(true)
    expect(beatTriggered(0.92)).toBe(false)
  })
})
