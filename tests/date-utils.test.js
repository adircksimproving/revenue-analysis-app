import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Provide a controlled state so quarter-dependent helpers are deterministic
vi.mock('../js/state.js', () => ({
    state: { currentQuarter: { year: 2026, quarter: 2 } },
}));

import { state } from '../js/state.js';
import {
    getQuarterWeeks,
    getWeekKey,
    isWeekFuture,
    groupWeeksByQuarter,
    getWeeksRemainingInQuarter,
    setCurrentQuarter,
} from '../js/date-utils.js';

// Pin "today" to April 22, 2026 (mid Q2) for all time-sensitive tests
beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 22));
    state.currentQuarter = { year: 2026, quarter: 2 };
});

afterEach(() => {
    vi.useRealTimers();
});

// ── getQuarterWeeks ──────────────────────────────────────────────────────────

describe('getQuarterWeeks', () => {
    it('returns the right number of weeks for Q1 2026', () => {
        // Jan(31→5) + Feb(28→4) + Mar(31→5) = 14
        const weeks = getQuarterWeeks(2026, 1);
        expect(weeks).toHaveLength(14);
    });

    it('first week key of Q1 is correctly formatted', () => {
        const weeks = getQuarterWeeks(2026, 1);
        expect(weeks[0]).toBe('2026-01-W1');
    });

    it('last week key of Q1 is March W5', () => {
        const weeks = getQuarterWeeks(2026, 1);
        expect(weeks[weeks.length - 1]).toBe('2026-03-W5');
    });

    it('first week key of Q3 starts in July', () => {
        const weeks = getQuarterWeeks(2026, 3);
        expect(weeks[0]).toBe('2026-07-W1');
    });

    it('Q4 starts in October', () => {
        const weeks = getQuarterWeeks(2026, 4);
        expect(weeks[0]).toBe('2026-10-W1');
    });

    it('all keys follow the YYYY-MM-WN format', () => {
        const weeks = getQuarterWeeks(2026, 2);
        weeks.forEach(w => {
            expect(w).toMatch(/^\d{4}-\d{2}-W\d+$/);
        });
    });
});

// ── getWeekKey ───────────────────────────────────────────────────────────────

describe('getWeekKey', () => {
    it('parses M/D/YY format and returns correct week key', () => {
        expect(getWeekKey('4/1/26')).toBe('2026-04-W1');
    });

    it('parses M/D/YYYY format', () => {
        expect(getWeekKey('4/1/2026')).toBe('2026-04-W1');
    });

    it('assigns day 1–7 to W1', () => {
        expect(getWeekKey('4/7/2026')).toBe('2026-04-W1');
    });

    it('assigns day 8 to W2', () => {
        expect(getWeekKey('4/8/2026')).toBe('2026-04-W2');
    });

    it('assigns day 15 to W3', () => {
        expect(getWeekKey('4/15/2026')).toBe('2026-04-W3');
    });

    it('assigns day 29 to W5', () => {
        expect(getWeekKey('4/29/2026')).toBe('2026-04-W5');
    });

    it('returns the original string for an unparseable date', () => {
        expect(getWeekKey('not-a-date')).toBe('not-a-date');
    });

    it('handles 2-digit years below 100 by adding 2000', () => {
        expect(getWeekKey('1/1/26')).toBe('2026-01-W1');
    });
});

// ── isWeekFuture ─────────────────────────────────────────────────────────────
// Fake time is April 22, 2026

describe('isWeekFuture', () => {
    it('returns false for a clearly past week', () => {
        expect(isWeekFuture('2026-04-W1')).toBe(false);
    });

    it('returns false for the current week (starts on or before today)', () => {
        // W4 of April starts April 22 — same day as fake "now", not strictly future
        expect(isWeekFuture('2026-04-W4')).toBe(false);
    });

    it('returns true for a week starting after today', () => {
        expect(isWeekFuture('2026-05-W1')).toBe(true);
    });

    it('returns true for a week far in the future', () => {
        expect(isWeekFuture('2027-01-W1')).toBe(true);
    });

    it('returns false for a past year', () => {
        expect(isWeekFuture('2025-12-W1')).toBe(false);
    });

    it('returns false for a malformed key', () => {
        expect(isWeekFuture('bad-key')).toBe(false);
    });
});

// ── groupWeeksByQuarter ──────────────────────────────────────────────────────

describe('groupWeeksByQuarter', () => {
    it('groups Q1 and Q2 weeks into separate keys', () => {
        const weeks = ['2026-01-W1', '2026-01-W2', '2026-04-W1'];
        const result = groupWeeksByQuarter(weeks);
        expect(Object.keys(result)).toEqual(['Q1 2026', 'Q2 2026']);
        expect(result['Q1 2026']).toHaveLength(2);
        expect(result['Q2 2026']).toHaveLength(1);
    });

    it('returns an empty object for an empty input', () => {
        expect(groupWeeksByQuarter([])).toEqual({});
    });

    it('handles weeks spanning multiple years', () => {
        const weeks = ['2025-12-W1', '2026-01-W1'];
        const result = groupWeeksByQuarter(weeks);
        expect(result['Q4 2025']).toHaveLength(1);
        expect(result['Q1 2026']).toHaveLength(1);
    });
});

// ── setCurrentQuarter ────────────────────────────────────────────────────────

describe('setCurrentQuarter', () => {
    it('sets year and quarter from the current date', () => {
        // Fake time is April 22, 2026 → Q2 2026
        setCurrentQuarter();
        expect(state.currentQuarter.year).toBe(2026);
        expect(state.currentQuarter.quarter).toBe(2);
    });

    it('correctly identifies Q1 (January)', () => {
        vi.setSystemTime(new Date(2026, 0, 15));
        setCurrentQuarter();
        expect(state.currentQuarter.quarter).toBe(1);
    });

    it('correctly identifies Q3 (September)', () => {
        vi.setSystemTime(new Date(2026, 8, 1));
        setCurrentQuarter();
        expect(state.currentQuarter.quarter).toBe(3);
    });

    it('correctly identifies Q4 (December)', () => {
        vi.setSystemTime(new Date(2026, 11, 31));
        setCurrentQuarter();
        expect(state.currentQuarter.quarter).toBe(4);
    });
});

// ── getWeeksRemainingInQuarter ───────────────────────────────────────────────

describe('getWeeksRemainingInQuarter', () => {
    it('returns a positive number of weeks when inside the quarter', () => {
        // April 22 is mid-Q2; end of Q2 is June 30
        state.currentQuarter = { year: 2026, quarter: 2 };
        const weeks = getWeeksRemainingInQuarter();
        expect(weeks).toBeGreaterThan(0);
    });

    it('returns 0 when today is past the quarter end', () => {
        vi.setSystemTime(new Date(2026, 6, 1)); // July 1 — Q2 already ended
        state.currentQuarter = { year: 2026, quarter: 2 };
        expect(getWeeksRemainingInQuarter()).toBe(0);
    });
});
