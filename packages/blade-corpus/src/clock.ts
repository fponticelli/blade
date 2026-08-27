// The instant, locale and time zone every sample render is pinned to.
//
// Five of the seven sample projects call `now()`: `blog` prints a comment's age
// in days and a copyright year, `dashboard` stamps "generated on <date> at
// <time>", `ecommerce` prints a copyright year, `email` derives a delivery
// countdown and a membership age, and `profile` derives "member for N days",
// an online flag and per-activity hour counts.
//
// Rendered against the real clock, the markup those projects produce is a
// function of when the suite runs, so the checked-in snapshots rot on their
// own: the day counts move at every midnight, `dashboard`'s stamp moves every
// minute, and the copyright years move every New Year. That is not a
// hypothetical - the snapshots were recorded on one day and the `blog` day
// counts had already drifted by the next.
//
// The date helpers additionally read `$.locale` and `$.timezone`, and with
// neither set they fall back to the HOST's time zone - so the same commit
// rendered in Europe/Rome and in UTC produces different markup, and whichever
// machine regenerated the snapshots last wins.
//
// Both are answered by the seam the engine already provides: `now()` returns
// `$.now` when one is configured, and the formatters take `$.locale` and
// `$.timezone`. Every suite that renders a sample passes these globals, so the
// snapshots are a function of the templates and the payloads alone.

/**
 * The instant `now()` returns while rendering a sample.
 *
 * Chosen mid-day, mid-month and mid-year so that no real time zone offset
 * (-12:00 to +14:00) can move the rendered day, month or year.
 */
export const SAMPLE_NOW = new Date('2026-03-15T12:00:00.000Z');

/**
 * The globals every sample render is given.
 *
 * Passed as `globals` to `createStringRenderer`, `createDomRenderer` and
 * `createTempoRenderer` alike - all three read the same `$.now`, `$.locale`
 * and `$.timezone`, so pinning them here keeps the three sinks comparable as
 * well as keeping each one stable over time.
 */
export const SAMPLE_GLOBALS: Readonly<Record<string, unknown>> = Object.freeze({
  now: SAMPLE_NOW,
  locale: 'en-US',
  timezone: 'UTC',
});
