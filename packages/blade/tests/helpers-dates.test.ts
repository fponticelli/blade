/**
 * Date Helper Tests
 *
 * Dates are the one part of the standard library whose correctness depends on
 * the host: `new Date('2024-01-15')` is UTC midnight, and any local-time read
 * of it lands on the previous day west of Greenwich. These tests pin the
 * behaviour under several host zones so a UTC CI cannot hide a regression.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { resetIntlCaches, standardLibrary } from '../src/helpers/index.js';
import { compile } from '../src/compiler/index.js';
import { createStringRenderer } from '../src/renderer/index.js';
import { invokeHelper } from './helpers-support.js';

/** Renders `source` through the string sink with `globals` as `$`. */
function renderWithGlobals(
  source: string,
  globals: Record<string, unknown>
): string {
  const result = compile(source);
  if (!result.ok) {
    throw new Error(
      `template did not compile: ${result.diagnostics
        .map(diagnostic => diagnostic.message)
        .join(', ')}`
    );
  }
  return createStringRenderer(result.template)(
    {},
    { helpers: standardLibrary, globals }
  ).html;
}

const ORIGINAL_TZ = process.env.TZ;

/**
 * Runs `fn` with the host time zone set to `tz`.
 *
 * The Intl caches are reset on both sides: cached formatters resolve the host
 * zone when they are constructed, so a zone change mid-process invalidates them.
 */
function withTimeZone<T>(tz: string, fn: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  resetIntlCaches();
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previous;
    }
    resetIntlCaches();
  }
}

afterEach(() => {
  if (ORIGINAL_TZ === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = ORIGINAL_TZ;
  }
  resetIntlCaches();
});

/** Host zones spanning both sides of UTC, including a +14 offset. */
const ZONES = ['America/New_York', 'UTC', 'Asia/Tokyo', 'Pacific/Kiritimati'];

describe('calendar dates never shift with the host zone', () => {
  for (const zone of ZONES) {
    it(`formats a date-only string as the same day in ${zone}`, () => {
      withTimeZone(zone, () => {
        const { result, warnings } = invokeHelper('formatDate', ['2024-01-15']);
        expect(result).toBe('Jan 15, 2024');
        expect(warnings).toEqual([]);
      });
    });

    it(`extracts the same calendar components in ${zone}`, () => {
      withTimeZone(zone, () => {
        expect(invokeHelper('year', ['2024-01-15']).result).toBe(2024);
        expect(invokeHelper('month', ['2024-01-15']).result).toBe(1);
        expect(invokeHelper('day', ['2024-01-15']).result).toBe(15);
        expect(invokeHelper('weekday', ['2024-01-15']).result).toBe(1); // Monday
        expect(invokeHelper('hour', ['2024-01-15']).result).toBe(0);
      });
    });

    it(`formats a date-only string in short and long form in ${zone}`, () => {
      withTimeZone(zone, () => {
        expect(invokeHelper('formatDate', ['2024-01-15', 'short']).result).toBe(
          '1/15/24'
        );
        expect(invokeHelper('formatDate', ['2024-01-15', 'long']).result).toBe(
          'Monday, January 15, 2024'
        );
      });
    });
  }

  it('keeps date-only arithmetic on the calendar across a DST boundary', () => {
    withTimeZone('Europe/London', () => {
      const { result } = invokeHelper('addDays', ['2024-03-01', 30]);
      const formatted = invokeHelper('formatDate', [result]).result;
      expect(formatted).toBe('Mar 31, 2024');
      expect(invokeHelper('day', [result]).result).toBe(31);
    });
  });

  it('keeps date-only month arithmetic on the calendar', () => {
    withTimeZone('America/Los_Angeles', () => {
      const { result } = invokeHelper('addMonths', ['2024-01-31', 1]);
      expect(invokeHelper('formatDate', [result]).result).toBe('Mar 2, 2024');
    });
  });

  it('counts whole days between calendar dates', () => {
    withTimeZone('America/New_York', () => {
      const { result } = invokeHelper('diffDays', ['2024-03-01', '2024-03-31']);
      expect(result).toBe(30);
    });
  });
});

