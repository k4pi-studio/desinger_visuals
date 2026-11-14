// Jedna pętla rAF animująca pakiety na wszystkich kablach grafu. Kable rejestrują się
// w `flows` (FlowEdge.tsx); pętla czyta poziomy audio przez `getState()`, bez rerenderów.
// W klatce nic nie alokujemy: tylko liczby i zapisy do istniejących elementów SVG.

import {
  BEAT,
  BANDS,
  DIM_ALPHA,
  LUT_SAMPLES,
  advance,
  alphaFor,
  fillLut,
  lutPoint,
  packetT,
  quantizeAlpha,
  risingEdge,
  smoothLevels,
  sourceLevel,
  speedFor,
  type FlowSource
} from './flow'
import { usePanel } from './store'

/** Kabel zarejestrowany w animacji. Pola aktualizuje FlowEdge, pętla tylko je czyta. */
export interface FlowEntry {
  /** Ścieżka kabla (do pomiaru długości i próbek LUT). */
  path: SVGPathElement | null
  /** Ścieżka zmieniła się: LUT przeliczy pętla w najbliższej klatce. */
  dirty: boolean
  lut: Float32Array
  length: number
  /** Grupa pakietów (krycie) i kwadraty: [ogon2, ogon1, głowa] na pakiet. */
  stream: SVGGElement | null
  packets: SVGRectElement[]
  /** Impuls beatu [ogon, głowa] – tylko na kablach z wyjścia `beat`. */
  pulseGroup: SVGGElement | null
  pulse: SVGRectElement[]
  source: FlowSource
  dim: boolean
  phase: number
  /** Pozycja impulsu 0..1, ujemna = brak impulsu. */
  pulseT: number
  alpha: number
}

export function createEntry(): FlowEntry {
  return {
    path: null,
    dirty: true,
    lut: new Float32Array(LUT_SAMPLES * 2),
    length: 0,
    stream: null,
    packets: [],
    pulseGroup: null,
    pulse: [],
    source: -1,
    dim: false,
    // Losowa faza startowa, żeby kable nie pulsowały w jednym rytmie.
    phase: Math.random(),
    pulseT: -1,
    alpha: -1
  }
}

/** Rejestr kabli: id kabla → stan animacji. */
export const flows = new Map<string, FlowEntry>()

/** Wygładzanie poziomów audio (s) i czas przebiegu impulsu beatu po kablu (s). */
const TAU = 0.12
const PULSE_TIME = 0.35
/** Odstępy ogonka za głową (px) i rozmiary kwadratów (px, parzyste – patrz `place`): pikselowe `● •`. */
const TAIL1_GAP = 10
const TAIL2_GAP = 18
export const HEAD = 8
export const TAIL1 = 6
export const TAIL2 = 4
export const PULSE_HEAD = 10
export const PULSE_TAIL = 8
const PULSE_GAP = 14

const levels = new Float32Array(BANDS.length)
const beat = { prev: 0 }
const pt = { x: 0, y: 0 }
let raf = 0
let last = 0
let lastAudio: unknown = null
// Stan bieżącej klatki dla `step` (zmienne modułu: `flows.forEach(step)` bez domknięć).
let frameDt = 0
let frameFire = false
let running = 0

/**
 * Ustawia kwadrat o boku `size` ze środkiem w punkcie `t` ścieżki. Zaokrąglamy środek,
 * nie róg: przy parzystym `size` róg wypada na całym pikselu, a kwadrat leży na osi kabla
 * (zaokrąglanie rogu przesuwało nieparzyste kwadraty o pół piksela w dół i w prawo).
 */
function place(e: FlowEntry, rect: SVGRectElement | undefined, t: number, size: number): void {
  if (!rect) return
  lutPoint(e.lut, t, pt)
  const x = Math.round(pt.x) - size / 2
  const y = Math.round(pt.y) - size / 2
  // Stojący pakiet (cisza) nie dotyka DOM-u.
  if (rect.x.baseVal.value !== x) rect.x.baseVal.value = x
  if (rect.y.baseVal.value !== y) rect.y.baseVal.value = y
}

