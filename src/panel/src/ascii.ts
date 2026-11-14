// Paski ASCII (`█▓▒░`) dla mierników audio i postępu uploadu.

/**
 * Pasek ASCII o stałej liczbie komórek: `█` pełne, ułamek ostatniej jako `▓`/`▒`, reszta `░`.
 * Wartość spoza 0..1 jest obcinana.
 */
export function asciiBar(value: number, cells: number): string {
  const v = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
  const filled = v * cells
  const full = Math.floor(filled)
  if (full >= cells) return '█'.repeat(cells)
  const rest = filled - full
  const partial = rest >= 2 / 3 ? '▓' : rest >= 1 / 3 ? '▒' : '░'
  return '█'.repeat(full) + partial + '░'.repeat(cells - full - 1)
}
