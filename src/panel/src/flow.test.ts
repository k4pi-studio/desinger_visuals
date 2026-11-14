import { describe, expect, it } from 'vitest'
import type { AudioLevels, Graph } from '@shared/types'
import {
  BANDS,
  BEAT,
  CONTROL_LEVEL,
  LUT_SAMPLES,
  SOURCE_CONTROL,
  SOURCE_VIDEO,
  VIDEO_LEVEL,
  advance,
  alphaFor,
  fillLut,
  flowSource,
  isDimmed,
  lutPoint,
  packetCount,
  packetT,
  quantizeAlpha,
  risingEdge,
  smooth,
  smoothLevels,
  sourceLevel,
  speedFor
} from './flow'

const graph: Graph = {
  version: 1,
  nodes: [
    { id: 'v1', type: 'VideoFile', params: {} },
    { id: 'fx1', type: 'Bloom', params: {}, bypass: true },
    { id: 'fx2', type: 'Pixelate', params: {} },
    { id: 'out', type: 'Output', params: {} },
    { id: 'a1', type: 'AudioIn', params: {} },
    { id: 'l1', type: 'LFO', params: {} }
  ],
  edges: []
}

describe('flowSource', () => {
  it('kabel obrazu ma stałe tempo obrazu', () => {
    expect(flowSource(graph, { from: 'v1.out' }, false)).toBe(SOURCE_VIDEO)
  })

  it('wyjścia AudioIn mapują się na indeksy pasm', () => {
    BANDS.forEach((band, i) => expect(flowSource(graph, { from: `a1.${band}` }, true)).toBe(i))
    expect(flowSource(graph, { from: 'a1.beat' }, true)).toBe(BEAT)
  })

  it('LFO, Math i nieznany port AudioIn płyną stałym tempem sterowania', () => {
    expect(flowSource(graph, { from: 'l1.value' }, true)).toBe(SOURCE_CONTROL)
    expect(flowSource(graph, { from: 'a1.nope' }, true)).toBe(SOURCE_CONTROL)
    expect(flowSource(graph, { from: 'gone.value' }, true)).toBe(SOURCE_CONTROL)
  })
})

describe('isDimmed', () => {
  it('przygasza kabel obrazu wchodzący do zbypassowanego filtra i z niego wychodzący', () => {
    expect(isDimmed(graph, { from: 'v1.out', to: 'fx1.in' }, false)).toBe(true)
    expect(isDimmed(graph, { from: 'fx1.out', to: 'fx2.in' }, false)).toBe(true)
  })

  it('nie przygasza innych kabli obrazu ani kabli sygnału', () => {
    expect(isDimmed(graph, { from: 'fx2.out', to: 'out.in' }, false)).toBe(false)
    expect(isDimmed(graph, { from: 'a1.bass', to: 'fx1.intensity' }, true)).toBe(false)
  })
})

describe('prędkość i krycie', () => {
  it('przy ciszy pakiety prawie stoją i bledną, przy pełnym paśmie pędzą', () => {
    expect(speedFor(0)).toBeLessThan(10)
    expect(speedFor(1)).toBeGreaterThan(200)
    expect(speedFor(0.5)).toBeGreaterThan(speedFor(0.2))
    expect(alphaFor(0)).toBeCloseTo(0.3)
    expect(alphaFor(1)).toBeCloseTo(1)
  })

  it('obcina wartości spoza 0..1', () => {
    expect(speedFor(5)).toBe(speedFor(1))
    expect(alphaFor(-1)).toBe(alphaFor(0))
  })

  it('sourceLevel: pasmo z tablicy albo stała dla obrazu i sterowania', () => {
    const levels = new Float32Array([0.1, 0.2, 0.3, 0.4, 2])
    expect(sourceLevel(0, levels)).toBeCloseTo(0.1)
    expect(sourceLevel(4, levels)).toBe(1)
    expect(sourceLevel(SOURCE_VIDEO, levels)).toBe(VIDEO_LEVEL)
    expect(sourceLevel(SOURCE_CONTROL, levels)).toBe(CONTROL_LEVEL)
  })

  it('quantizeAlpha zaokrągla do kroku 0.05', () => {
    expect(quantizeAlpha(0.42)).toBe(0.4)
    expect(quantizeAlpha(0.43)).toBe(0.45)
    expect(quantizeAlpha(1.3)).toBe(1)
  })
})

