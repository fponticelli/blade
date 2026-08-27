/**
 * Level-checked logging for the language server.
 *
 * `blade.trace.server` has been a contributed setting since the first release
 * and gated nothing. Sixteen unconditional `connection.console.log` calls sat
 * on the per-request path - four per completion, one of which built
 * `completions.slice(0, 5).map(c => c.label).join(', ')` purely to log it, and
 * one that dumped every property path of the user's schema. Each of those is a
 * JSON-RPC notification serialised and written to a pipe, and completion fires
 * on nearly every character typed.
 *
 * Messages are built inside the guard, as thunks, so an off trace costs one
 * comparison.
 */

import type { TraceLevel } from './types.js';

/** Where log lines go; `connection.console` satisfies it. */
export interface LogSink {
  error(message: string): void;
  log(message: string): void;
}

/** A sink that discards everything, for tests and headless use. */
export const silentSink: LogSink = {
  error: () => {},
  log: () => {},
};

export class Logger {
  private currentLevel: TraceLevel;

  constructor(
    private readonly sink: LogSink = silentSink,
    level: TraceLevel = 'off'
  ) {
    this.currentLevel = level;
  }

  get level(): TraceLevel {
    return this.currentLevel;
  }

  setLevel(level: TraceLevel): void {
    this.currentLevel = level;
  }

  /**
   * Something went wrong.
   *
   * Always reported: an error the user cannot see is an error nobody fixes, and
   * one line per failure is not a per-keystroke cost.
   */
  error(message: string, cause?: unknown): void {
    const detail =
      cause === undefined
        ? ''
        : ` ${cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)}`;
    this.sink.error(`[blade] ${message}${detail}`);
  }

  /** Notable events. Reported at `messages` and `verbose`. */
  info(build: () => string): void {
    if (this.currentLevel === 'off') return;
    this.sink.log(`[blade] ${build()}`);
  }

  /** Per-request detail. Reported only at `verbose`. */
  verbose(build: () => string): void {
    if (this.currentLevel !== 'verbose') return;
    this.sink.log(`[blade] ${build()}`);
  }
}
