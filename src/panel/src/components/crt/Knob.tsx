// Pokrętło 270°: przeciąganie w pionie (Shift = dokładnie), dwuklik = domyślna.
// Pokrętło prowadzone kablem pokazuje wartość z kabla i nie przyjmuje przeciągania.

import { useRef } from 'react'
import type { NumberParamDef } from '@shared/nodes'
import { setParamValue } from '../../store'
import { dragValue, knobAngle } from './knobMath'

export function Knob({
  nodeId,
  def,
  value,
  driven
}: {
  nodeId: string
  def: NumberParamDef
  value: number
  driven: boolean
}): React.JSX.Element {
  const drag = useRef<{ y: number; start: number; last: number } | null>(null)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (driven || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { y: e.clientY, start: value, last: value }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d) return
    const v = dragValue(d.start, e.clientY - d.y, e.shiftKey, def)
    if (v !== d.last) {
      d.last = v
      setParamValue(nodeId, def.key, v)
    }
  }
  const onPointerUp = (): void => {
    drag.current = null
  }

  return (
    <div
      className={`crt-knob nodrag nopan ${driven ? 'crt-driven' : ''}`}
      role="slider"
      aria-label={def.label}
      aria-valuemin={def.min}
      aria-valuemax={def.max}
      aria-valuenow={value}
      title={`${def.label}: ${value.toFixed(3)}${driven ? ' (z kabla)' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => !driven && setParamValue(nodeId, def.key, def.default)}
    >
      <div className="crt-knob-scale" />
      <div className="crt-knob-skirt" />
      <div
        className="crt-knob-cap"
        style={{ transform: `rotate(${knobAngle(value, def.min, def.max)}deg)` }}
      />
    </div>
  )
}
