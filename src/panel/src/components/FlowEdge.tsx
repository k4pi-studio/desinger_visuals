// Kabel grafu z pakietami płynącymi od źródła do celu (pikselowe `● •`).
// Rysuje zwykły kabel (BaseEdge), kwadraty SVG i etykietę na wierzchu; pozycje i krycie ustawia pętla
// z `flowAnim.ts`, więc React renderuje tylko przy zmianie kabla (np. ruch node'a).

import { useLayoutEffect, useRef } from 'react'
import { BaseEdge, EdgeText, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react'
import { BEAT, SOURCE_VIDEO, packetCount, type FlowSource } from '../flow'
import {
  HEAD,
  PULSE_HEAD,
  PULSE_TAIL,
  TAIL1,
  TAIL2,
  createEntry,
  flows,
  type FlowEntry
} from '../flowAnim'

export interface FlowEdgeData extends Record<string, unknown> {
  /** Pasmo AudioIn albo stała (obraz, LFO/Math) – patrz `flowSource`. */
  source: FlowSource
  /** Przygaszony kabel obrazu (zbypassowany filtr). */
  dim: boolean
  /** Kolor pakietów (zmienna CSS). */
  color: string
}

export type VzEdge = Edge<FlowEdgeData, 'vz'>

/** Kwadrat bez zaokrągleń i wygładzania: estetyka 1-bit. */
function Px({
  size,
  fill,
  opacity,
  outline
}: {
  size: number
  fill: string
  opacity?: number
  outline?: boolean
}): React.JSX.Element {
  return (
    <rect
      width={size}
      height={size}
      fill={fill}
      opacity={opacity}
      stroke={outline ? '#000' : undefined}
      strokeWidth={outline ? 1 : undefined}
      shapeRendering="crispEdges"
    />
  )
}

export function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  label,
  labelStyle,
  labelShowBg,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  interactionWidth,
  markerStart,
  markerEnd
}: EdgeProps<VzEdge>): React.JSX.Element {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  })
  // Krzywa jest trochę dłuższa od cięciwy; dokładną długość mierzy pętla (LUT).
  const count = packetCount(Math.hypot(targetX - sourceX, targetY - sourceY) * 1.15)
  const source = data?.source ?? SOURCE_VIDEO
  const dim = data?.dim ?? false
  const color = data?.color ?? 'var(--color-term-bright-white)'
  const pulse = source === BEAT

  const root = useRef<SVGGElement>(null)
  const stream = useRef<SVGGElement>(null)
  const pulseGroup = useRef<SVGGElement>(null)
  const entry = useRef<FlowEntry | null>(null)

  // Rejestracja w pętli animacji na czas życia kabla.
  useLayoutEffect(() => {
    const e = createEntry()
    flows.set(id, e)
    entry.current = e
    return () => {
      if (flows.get(id) === e) flows.delete(id)
      entry.current = null
    }
  }, [id])

  // Nowa ścieżka albo inne pakiety: odśwież wpis, LUT przeliczy pętla (raz na zmianę).
  useLayoutEffect(() => {
    const e = entry.current
    const g = root.current
    if (!e || !g) return
    e.path =
      g.parentElement?.querySelector<SVGPathElement>(':scope > .react-flow__edge-path') ?? null
    e.dirty = true
    e.stream = stream.current
    e.packets = stream.current ? Array.from(stream.current.querySelectorAll('rect')) : []
    e.pulseGroup = pulseGroup.current
    e.pulse = pulseGroup.current ? Array.from(pulseGroup.current.querySelectorAll('rect')) : []
    e.source = source
    e.dim = dim
  }, [path, count, source, dim, pulse])

  const packets: React.JSX.Element[] = []
  for (let i = 0; i < count; i++) {
    // Kolejność w DOM: [ogon2, ogon1, głowa] – głowa rysuje się na wierzchu (tak czyta je pętla).
    packets.push(
      <g key={i}>
        <Px size={TAIL2} fill={color} opacity={0.4} />
        <Px size={TAIL1} fill={color} opacity={0.7} />
        <Px size={HEAD} fill={color} outline />
      </g>
    )
  }

  return (
    <>
      {/* Etykieta osobno (EdgeText niżej), żeby pakiety jej nie przykrywały. */}
      <BaseEdge
        path={path}
        interactionWidth={interactionWidth}
        markerStart={markerStart}
        markerEnd={markerEnd}
        style={style}
      />
      <g ref={root} className="vz-packets" pointerEvents="none" aria-hidden>
        {/* Krycie ustawia pętla; 0 do pierwszej klatki, żeby kwadraty nie mignęły w (0, 0). */}
        <g ref={stream} opacity={0}>
          {packets}
        </g>
        {pulse && (
          <g ref={pulseGroup} opacity={0}>
            <Px size={PULSE_TAIL} fill={color} opacity={0.6} />
            <Px size={PULSE_HEAD} fill={color} outline />
          </g>
        )}
      </g>
      {label && (
        <EdgeText
          x={labelX}
          y={labelY}
          label={label}
          labelStyle={labelStyle}
          labelShowBg={labelShowBg}
          labelBgStyle={labelBgStyle}
          labelBgPadding={labelBgPadding}
          labelBgBorderRadius={labelBgBorderRadius}
        />
      )}
    </>
  )
}