function rebuild(e: FlowEntry): void {
  e.dirty = false
  const path = e.path
  if (!path) return
  e.length = path.getTotalLength()
  fillLut(e.lut, e.length, (d) => path.getPointAtLength(d))
}

/** Jeden kabel w klatce (`frameDt`, `frameFire` ustawia `frame`). */
function step(e: FlowEntry): void {
  const dt = frameDt
  if (e.dirty) rebuild(e)
  if (e.length <= 0 || !e.stream) return
  const v = sourceLevel(e.source, levels)
  e.phase = advance(e.phase, dt, speedFor(v), e.length)
  const alpha = quantizeAlpha(alphaFor(v) * (e.dim ? DIM_ALPHA : 1))
  if (alpha !== e.alpha) {
    e.alpha = alpha
    e.stream.setAttribute('opacity', String(alpha))
  }
  const count = (e.packets.length / 3) | 0
  const g1 = TAIL1_GAP / e.length
  const g2 = TAIL2_GAP / e.length
  for (let i = 0; i < count; i++) {
    const t = packetT(e.phase, i, count)
    // Ogonek chowa się pod głową, dopóki głowa nie odjedzie od portu.
    place(e, e.packets[i * 3], t >= g2 ? t - g2 : t, TAIL2)
    place(e, e.packets[i * 3 + 1], t >= g1 ? t - g1 : t, TAIL1)
    place(e, e.packets[i * 3 + 2], t, HEAD)
  }

  if (!e.pulseGroup) return
  if (frameFire && e.source === BEAT) {
    if (e.pulseT < 0) e.pulseGroup.setAttribute('opacity', '1')
    e.pulseT = 0
  }
  if (e.pulseT < 0) return
  e.pulseT += dt / PULSE_TIME
  if (e.pulseT > 1) {
    e.pulseT = -1
    e.pulseGroup.setAttribute('opacity', '0')
    return
  }
  const gp = PULSE_GAP / e.length
  place(e, e.pulse[0], e.pulseT >= gp ? e.pulseT - gp : e.pulseT, PULSE_TAIL)
  place(e, e.pulse[1], e.pulseT, PULSE_HEAD)
}

function frame(now: number): void {
  raf = requestAnimationFrame(frame)
  // Po powrocie do karty (rAF stał) nie przeskakujemy: dt najwyżej 0.1 s.
  frameDt = last ? Math.min((now - last) / 1000, 0.1) : 0
  last = now
  const state = usePanel.getState()
  smoothLevels(levels, state.audio, frameDt, TAU)
  // Uderzenie beatu sprawdzamy tylko przy nowej próbce z serwera (co ~100 ms).
  frameFire = false
  if (state.audio !== lastAudio) {
    lastAudio = state.audio
    frameFire = risingEdge(beat, state.audio.beat)
  }
  // W trybie usuwania pakiety ukrywa CSS; nie liczymy ich.
  if (state.graphMode === 'delete') return
  // forEach zamiast for…of: bez obiektu iteratora w każdej klatce.
  flows.forEach(step)
}

let motion: MediaQueryList | null = null
const reduced = (): MediaQueryList =>
  (motion ??= window.matchMedia('(prefers-reduced-motion: reduce)'))

function play(): void {
  if (raf || reduced().matches) return
  last = 0
  raf = requestAnimationFrame(frame)
}

function pause(): void {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
}

const onMotionChange = (): void => (reduced().matches ? pause() : play())

/**
 * Startuje animację (edytor grafu zamontowany). Przy `prefers-reduced-motion: reduce`
 * pętla nie rusza (i staje, gdy ustawienie zmieni się w trakcie). Zwraca funkcję zatrzymującą.
 */
export function startFlow(): () => void {
  running++
  if (running === 1) {
    reduced().addEventListener('change', onMotionChange)
    play()
  }
  return () => {
    running--
    if (running > 0) return
    reduced().removeEventListener('change', onMotionChange)
    pause()
  }
}
