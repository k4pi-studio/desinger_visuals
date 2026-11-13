import { describe, expect, it } from 'vitest'
import {
  CircuitModel,
  SignalModel,
  echoUniforms,
  gunUniforms,
  type CircuitKnobs,
  type EchoKnobs,
  type SignalKnobs
} from './model'

const NOMINAL: CircuitKnobs = { hv: 0.5, hdef: 0.5, vdef: 0.5 }
const zero = (): number => 0
const one = (): number => 1

function run(knobs: CircuitKnobs, steps = 1, dt = 1 / 60, random = zero): CircuitModel {
  const model = new CircuitModel()
  for (let i = 0; i < steps; i++) model.step(knobs, dt, random)
  return model
}

describe('gunUniforms', () => {
  it('0,5 = sprawne działo', () => {
    expect(gunUniforms(0.5)).toEqual({ gain: 1, convergence: 0, overdrive: 0 })
  })
  it('skrajne napięcia: przesterowanie i wygaszenie', () => {
    expect(gunUniforms(1).overdrive).toBe(1)
    expect(gunUniforms(0).gain).toBe(0)
  })
})

describe('CircuitModel', () => {
  it('pokrętła na 0,5 = sprawny telewizor', () => {
    const o = run(NOMINAL, 100).out
    expect(o.scaleX).toBeCloseTo(1)
    expect(o.scaleY).toBeCloseTo(1)
    expect(o.hDetune).toBe(0)
    expect(o.vRolling).toBe(0)
    expect(o.vPhase).toBe(0)
    expect(o.arc).toBe(0)
    expect(o.brightness).toBeCloseTo(1)
  })

  it('vdef 0 → zapadnięcie pionu do kreski', () => {
    expect(run({ ...NOMINAL, vdef: 0 }).out.scaleY).toBeLessThanOrEqual(0.005)
  })

  it('vdef poza synchronizacją → obraz się toczy', () => {
    const model = new CircuitModel()
    model.step({ ...NOMINAL, vdef: 0.9 }, 0.1, zero)
    const first = model.out.vPhase
    model.step({ ...NOMINAL, vdef: 0.9 }, 0.1, zero)
    expect(model.out.vRolling).toBe(1)
    expect(model.out.vPhase).not.toBe(first)
  })

  it('hdef: w zakresie tylko drżenie, poza nim rozstrojenie ze znakiem', () => {
    const inLock = run({ ...NOMINAL, hdef: 0.7 }).out
    expect(inLock.hDetune).toBe(0)
    expect(inLock.jitter).toBeGreaterThan(0)
    expect(run({ ...NOMINAL, hdef: 0.9 }).out.hDetune).toBeGreaterThan(0)
    expect(run({ ...NOMINAL, hdef: 0.1 }).out.hDetune).toBeLessThan(0)
  })

  it('wyższe HV → mniejszy obraz, bardzo niskie HV → obraz gaśnie', () => {
    expect(run({ ...NOMINAL, hv: 0.8 }).out.scaleX).toBeLessThan(run(NOMINAL).out.scaleX)
    expect(run({ ...NOMINAL, hv: 0.05 }).out.brightness).toBeLessThan(0.1)
  })

  it('iskrzenie powyżej 0,85 i wygaszenie po ~100 ms', () => {
    const model = new CircuitModel()
    model.step({ ...NOMINAL, hv: 0.95 }, 1 / 60, zero)
    expect(model.out.arc).toBe(1)
    model.step({ ...NOMINAL, hv: 0.95 }, 0.11, one)
    expect(model.out.arc).toBe(0)
    expect(run({ ...NOMINAL, hv: 0.8 }).out.arc).toBe(0)
  })

  it('długie dt przy skrajnych pokrętłach: fazy zostają w [0,1)', () => {
    const o = run({ hv: 1, hdef: 1, vdef: 0.9 }, 1000, 0.1, Math.random).out
    for (const v of [o.vPhase, o.hPhase]) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    expect(o.arc).toBeGreaterThanOrEqual(0)
    expect(o.arc).toBeLessThanOrEqual(1)
  })

  it('wartości spoza 0–1 nie dają NaN ani Infinity', () => {
    const o = run({ hv: -1, hdef: 2, vdef: -1 }, 10).out
    for (const v of Object.values(o)) expect(Number.isFinite(v)).toBe(true)
  })

  it('step zwraca ten sam obiekt (bez alokacji)', () => {
    const model = new CircuitModel()
    expect(model.step(NOMINAL, 1 / 60, zero)).toBe(model.out)
  })
})

