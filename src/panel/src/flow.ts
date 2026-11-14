// Czysta logika animacji przepływu po kablach grafu (bez DOM): skąd kabel bierze wartość,
// prędkość i krycie pakietów, wygładzanie poziomów audio, zbocze beatu, LUT ścieżki.
// Pętla rAF i elementy SVG są w `flowAnim.ts` i `components/FlowEdge.tsx`.

import { splitPort } from '@shared/graph'
import type { AudioLevels, Graph, GraphEdge } from '@shared/types'

/** Pasma audio w stałej kolejności (indeksy w tablicy wygładzonych poziomów). */
export const BANDS = ['bass', 'mid', 'high', 'level', 'beat'] as const
export type Band = (typeof BANDS)[number]
export const BEAT = BANDS.indexOf('beat')

/**
 * Skąd kabel bierze tempo: indeks pasma AudioIn (0..4), albo stała dla kabla obrazu
 * i sygnału z LFO/Math (ich wartości nie docierają do panelu).
 */
export const SOURCE_VIDEO = -1
export const SOURCE_CONTROL = -2
export type FlowSource = number

/** Źródło przepływu dla kabla `edge` (`signal` – czy to kabel sygnału). */
export function flowSource(
  graph: Graph,
  edge: Pick<GraphEdge, 'from'>,
  signal: boolean
): FlowSource {
  if (!signal) return SOURCE_VIDEO
  const { node, port } = splitPort(edge.from)
  if (graph.nodes.find((n) => n.id === node)?.type !== 'AudioIn') return SOURCE_CONTROL
  const band = (BANDS as readonly string[]).indexOf(port)
  return band >= 0 ? band : SOURCE_CONTROL
}

/** Kabel obrazu wchodzący do zbypassowanego filtra albo z niego wychodzący jest przygaszony. */
export function isDimmed(
  graph: Graph,
  edge: Pick<GraphEdge, 'from' | 'to'>,
  signal: boolean
): boolean {
  if (signal) return false
  const from = splitPort(edge.from).node
  const to = splitPort(edge.to).node
  return graph.nodes.some((n) => n.bypass === true && (n.id === from || n.id === to))
}

/** Stałe „poziomy” kabli bez danych z audio: obraz spokojnie, LFO/Math umiarkowanie. */
export const VIDEO_LEVEL = 0.2
export const CONTROL_LEVEL = 0.35
/** Mnożnik krycia przygaszonego kabla obrazu. */
export const DIM_ALPHA = 0.35

/** Prędkość pakietów w px/s: przy ciszy prawie stoją, przy pełnym paśmie pędzą. */
export const SPEED_BASE = 6
export const SPEED_GAIN = 260

const clamp01 = (v: number): number => (v > 1 ? 1 : v > 0 ? v : 0)

export const speedFor = (v: number): number => SPEED_BASE + SPEED_GAIN * clamp01(v)
export const alphaFor = (v: number): number => 0.3 + 0.7 * clamp01(v)

/** Poziom źródła: wygładzone pasmo albo stała dla obrazu i LFO/Math. */
export function sourceLevel(source: FlowSource, levels: ArrayLike<number>): number {
  if (source === SOURCE_VIDEO) return VIDEO_LEVEL
  if (source === SOURCE_CONTROL) return CONTROL_LEVEL
  return clamp01(levels[source] ?? 0)
}

/** Krycie zaokrąglone do kroku 0.05, żeby atrybut zmieniać tylko przy widocznej różnicy. */
export const quantizeAlpha = (a: number): number => Math.round(clamp01(a) * 20) / 20

/**
 * Wygładzanie wykładnicze niezależne od liczby klatek: po czasie `tau` (s)
 * wartość pokonuje ~63% drogi do celu.
 */
export function smooth(prev: number, target: number, dt: number, tau: number): number {
  if (tau <= 0 || dt <= 0) return dt > 0 ? target : prev
  return prev + (target - prev) * (1 - Math.exp(-dt / tau))
}

/** Wygładza wszystkie pasma w miejscu (`out` w kolejności `BANDS`). Bez alokacji. */
export function smoothLevels(out: Float32Array, audio: AudioLevels, dt: number, tau: number): void {
  out[0] = smooth(out[0], audio.bass, dt, tau)
  out[1] = smooth(out[1], audio.mid, dt, tau)
  out[2] = smooth(out[2], audio.high, dt, tau)
  out[3] = smooth(out[3], audio.level, dt, tau)
  out[4] = smooth(out[4], audio.beat, dt, tau)
}

/**
 * Detektor uderzenia w obwiedni beatu (skok do 1, zanik ~5/s) próbkowanej co ~100 ms:
 * wyzwala, gdy próbka jest co najmniej `on` i wzrosła o `rise` względem poprzedniej.
 * Zanikająca obwiednia tylko maleje, więc nie wyzwala; nowe uderzenie zawsze ją podbija,
 * nawet gdy między uderzeniami (co 250 ms) nie zdążyła spaść nisko.
 */
export interface EdgeDetector {
  prev: number
}

export function risingEdge(state: EdgeDetector, value: number, on = 0.5, rise = 0.15): boolean {
  const fire = value >= on && value - state.prev >= rise
  state.prev = value
  return fire
}

/** Faza w [0, 1) po przesunięciu o `dt` s przy prędkości `speed` px/s na kablu długości `length` px. */
export function advance(phase: number, dt: number, speed: number, length: number): number {
  const p = phase + (dt * speed) / (length > 1 ? length : 1)
  return p - Math.floor(p)
}

/** Pozycja (0..1) pakietu `i` z `count`: pakiety rozłożone równo po fazie. */
export function packetT(phase: number, i: number, count: number): number {
  const t = phase + i / count
  return t - Math.floor(t)
}

/** Liczba pakietów na kablu: mniej więcej jeden na 140 px, od 1 do 5. */
export function packetCount(length: number): number {
  const n = Math.round(length / 140)
  return n < 1 ? 1 : n > 5 ? 5 : n
}

/** Liczba próbek ścieżki w LUT. */
export const LUT_SAMPLES = 56

/**
 * Wypełnia `lut` (x, y na przemian) punktami równo rozłożonymi po długości ścieżki.
 * `pointAt(d)` to np. `SVGPathElement.getPointAtLength`. Wołane tylko przy zmianie ścieżki.
 */
export function fillLut(
  lut: Float32Array,
  length: number,
  pointAt: (d: number) => { x: number; y: number }
): void {
  const n = lut.length >> 1
  for (let i = 0; i < n; i++) {
    const p = pointAt(n > 1 ? (length * i) / (n - 1) : 0)
    lut[i * 2] = p.x
    lut[i * 2 + 1] = p.y
  }
}

/** Punkt na ścieżce dla `t` w [0, 1] (interpolacja liniowa między próbkami). Wynik w `out`. */
export function lutPoint(lut: Float32Array, t: number, out: { x: number; y: number }): void {
  const n = lut.length >> 1
  if (n === 0) {
    out.x = 0
    out.y = 0
    return
  }
  const f = clamp01(t) * (n - 1)
  const i = f >= n - 1 ? n - 2 : Math.floor(f)
  if (i < 0) {
    out.x = lut[0]
    out.y = lut[1]
    return
  }
  const k = f - i
  const a = i * 2
  out.x = lut[a] + (lut[a + 2] - lut[a]) * k
  out.y = lut[a + 1] + (lut[a + 3] - lut[a + 1]) * k
}
