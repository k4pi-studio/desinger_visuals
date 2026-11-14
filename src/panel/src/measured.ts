// Wymiary node'ów zmierzone przez React Flow, trzymane obok grafu (bez DOM i bez Reacta).

import type { Graph } from '@shared/types'

export interface Size {
  width: number
  height: number
}

export type Measured = Record<string, Size>

/**
 * Dopisuje nowe wymiary `next` i usuwa wpisy node'ów, których nie ma już w grafie.
 * Zwraca `prev`, gdy nic się nie zmieniło, żeby nie wywoływać zbędnego renderu.
 */
export function mergeMeasured(prev: Measured, next: Measured, graph: Graph): Measured {
  const out: Measured = {}
  let changed = false
  for (const n of graph.nodes) {
    const d = next[n.id] ?? prev[n.id]
    if (!d) continue
    out[n.id] = d
    const p = prev[n.id]
    if (!p || p.width !== d.width || p.height !== d.height) changed = true
  }
  if (!changed && Object.keys(out).length === Object.keys(prev).length) return prev
  return out
}
