// CRT Flicker jako efekt postprocessing: mnożnik jasności liczony przez FlickerModel.

import { Effect } from 'postprocessing'
import { Uniform } from 'three'
import fragment from './flicker.frag?raw'

export class FlickerEffect extends Effect {
  constructor() {
    super('CRTFlicker', fragment, { uniforms: new Map([['gain', new Uniform(1)]]) })
  }

  setGain(gain: number): void {
    this.uniforms.get('gain')!.value = gain
  }
}