describe('echoUniforms (CRT Echo: echo konturów, opóźnienie, rozjazd)', () => {
  const CLEAN: EchoKnobs = { echo: 0, delay: 0, spread: 0 }

  it('wszystko na 0 = brak ech', () => {
    const o = echoUniforms(CLEAN)
    expect(o.echoGain).toBe(0)
    expect(o.spreadShift).toBe(0)
    expect(o.delayR).toBe(o.delayG)
    expect(o.delayB).toBe(o.delayG)
  })

  it('Echo ustawia siłę, Delay odległość', () => {
    expect(echoUniforms({ ...CLEAN, echo: 1 }).echoGain).toBeCloseTo(0.6)
    expect(echoUniforms({ ...CLEAN, delay: 0 }).delayG).toBeCloseTo(0.005)
    expect(echoUniforms({ ...CLEAN, delay: 1 }).delayG).toBeCloseTo(0.08)
  })

  it('Spread rozsuwa opóźnienia kanałów i zbieżność', () => {
    const o = echoUniforms({ ...CLEAN, delay: 0.5, spread: 1 })
    expect(o.delayR).toBeGreaterThan(o.delayG)
    expect(o.delayG).toBeGreaterThan(o.delayB)
    expect(o.delayB).toBeGreaterThan(0)
    expect(o.spreadShift).toBeGreaterThan(0)
  })

  it('wartości spoza 0–1 są skończone, a podany obiekt jest wypełniany (bez alokacji)', () => {
    const out = echoUniforms(CLEAN)
    const o = echoUniforms({ echo: 5, delay: -3, spread: 9 }, out)
    expect(o).toBe(out)
    for (const v of Object.values(o)) expect(Number.isFinite(v)).toBe(true)
  })
})

describe('SignalModel (CRT Signal: przydźwięk, jitter, chroma)', () => {
  const CLEAN: SignalKnobs = { hum: 0, jitter: 0, chroma: 0 }
  const run = (k: SignalKnobs, steps = 1, dt = 1 / 60): SignalModel => {
    const m = new SignalModel()
    for (let i = 0; i < steps; i++) m.step(k, dt)
    return m
  }

  it('wszystko na 0 = czysty sygnał', () => {
    const o = run(CLEAN, 10).out
    expect(o.humAmp).toBe(0)
    expect(o.humBar).toBe(0)
    expect(o.jitterAmp).toBe(0)
    expect(o.chromaBleed).toBe(0)
    expect(o.chromaSat).toBe(1)
    expect(o.chromaHue).toBe(0)
  })

  it('Hum: falowanie i pas, faza płynie w czasie', () => {
    const m = new SignalModel()
    m.step({ ...CLEAN, hum: 1 }, 0.1)
    const first = m.out.humPhase
    m.step({ ...CLEAN, hum: 1 }, 0.1)
    expect(m.out.humAmp).toBeGreaterThan(0)
    expect(m.out.humBar).toBeGreaterThan(0)
    expect(m.out.humPhase).not.toBe(first)
  })

  it('Jitter: amplituda szarpania linii i czas szumu', () => {
    const m = new SignalModel()
    m.step({ ...CLEAN, jitter: 1 }, 0.1)
    const t = m.out.jitterTime
    m.step({ ...CLEAN, jitter: 1 }, 0.1)
    expect(m.out.jitterAmp).toBeGreaterThan(0)
    expect(m.out.jitterTime).toBeGreaterThan(t)
  })

  it('Chroma: rozlewanie, przesycenie i przesunięcie barwy', () => {
    const o = run({ ...CLEAN, chroma: 1 }).out
    expect(o.chromaBleed).toBeGreaterThan(0)
    expect(o.chromaSat).toBeGreaterThan(1)
    expect(o.chromaHue).not.toBe(0)
  })

  it('długie działanie: fazy i czas zostają ograniczone', () => {
    const o = run({ hum: 1, jitter: 1, chroma: 1 }, 100000, 0.1).out
    expect(o.humPhase).toBeGreaterThanOrEqual(0)
    expect(o.humPhase).toBeLessThan(1)
    expect(o.jitterTime).toBeGreaterThanOrEqual(0)
    expect(o.jitterTime).toBeLessThan(1000)
  })

  it('wartości spoza 0–1 nie dają NaN ani Infinity, step zwraca ten sam obiekt', () => {
    const m = new SignalModel()
    expect(m.step({ hum: -1, jitter: 7, chroma: -4 }, 1 / 60)).toBe(m.out)
    for (const v of Object.values(m.out)) expect(Number.isFinite(v)).toBe(true)
  })
})
