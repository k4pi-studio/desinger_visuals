// Model fizyczny kineskopu CRT: z 6 „napięć” liczy wartości dla shaderów.
// Tu jest wszystko, co zależy od czasu (fazy synchronizacji, iskrzenie),
// shadery tylko rysują. Czysty TS: bez WebGL, bez alokacji w step().
// Opis wzorów: docs/superpowers/specs/2026-11-13-crt-nodes-design.md

/** Zakres złapania synchronizacji wokół 0,5 (H i V). */
export const LOCK_RANGE = 0.25

export interface GunUniforms {
  /** Wzmocnienie sygnału działa (1 = znamionowe). */
  gain: number
  /** Odchylenie zbieżności, −0,5…0,5. */
  convergence: number
  /** Przesterowanie wzmacniacza, 0…1. */
  overdrive: number
}

const unit = (v: number): number => (v > 1 ? 1 : v > 0 ? v : 0)

export function gunUniforms(
  v: number,
  out: GunUniforms = { gain: 0, convergence: 0, overdrive: 0 }
): GunUniforms {
  const k = unit(v)
  out.gain = 2 * k
  out.convergence = k - 0.5
  out.overdrive = Math.max(0, 2 * k - 1)
  return out
}

export interface CircuitKnobs {
  hv: number
  hdef: number
  vdef: number
}

export interface CircuitUniforms {
  /** Wielkość obrazu (1 = pełny ekran), już z 1/√hvRatio, bez spadku pod obciążeniem. */
  scaleX: number
  scaleY: number
  linH: number
  linV: number
  pincushion: number
  /** HV(k) / HV znamionowe. */
  hvRatio: number
  brightness: number
  focus: number
  /** Drżenie linii w zakresie synchronizacji (ułamek szerokości). */
  jitter: number
  /** Rozstrojenie poziome: przesunięcie fazy na linię; 0 = synchronizacja. */
  hDetune: number
  hPhase: number
  /** 1 = pion poza synchronizacją (obraz się toczy). */
  vRolling: number
  vPhase: number
  /** Błysk iskry, 0…1. */
  arc: number
}

const ARC_THRESHOLD = 0.85
const ARC_RATE = 20 // błysków/s na jednostkę ponad progiem
const ARC_DECAY = 0.1 // s
const COLLAPSE = 0.1

const frac = (v: number): number => v - Math.floor(v)
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
const smoothstep = (a: number, b: number, v: number): number => {
  const t = unit((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}
/** Odchylenie poza zakres synchronizacji (0 = złapana), ze znakiem. */
const detune = (k: number): number => {
  const d = Math.abs(k - 0.5) - LOCK_RANGE
  return d > 0 ? Math.sign(k - 0.5) * d : 0
}

export class CircuitModel {
  readonly out: CircuitUniforms = {
    scaleX: 1,
    scaleY: 1,
    linH: 0,
    linV: 0,
    pincushion: 0,
    hvRatio: 1,
    brightness: 1,
    focus: 1,
    jitter: 0,
    hDetune: 0,
    hPhase: 0,
    vRolling: 0,
    vPhase: 0,
    arc: 0
  }

  step(knobs: CircuitKnobs, dt: number, random: () => number): CircuitUniforms {
    const o = this.out
    const hv = unit(knobs.hv)
    const h = unit(knobs.hdef)
    const v = unit(knobs.vdef)

    o.hvRatio = 0.5 + hv
    o.focus = o.hvRatio
    o.brightness = o.hvRatio * smoothstep(0.02, 0.15, hv)
    const size = 1 / Math.sqrt(o.hvRatio)

    o.scaleX = (0.5 + h) * size
    o.scaleY = (v < COLLAPSE ? lerp(0.003, 0.6, v / COLLAPSE) : 0.5 + v) * size
    o.linH = 0.3 * (h - 0.5)
    o.linV = 0.3 * (v - 0.5)
    o.pincushion = 0.2 * Math.abs(h - 0.5)

    const dh = detune(h)
    o.hDetune = dh * 0.08
    o.jitter = dh === 0 ? 0.004 * Math.abs(h - 0.5) : 0
    o.hPhase = frac(o.hPhase + dt * o.hDetune * 10)

    const dv = detune(v)
    o.vRolling = dv === 0 ? 0 : 1
    o.vPhase = dv === 0 ? 0 : frac(o.vPhase + dt * dv * 4)

    if (hv > ARC_THRESHOLD && random() < ARC_RATE * (hv - ARC_THRESHOLD) * dt) o.arc = 1
    else o.arc = Math.max(0, o.arc - dt / ARC_DECAY)

    return o
  }
}

export interface SignalKnobs {
  echo: number
  delay: number
  spread: number
  hum: number
}

export interface SignalUniforms {
  /** Siła pierwszego odbicia (drugie ma połowę). */
  echoGain: number
  /** Opóźnienie odbicia na kanał, ułamek szerokości ekranu. */
  delayR: number
  delayG: number
  delayB: number
  /** Dodatkowe rozsunięcie zbieżności przez Spread (R w prawo, B w lewo). */
  spreadShift: number
  /** Falowanie linii w poziomie (ułamek szerokości). */
  humAmp: number
  /** Głębokość ciemnego pasa przydźwięku, 0…1. */
  humBar: number
  /** Faza pasa i fal, [0,1). */
  humPhase: number
}

const ECHO_MAX = 0.6
const DELAY_MIN = 0.005
const DELAY_MAX = 0.08
const SPREAD_DELAY = 0.6
const SPREAD_SHIFT = 0.004
const HUM_AMP = 0.01
const HUM_BAR = 0.35
const HUM_SPEED = 0.3 // przewijanie pasa [ekran/s] – dudnienie 50 Hz z częstotliwością pola

/** Tor sygnału przed działami: odbicia w kablu i przydźwięk sieci. */
export class GunsSignal {
  readonly out: SignalUniforms = {
    echoGain: 0,
    delayR: DELAY_MIN,
    delayG: DELAY_MIN,
    delayB: DELAY_MIN,
    spreadShift: 0,
    humAmp: 0,
    humBar: 0,
    humPhase: 0
  }

  step(knobs: SignalKnobs, dt: number): SignalUniforms {
    const o = this.out
    const spread = unit(knobs.spread)
    const hum = unit(knobs.hum)
    const d = lerp(DELAY_MIN, DELAY_MAX, unit(knobs.delay))
    o.echoGain = ECHO_MAX * unit(knobs.echo)
    o.delayR = d * (1 + SPREAD_DELAY * spread)
    o.delayG = d
    o.delayB = d * (1 - SPREAD_DELAY * spread)
    o.spreadShift = SPREAD_SHIFT * spread
    o.humAmp = HUM_AMP * hum
    o.humBar = HUM_BAR * hum
    o.humPhase = frac(o.humPhase + dt * HUM_SPEED)
    return o
  }
}
