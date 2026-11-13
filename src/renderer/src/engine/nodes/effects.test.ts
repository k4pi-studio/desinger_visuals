import { describe, expect, it } from 'vitest'
import {
  BloomEffect,
  BrightnessContrastEffect,
  ChromaticAberrationEffect,
  GlitchEffect,
  GlitchMode,
  HueSaturationEffect,
  NoiseEffect,
  PixelationEffect,
  VignetteEffect
} from 'postprocessing'
import { FILTER_TYPES, NODE_TYPES, NODE_DEFS } from '@shared/nodes'
import { Vector3 } from 'three'
import { CrtCircuitPass } from '../crt/CrtCircuitPass'
import { EchoEffect } from '../crt/EchoEffect'
import { GunsEffect } from '../crt/GunsEffect'
import { SignalEffect } from '../crt/SignalEffect'
import { createEffect, type EffectHandle } from './effects'

/** Getter jak w silniku: wartości z mapy, reszta z domyślnych. */
const getter =
  (values: Record<string, number>) =>
  (key: string): number =>
    values[key] ?? 0

function make<T>(
  type: Parameters<typeof createEffect>[0],
  cls: new (...a: never[]) => T
): {
  handle: EffectHandle
  effect: T
} {
  const handle = createEffect(type)!
  expect(handle.effect).toBeInstanceOf(cls)
  return { handle, effect: handle.effect as T }
}

describe('createEffect', () => {
  it.each(FILTER_TYPES)('%s ma efekt, który przyjmuje domyślne parametry', (type) => {
    const handle = createEffect(type)
    expect(handle).not.toBeNull()
    expect(handle!.effect ?? handle!.pass).toBeTruthy()
    const defaults: Record<string, number> = {}
    for (const p of NODE_DEFS[type].params) if (p.kind === 'number') defaults[p.key] = p.default
    expect(() => handle!.apply(getter(defaults), 1 / 60)).not.toThrow()
    handle!.effect?.dispose()
    handle!.pass?.dispose()
  })

  it('node’y, które nie są filtrami, nie mają efektu', () => {
    for (const type of NODE_TYPES.filter((t) => !FILTER_TYPES.includes(t))) {
      expect(createEffect(type)).toBeNull()
    }
  })
})

describe('mapowanie parametrów', () => {
  it('BrightnessContrast', () => {
    const { handle, effect } = make('BrightnessContrast', BrightnessContrastEffect)
    handle.apply(getter({ brightness: 0.2, contrast: -0.3 }), 1 / 60)
    expect(effect.brightness).toBeCloseTo(0.2)
    expect(effect.contrast).toBeCloseTo(-0.3)
  })

  it('HueSaturation: stopnie → radiany', () => {
    const { handle, effect } = make('HueSaturation', HueSaturationEffect)
    handle.apply(getter({ hue: 90, saturation: 0.5 }), 1 / 60)
    expect(effect.hue).toBeCloseTo(Math.PI / 2)
    expect(effect.saturation).toBeCloseTo(0.5)
  })

  it('Bloom: intensywność i próg', () => {
    const { handle, effect } = make('Bloom', BloomEffect)
    handle.apply(getter({ intensity: 3, threshold: 0.7 }), 1 / 60)
    expect(effect.intensity).toBe(3)
    expect(effect.luminanceMaterial.threshold).toBeCloseTo(0.7)
  })

  it('RGBSplit: przesunięcie i kąt → wektor', () => {
    const { handle, effect } = make('RGBSplit', ChromaticAberrationEffect)
    handle.apply(getter({ amount: 0.01, angle: 90 }), 1 / 60)
    expect(effect.offset.x).toBeCloseTo(0)
    expect(effect.offset.y).toBeCloseTo(0.01)
    handle.apply(getter({ amount: 0.02, angle: 0 }), 1 / 60)
    expect(effect.offset.x).toBeCloseTo(0.02)
  })

  it('Pixelate zaokrągla rozmiar piksela', () => {
    const { handle, effect } = make('Pixelate', PixelationEffect)
    handle.apply(getter({ granularity: 3.6 }), 1 / 60)
    expect(effect.granularity).toBe(4)
  })

  it('Glitch: tryb zależy od siły', () => {
    const { handle, effect } = make('Glitch', GlitchEffect)
    handle.apply(getter({ amount: 0 }), 1 / 60)
    expect(effect.mode).toBe(GlitchMode.DISABLED)
    handle.apply(getter({ amount: 0.3 }), 1 / 60)
    expect(effect.mode).toBe(GlitchMode.CONSTANT_MILD)
    expect(effect.strength.y).toBeCloseTo(0.3)
    handle.apply(getter({ amount: 0.9 }), 1 / 60)
    expect(effect.mode).toBe(GlitchMode.CONSTANT_WILD)
  })

  it('Noise: krycie przez blend mode', () => {
    const { handle, effect } = make('Noise', NoiseEffect)
    handle.apply(getter({ opacity: 0.4 }), 1 / 60)
    expect(effect.blendMode.opacity.value).toBeCloseTo(0.4)
  })

  it('Vignette', () => {
    const { handle, effect } = make('Vignette', VignetteEffect)
    handle.apply(getter({ offset: 0.5, darkness: 0.8 }), 1 / 60)
    expect(effect.offset).toBeCloseTo(0.5)
    expect(effect.darkness).toBeCloseTo(0.8)
  })

  it('CRTGuns: napięcia dział → uniformy', () => {
    const { handle, effect } = make('CRTGuns', GunsEffect)
    handle.apply(getter({ red: 1, green: 0.5, blue: 0 }), 1 / 60)
    expect(effect.uniforms.get('gain')!.value).toEqual(new Vector3(2, 1, 0))
    expect(effect.uniforms.get('overdrive')!.value).toEqual(new Vector3(1, 0, 0))
    expect(effect.uniforms.get('convergence')!.value).toEqual(new Vector3(0.5, 0, -0.5))
  })

  it('CRTEcho: pokrętła → uniformy echa konturów', () => {
    const { handle, effect } = make('CRTEcho', EchoEffect)
    handle.apply(getter({ echo: 1, delay: 1, spread: 0 }), 1 / 60)
    expect(effect.uniforms.get('echoGain')!.value).toBeCloseTo(0.6)
    expect((effect.uniforms.get('echoDelay')!.value as Vector3).y).toBeCloseTo(0.08)
  })

  it('CRTSignal: pokrętła → uniformy przydźwięku, jittera i chromy', () => {
    const { handle, effect } = make('CRTSignal', SignalEffect)
    handle.apply(getter({ hum: 0, jitter: 1, chroma: 1 }), 1 / 60)
    expect(effect.uniforms.get('humAmp')!.value).toBe(0)
    expect(effect.uniforms.get('jitterAmp')!.value).toBeGreaterThan(0)
    expect(effect.uniforms.get('chromaSat')!.value).toBeGreaterThan(1)
  })

  it('CRTCircuit: własne przejście, pokrętła trafiają do modelu', () => {
    const handle = createEffect('CRTCircuit')!
    expect(handle.pass).toBeInstanceOf(CrtCircuitPass)
    expect(handle.effect).toBeUndefined()
    handle.apply(getter({ hv: 0.5, hdef: 0.5, vdef: 0 }), 1 / 60)
    expect((handle.pass as CrtCircuitPass).model.out.scaleY).toBeLessThanOrEqual(0.005)
    handle.pass!.dispose()
  })
})