describe('missing and invalid dates', () => {
  it('renders null as an empty string', () => {
    const { result, warnings } = invokeHelper('formatDate', [null]);
    expect(result).toBe('');
    expect(warnings).toEqual([]);
  });

  it('renders undefined as an empty string', () => {
    expect(invokeHelper('formatDate', [undefined]).result).toBe('');
  });

  it('renders an empty string as an empty string', () => {
    expect(invokeHelper('formatDate', ['']).result).toBe('');
  });

  it('renders an invalid date as an empty string and warns', () => {
    const { result, warnings } = invokeHelper('formatDate', ['not-a-date']);
    expect(result).toBe('');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('formatDate(date)');
    expect(warnings[0]).toContain('"not-a-date"');
  });

  it('renders an invalid Date instance as an empty string and warns', () => {
    const { result, warnings } = invokeHelper('formatDate', [new Date('nope')]);
    expect(result).toBe('');
    expect(warnings).toHaveLength(1);
  });

  it('returns null from component helpers for a missing date', () => {
    expect(invokeHelper('year', [null]).result).toBeNull();
    expect(invokeHelper('month', [undefined]).result).toBeNull();
    expect(invokeHelper('day', ['']).result).toBeNull();
    expect(invokeHelper('weekday', [null]).result).toBeNull();
    expect(invokeHelper('hour', [null]).result).toBeNull();
    expect(invokeHelper('minute', [null]).result).toBeNull();
    expect(invokeHelper('second', [null]).result).toBeNull();
  });

  it('returns null from date arithmetic for a missing date', () => {
    expect(invokeHelper('addDays', [null, 7]).result).toBeNull();
    expect(invokeHelper('addMonths', [null, 1]).result).toBeNull();
    expect(invokeHelper('addHours', [null, 1]).result).toBeNull();
  });

  it('returns null from comparisons and differences for a missing date', () => {
    expect(invokeHelper('diffDays', [null, '2024-01-01']).result).toBeNull();
    expect(invokeHelper('isBefore', [null, '2024-01-01']).result).toBeNull();
    expect(invokeHelper('isAfter', ['2024-01-01', null]).result).toBeNull();
  });

  it('returns null from parseDate for an invalid string and warns', () => {
    const { result, warnings } = invokeHelper('parseDate', ['not-a-date']);
    expect(result).toBeNull();
    expect(warnings).toHaveLength(1);
  });
});

describe('$.timezone', () => {
  it('formats a timestamp in the requested zone', () => {
    withTimeZone('UTC', () => {
      const instant = '2024-01-15T23:30:00Z';
      expect(
        invokeHelper('formatDate', [instant, 'short'], {
          timezone: 'Asia/Tokyo',
        }).result
      ).toBe('1/16/24');
      expect(
        invokeHelper('formatDate', [instant, 'short'], {
          timezone: 'America/New_York',
        }).result
      ).toBe('1/15/24');
    });
  });

  it('makes output deterministic across host zones', () => {
    const instant = '2024-01-15T23:30:00Z';
    const results = ZONES.map(
      zone =>
        withTimeZone(zone, () =>
          invokeHelper('formatDate', [instant], { timezone: 'Europe/Rome' })
        ).result
    );
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe('Jan 16, 2024');
  });

  it('extracts components in the requested zone', () => {
    withTimeZone('UTC', () => {
      const instant = '2024-01-15T23:30:45Z';
      const tz = { timezone: 'Asia/Tokyo' };
      expect(invokeHelper('year', [instant], tz).result).toBe(2024);
      expect(invokeHelper('month', [instant], tz).result).toBe(1);
      expect(invokeHelper('day', [instant], tz).result).toBe(16);
      expect(invokeHelper('weekday', [instant], tz).result).toBe(2); // Tuesday
      expect(invokeHelper('hour', [instant], tz).result).toBe(8);
      expect(invokeHelper('minute', [instant], tz).result).toBe(30);
      expect(invokeHelper('second', [instant], tz).result).toBe(45);
    });
  });

  it('never shifts a calendar date, whatever $.timezone says', () => {
    withTimeZone('UTC', () => {
      expect(
        invokeHelper('formatDate', ['2024-01-15'], {
          timezone: 'Pacific/Kiritimati',
        }).result
      ).toBe('Jan 15, 2024');
      expect(
        invokeHelper('day', ['2024-01-15'], { timezone: 'America/New_York' })
          .result
      ).toBe(15);
    });
  });

  it('warns and falls back to the host zone for an invalid $.timezone', () => {
    withTimeZone('UTC', () => {
      const { result, warnings } = invokeHelper(
        'formatDate',
        ['2024-01-15T23:30:00Z'],
        { timezone: 'Mars/Olympus_Mons' }
      );
      expect(result).toBe('Jan 15, 2024');
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('time zone');
      expect(warnings[0]).toContain('Mars/Olympus_Mons');
    });
  });
});