describe('smooth', () => {
  it('po czasie tau pokonuje ~63% drogi, niezależnie od podziału na klatki', () => {
    expect(smooth(0, 1, 0.1, 0.1)).toBeCloseTo(1 - Math.exp(-1))
    let v = 0
    for (let i = 0; i < 10; i++) v = smooth(v, 1, 0.01, 0.1)
    expect(v).toBeCloseTo(1 - Math.exp(-1), 5)
  })

  it('dt = 0 nie zmienia wartości, tau = 0 skacze do celu', () => {
    expect(smooth(0.3, 1, 0, 0.1)).toBe(0.3)
    expect(smooth(0.3, 1, 0.016, 0)).toBe(1)
  })

  it('smoothLevels wygładza pasma w kolejności BANDS', () => {
    const out = new Float32Array(BANDS.length)
    const audio: AudioLevels = { bass: 1, mid: 0.5, high: 0, level: 0.2, beat: 1 }
    smoothLevels(out, audio, 10, 0.1)
    expect(Array.from(out)).toEqual([1, 0.5, 0, expect.closeTo(0.2), 1])
  })
})

describe('risingEdge', () => {
  it('wyzwala przy skoku powyżej progu, nie przy zaniku ani drganiach', () => {
    const s = { prev: 0 }
    const seq = [0, 0.6, 0.9, 0.45, 0.55, 0.5, 0.2, 0.7].map((v) => risingEdge(s, v))
    expect(seq).toEqual([false, true, true, false, false, false, false, true])
  })

  it('beat co 250 ms próbkowany co 100 ms: impuls przy każdym uderzeniu', () => {
    // Obwiednia jak w BeatDetector: 1 przy uderzeniu, zanik exp(-5·t).
    for (const offset of [0, 30, 60, 90]) {
      const s = { prev: 0 }
      let lastBeat = -Infinity
      let nextBeat = 0
      let beats = 0
      let fires = 0
      for (let t = offset; t < 5000; t += 100) {
        while (nextBeat <= t) {
          lastBeat = nextBeat
          nextBeat += 250
          beats++
        }
        const value = Math.exp((-5 * (t - lastBeat)) / 1000)
        if (risingEdge(s, value)) fires++
      }
      expect(fires).toBe(beats)
    }
  })
})

describe('faza pakietów', () => {
  it('advance przesuwa o dt·speed/długość i zawija do [0, 1)', () => {
    expect(advance(0, 1, 50, 100)).toBeCloseTo(0.5)
    expect(advance(0.9, 1, 50, 100)).toBeCloseTo(0.4)
    expect(advance(0.2, 0, 50, 100)).toBe(0.2)
  })

  it('packetT rozkłada pakiety równo po kablu', () => {
    expect([0, 1, 2, 3].map((i) => packetT(0.1, i, 4))).toEqual([
      expect.closeTo(0.1),
      expect.closeTo(0.35),
      expect.closeTo(0.6),
      expect.closeTo(0.85)
    ])
    expect(packetT(0.9, 1, 2)).toBeCloseTo(0.4)
  })

  it('packetCount: jeden pakiet na ~140 px, od 1 do 5', () => {
    expect(packetCount(10)).toBe(1)
    expect(packetCount(300)).toBe(2)
    expect(packetCount(5000)).toBe(5)
  })
})

describe('LUT ścieżki', () => {
  it('fillLut próbkuje ścieżkę równo po długości, lutPoint interpoluje', () => {
    const lut = new Float32Array(LUT_SAMPLES * 2)
    const calls: number[] = []
    fillLut(lut, 110, (d) => {
      calls.push(d)
      return { x: d, y: 2 * d }
    })
    expect(calls).toHaveLength(LUT_SAMPLES)
    expect(calls[0]).toBe(0)
    expect(calls[LUT_SAMPLES - 1]).toBeCloseTo(110)
    const p = { x: 0, y: 0 }
    lutPoint(lut, 0.5, p)
    expect(p.x).toBeCloseTo(55)
    expect(p.y).toBeCloseTo(110)
    lutPoint(lut, 1, p)
    expect(p.x).toBeCloseTo(110)
    lutPoint(lut, -1, p)
    expect(p.x).toBe(0)
  })

  it('lutPoint na pustej i jednopunktowej tablicy', () => {
    const p = { x: 9, y: 9 }
    lutPoint(new Float32Array(0), 0.5, p)
    expect(p).toEqual({ x: 0, y: 0 })
    lutPoint(new Float32Array([3, 4]), 0.5, p)
    expect(p).toEqual({ x: 3, y: 4 })
  })
})
