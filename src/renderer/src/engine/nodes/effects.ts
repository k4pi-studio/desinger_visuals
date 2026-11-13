// Node'y filtrów → efekty z biblioteki `postprocessing` (albo własne przejścia).
// `apply` jest wołane w każdej klatce i tylko ustawia wartości (bez alokacji).

import {
  BloomEffect,
  BrightnessContrastEffect,
  ChromaticAberrationEffect,
  type Effect,
  GlitchEffect,
  GlitchMode,
  HueSaturationEffect,
  NoiseEffect,
  type Pass,
  PixelationEffect,
  VignetteEffect
} from 'postprocessing'
import { Vector2 } from 'three'
import type { NodeType } from '@shared/nodes'
import { CrtCircuitPass } from '../crt/CrtCircuitPass'
import { EchoEffect } from '../crt/EchoEffect'
import { GunsEffect } from '../crt/GunsEffect'
import { SignalEffect } from '../crt/SignalEffect'
import { SignalModel, echoUniforms, gunUniforms } from '../crt/model'

export type ParamGetter = (key: string) => number

/** Zwykły efekt (`effect`) albo własne przejście (`pass`), np. z buforem poprzedniej klatki. */
export interface EffectHandle {
  effect?: Effect
  pass?: Pass
  /** `dt` – czas klatki w sekundach, dla efektów zależnych od czasu. */
  apply(get: ParamGetter, dt: number): void
}

const DEG = Math.PI / 180

export function createEffect(type: NodeType): EffectHandle | null {
  switch (type) {
    case 'BrightnessContrast': {
      const effect = new BrightnessContrastEffect()
      return {
        effect,
        apply(get) {
          effect.brightness = get('brightness')
          effect.contrast = get('contrast')
        }
      }
    }
    case 'HueSaturation': {
      const effect = new HueSaturationEffect()
      return {
        effect,
        apply(get) {
          effect.hue = get('hue') * DEG
          effect.saturation = get('saturation')
        }
      }
    }
    case 'Bloom': {
      const effect = new BloomEffect({ mipmapBlur: true, radius: 0.75, luminanceSmoothing: 0.2 })
      return {
        effect,
        apply(get) {
          effect.intensity = get('intensity')
          effect.luminanceMaterial.threshold = get('threshold')
        }
      }
    }
    case 'RGBSplit': {
      const effect = new ChromaticAberrationEffect({
        offset: new Vector2(),
        radialModulation: false,
        modulationOffset: 0
      })
      return {
        effect,
        apply(get) {
          const a = get('amount')
          const angle = get('angle') * DEG
          effect.offset.set(Math.cos(angle) * a, Math.sin(angle) * a)
        }
      }
    }
    case 'Pixelate': {
      const effect = new PixelationEffect(0)
      return {
        effect,
        apply(get) {
          const g = Math.round(get('granularity'))
          if (g !== effect.granularity) effect.granularity = g
        }
      }
    }
    case 'Glitch': {
      const effect = new GlitchEffect({ ratio: 0.85, columns: 0.05 })
      effect.mode = GlitchMode.DISABLED
      return {
        effect,
        apply(get) {
          const a = get('amount')
          effect.mode =
            a < 0.02
              ? GlitchMode.DISABLED
              : a < 0.6
                ? GlitchMode.CONSTANT_MILD
                : GlitchMode.CONSTANT_WILD
          effect.strength.set(a * 0.3, a)
        }
      }
    }
    case 'Noise': {
      const effect = new NoiseEffect({ premultiply: true })
      return {
        effect,
        apply(get) {
          effect.blendMode.opacity.value = get('opacity')
        }
      }
    }
    case 'Vignette': {
      const effect = new VignetteEffect()
      return {
        effect,
        apply(get) {
          effect.offset = get('offset')
          effect.darkness = get('darkness')
        }
      }
    }
    case 'CRTGuns': {
      const effect = new GunsEffect()
      const r = gunUniforms(0.5)
      const g = gunUniforms(0.5)
      const b = gunUniforms(0.5)
      return {
        effect,
        apply(get) {
          effect.setGuns(
            gunUniforms(get('red'), r),
            gunUniforms(get('green'), g),
            gunUniforms(get('blue'), b)
          )
        }
      }
    }
    case 'CRTEcho': {
      const effect = new EchoEffect()
      const knobs = { echo: 0, delay: 0, spread: 0 }
      const out = echoUniforms(knobs)
      return {
        effect,
        apply(get) {
          knobs.echo = get('echo')
          knobs.delay = get('delay')
          knobs.spread = get('spread')
          effect.setEcho(echoUniforms(knobs, out))
        }
      }
    }
    case 'CRTSignal': {
      const effect = new SignalEffect()
      const model = new SignalModel()
      const knobs = { hum: 0, jitter: 0, chroma: 0 }
      return {
        effect,
        apply(get, dt) {
          knobs.hum = get('hum')
          knobs.jitter = get('jitter')
          knobs.chroma = get('chroma')
          effect.setSignal(model.step(knobs, dt))
        }
      }
    }
    case 'CRTCircuit': {
      const pass = new CrtCircuitPass()
      const knobs = { hv: 0.5, hdef: 0.5, vdef: 0.5 }
      return {
        pass,
        apply(get, dt) {
          knobs.hv = get('hv')
          knobs.hdef = get('hdef')
          knobs.vdef = get('vdef')
          pass.setKnobs(knobs, dt)
        }
      }
    }
    default:
      return null
  }
}