describe('timestamps follow the host zone when no $.timezone is set', () => {
  it('reads local components in the host zone', () => {
    withTimeZone('Asia/Tokyo', () => {
      expect(invokeHelper('hour', ['2024-01-15T23:30:00Z']).result).toBe(8);
      expect(invokeHelper('day', ['2024-01-15T23:30:00Z']).result).toBe(16);
    });
    withTimeZone('America/New_York', () => {
      expect(invokeHelper('hour', ['2024-01-15T23:30:00Z']).result).toBe(18);
      expect(invokeHelper('day', ['2024-01-15T23:30:00Z']).result).toBe(15);
    });
  });

  it('treats a bare local timestamp as local time', () => {
    withTimeZone('America/New_York', () => {
      expect(invokeHelper('hour', ['2024-01-15T10:00:00']).result).toBe(10);
    });
    withTimeZone('Asia/Tokyo', () => {
      expect(invokeHelper('hour', ['2024-01-15T10:00:00']).result).toBe(10);
    });
  });
});

describe('now()', () => {
  it('returns the $.now global when present', () => {
    const pinned = new Date('2024-06-01T12:00:00Z');
    const { result } = invokeHelper('now', [], { now: pinned });
    expect((result as Date).getTime()).toBe(pinned.getTime());
  });

  // The test above calls the helper directly, which is exactly how the defect
  // it was meant to cover survived: through a real template, `$.now` is also a
  // BINDING named `now`, and callee resolution searched the globals before the
  // helpers - so configuring a clock, the only thing `$.now` exists for, made
  // every `now()` in the template throw NOT_CALLABLE instead. Nothing rendered
  // a template with `$.now` set, so nothing noticed. These do.
  it('is reachable through a template, not only through the registry', () => {
    expect(
      renderWithGlobals('${year(now())}', {
        now: new Date('1999-07-04T12:00:00Z'),
        timezone: 'UTC',
      })
    ).toBe('1999');
  });

  it('pins every date helper reached through it', () => {
    expect(
      renderWithGlobals('${formatDate(now(), "long")}', {
        now: new Date('1999-07-04T12:00:00Z'),
        locale: 'en-US',
        timezone: 'UTC',
      })
    ).toBe('Sunday, July 4, 1999');
  });

  it('still refuses a global bound to a name no helper claims', () => {
    expect(() => renderWithGlobals('${nope()}', { nope: 42 })).toThrow(
      /Cannot call nope/
    );
  });

  it('still refuses a host function bound under a helper name', () => {
    expect(() => renderWithGlobals('${year()}', { year: () => 1999 })).toThrow(
      /bound to a host function/
    );
  });

  it('falls back to the current time and warns for an invalid $.now', () => {
    const { result, warnings } = invokeHelper('now', [], { now: 'nope' });
    expect(result).toBeInstanceOf(Date);
    expect(Number.isNaN((result as Date).getTime())).toBe(false);
    expect(warnings).toHaveLength(1);
  });
});
