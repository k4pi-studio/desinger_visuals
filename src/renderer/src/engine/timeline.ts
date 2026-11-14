// Kolejka klipów po stronie okna wizualizacji: zegar cięć (czas elementu,
// potem najbliższy beat, najpóźniej po `beatGrace`).

import { TIMELINE_LIMITS } from '@shared/timeline'

const EPS = 1e-6

/** Obwiednia beatu z BeatDetector ma 1 dokładnie w klatce uderzenia. */
export function beatTriggered(beat: number): boolean {
  return beat >= 0.99
}

export interface SequencerItem {
  id: string
  duration: number
  waitBeat: boolean
}

export class Sequencer {
  private itemId: string | null = null
  private elapsed = 0
  private done = false

  /** Raz na klatkę; true = tnij teraz (raz na element). Bez alokacji. */
  step(dt: number, beat: boolean, item: SequencerItem | null): boolean {
    if (!item) {
      this.itemId = null
      return false
    }
    if (item.id !== this.itemId) {
      this.itemId = item.id
      this.elapsed = 0
      this.done = false
    }
    if (this.done) return false
    this.elapsed += Math.max(dt, 0)
    const due = this.elapsed >= item.duration - EPS
    const cut = item.waitBeat
      ? due && (beat || this.elapsed >= item.duration + TIMELINE_LIMITS.beatGrace - EPS)
      : due
    if (cut) this.done = true
    return cut
  }
}
