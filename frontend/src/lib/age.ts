/**
 * Pure age rules (AD-8, FR-10, FR-15): no clock reads, no DOM. Callers pass `now` from
 * `clock.now`. The age is `now − Date.parse(timestamp)`, clamped to 0 (a future timestamp
 * reads "now") and rounded down to the largest whole unit. Colour arrives in stories 2.2 and 2.3.
 */
export type AgeLabel = {
  /** The visible short form: `now`, `12m`, `5h`, `3d`, or `done …` on a completed task. */
  label: string
  /** The spoken form for assistive tech, e.g. `added 5 hours ago`. */
  words: string
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const UNITS = [
  { ms: DAY, short: 'd', word: 'day' },
  { ms: HOUR, short: 'h', word: 'hour' },
  { ms: MINUTE, short: 'm', word: 'minute' },
] as const

export function ageLabel(timestamp: string, now: number, done: boolean): AgeLabel {
  const age = Math.max(0, now - Date.parse(timestamp))
  const verb = done ? 'completed' : 'added'
  const prefix = done ? 'done ' : ''

  for (const unit of UNITS) {
    const n = Math.floor(age / unit.ms)
    if (n >= 1) {
      const plural = n === 1 ? '' : 's'
      return {
        label: `${prefix}${n}${unit.short}`,
        words: `${verb} ${n} ${unit.word}${plural} ago`,
      }
    }
  }
  return { label: `${prefix}now`, words: `${verb} just now` }
}
