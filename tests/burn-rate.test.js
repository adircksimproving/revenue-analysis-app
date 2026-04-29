import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getBurnRatePeriod, calculateBurnRate, getBudgetPaceInfo, getEarliestDataDate } from '../js/burn-rate.js';

// Pin today to April 28, 2026 (Tuesday)
beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 28));
});

afterEach(() => {
    vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// getBurnRatePeriod
// ---------------------------------------------------------------------------

// Today is Tuesday Apr 28 → snapToMonday → Apr 27
describe('getBurnRatePeriod', () => {
    it('week: starts on Monday Apr 27 and ends Sunday May 3', () => {
        const { start, end } = getBurnRatePeriod('week');
        expect(start).toEqual(new Date(2026, 3, 27));
        expect(end).toEqual(new Date(2026, 4, 3));
    });

    it('biweekly: starts Monday Apr 27 and ends Sunday May 10', () => {
        const { start, end } = getBurnRatePeriod('biweekly');
        expect(start).toEqual(new Date(2026, 3, 27));
        expect(end).toEqual(new Date(2026, 4, 10));
    });

    it('month: starts Monday Apr 27 and spans 4 full weeks (ends Sun May 24)', () => {
        const { start, end } = getBurnRatePeriod('month');
        expect(start).toEqual(new Date(2026, 3, 27));
        expect(end).toEqual(new Date(2026, 4, 24));
    });

    it('custom: uses exact user-selected start and end dates without snapping', () => {
        const { start, end } = getBurnRatePeriod('custom', '2026-06-03', '2026-06-10');
        expect(start).toEqual(new Date(2026, 5, 3));   // Wed Jun 3
        expect(end).toEqual(new Date(2026, 5, 10));    // Wed Jun 10
    });

    it('custom: a Monday start and Sunday end are returned as-is', () => {
        const { start, end } = getBurnRatePeriod('custom', '2026-06-01', '2026-06-07');
        expect(start).toEqual(new Date(2026, 5, 1));   // Mon Jun 1
        expect(end).toEqual(new Date(2026, 5, 7));     // Sun Jun 7
    });

    it('custom with no dates falls back to this Monday–Sunday', () => {
        const { start, end } = getBurnRatePeriod('custom', null, null);
        expect(start).toEqual(new Date(2026, 3, 27));  // Mon Apr 27
        expect(end).toEqual(new Date(2026, 4, 3));     // Sun May 3
    });

    it('unknown timeframe defaults to 4-week Monday-aligned window', () => {
        const { start, end } = getBurnRatePeriod('quarterly');
        expect(start).toEqual(new Date(2026, 3, 27));
        expect(end).toEqual(new Date(2026, 4, 24));
    });

    it('includes a human-readable label reflecting Monday start', () => {
        const { label } = getBurnRatePeriod('week');
        expect(label).toMatch(/Apr 27/);
        expect(label).toMatch(/May 3/);
    });
});

// ---------------------------------------------------------------------------
// calculateBurnRate
// ---------------------------------------------------------------------------

describe('calculateBurnRate', () => {
    it('returns 0 with no consultants', () => {
        const start = new Date(2026, 4, 1);
        const end = new Date(2026, 4, 7);
        expect(calculateBurnRate(start, end, [])).toBe(0);
    });

    it('returns 0 when consultant has no hours in range', () => {
        const consultants = [{ rate: 100, weeklyHours: { '2026-06-W1': 40 } }];
        const start = new Date(2026, 4, 1);  // May 1
        const end = new Date(2026, 4, 7);    // May 7
        expect(calculateBurnRate(start, end, consultants)).toBe(0);
    });

    it('includes a week fully within the range', () => {
        // 2026-05-W1: May 1–7 (weekKeyToStartDate → May 1, weekKeyToEndDate → May 7)
        const consultants = [{ rate: 100, weeklyHours: { '2026-05-W1': 40 } }];
        const start = new Date(2026, 4, 1);
        const end = new Date(2026, 4, 7);
        expect(calculateBurnRate(start, end, consultants)).toBeCloseTo(4000, 0);
    });

    it('excludes a week whose start falls before the range start', () => {
        // Week 2026-04-W4: starts Apr 22. Range starts Apr 26.
        // Week start (Apr 22) < range start (Apr 26) → excluded entirely.
        const consultants = [{ rate: 100, weeklyHours: { '2026-04-W4': 70 } }];
        const start = new Date(2026, 3, 26);
        const end = new Date(2026, 3, 28);
        expect(calculateBurnRate(start, end, consultants)).toBe(0);
    });

    it('includes full hours for a week that starts within the range, even if it extends past the end', () => {
        // Week 2026-05-W1: starts May 1, ends May 7. Range ends May 3.
        // Week start (May 1) is within range → full hours counted, no proration.
        const consultants = [{ rate: 100, weeklyHours: { '2026-05-W1': 70 } }];
        const start = new Date(2026, 4, 1);
        const end = new Date(2026, 4, 3);
        expect(calculateBurnRate(start, end, consultants)).toBe(7000);
    });

    it('does not change when end date is extended within an already-counted week', () => {
        // Week 2026-05-W1: starts May 1. Both windows include this start date.
        // Extending from May 3 to May 6 should not change the burn rate.
        const consultants = [{ rate: 100, weeklyHours: { '2026-05-W1': 40 } }];
        const start = new Date(2026, 4, 1);
        const endA = new Date(2026, 4, 3);
        const endB = new Date(2026, 4, 6);
        expect(calculateBurnRate(start, endA, consultants)).toBe(calculateBurnRate(start, endB, consultants));
    });

    it('sums across multiple consultants', () => {
        const consultants = [
            { rate: 100, weeklyHours: { '2026-05-W1': 40 } },
            { rate: 150, weeklyHours: { '2026-05-W1': 40 } },
        ];
        const start = new Date(2026, 4, 1);
        const end = new Date(2026, 4, 7);
        expect(calculateBurnRate(start, end, consultants)).toBeCloseTo(40 * 100 + 40 * 150, 0);
    });

    it('sums across multiple weeks in a month window', () => {
        const consultants = [{ rate: 100, weeklyHours: {
            '2026-05-W1': 40,  // May 1–7
            '2026-05-W2': 40,  // May 8–14
            '2026-05-W3': 40,  // May 15–21
            '2026-05-W4': 40,  // May 22–28
        }}];
        const start = new Date(2026, 4, 1);
        const end = new Date(2026, 4, 28);
        // All 4 weeks fully in range → 4 * 40 * 100 = 16,000
        expect(calculateBurnRate(start, end, consultants)).toBeCloseTo(16000, 0);
    });

    it('skips weeks with zero hours', () => {
        const consultants = [{ rate: 100, weeklyHours: { '2026-05-W1': 0, '2026-05-W2': 40 } }];
        const start = new Date(2026, 4, 1);
        const end = new Date(2026, 4, 14);
        expect(calculateBurnRate(start, end, consultants)).toBeCloseTo(4000, 0);
    });
});

// ---------------------------------------------------------------------------
// getBudgetPaceInfo
// ---------------------------------------------------------------------------

describe('getBudgetPaceInfo', () => {
    it('returns null when budget is 0', () => {
        expect(getBudgetPaceInfo(5000, 30, 0, 0, null)).toBeNull();
    });

    it('returns null when burn rate is 0', () => {
        expect(getBudgetPaceInfo(0, 30, 100000, 0, null)).toBeNull();
    });

    it('returns null when windowDays is 0', () => {
        expect(getBudgetPaceInfo(5000, 0, 100000, 0, null)).toBeNull();
    });

    it('returns "Budget exhausted" when actuals >= budget', () => {
        const result = getBudgetPaceInfo(5000, 30, 100000, 100000, null);
        expect(result.text).toBe('Budget exhausted');
        expect(result.status).toBe('over');
    });

    it('returns neutral status when no end date is set', () => {
        const result = getBudgetPaceInfo(10000, 30, 500000, 0, null);
        expect(result.status).toBe('neutral');
        expect(result.text).toMatch(/weeks of budget remaining/);
    });

    it('calculates weeks to exhaustion correctly', () => {
        // dailyRate = 10000/30, remaining = 500000 - 0 = 500000
        // daysToExhaustion = 500000 / (10000/30) = 1500 days → ~214 weeks
        const result = getBudgetPaceInfo(10000, 30, 500000, 0, null);
        expect(result.text).toMatch(/~214 weeks/);
    });

    it('returns "good" status when budget outlasts project end date', () => {
        // endDate is 100 days from today (Apr 28 + 100 = Aug 6, 2026)
        const endDate = new Date(2026, 3, 28 + 100).toISOString().slice(0, 10);
        // daysToExhaustion = 500000 / (10000/30) = 1500 days >> 100 days remaining
        const result = getBudgetPaceInfo(10000, 30, 500000, 0, endDate);
        expect(result.status).toBe('good');
    });

    it('returns "over" status when budget runs out before project end date', () => {
        // endDate is 500 days from today (Apr 28 + 500)
        const endDate = new Date(2026, 3, 28 + 500).toISOString().slice(0, 10);
        // burn 10000 / 30 days, remaining = 5000
        // daysToExhaustion = 5000 / (10000/30) = 15 days << 500 days remaining
        const result = getBudgetPaceInfo(10000, 30, 100000, 95000, endDate);
        expect(result.status).toBe('over');
    });

    it('uses singular "week" when exactly 1 week remaining', () => {
        // daysToExhaustion = 7 → 1 week
        // dailyRate = budget/windowDays → need remaining = dailyRate * 7
        // dailyRate = 10000/30, remaining = 10000/30 * 7 ≈ 2333
        const result = getBudgetPaceInfo(10000, 30, 2334, 1, null);
        expect(result.text).toMatch(/~1 week of budget remaining/);
    });
});

// ---------------------------------------------------------------------------
// getEarliestDataDate
// ---------------------------------------------------------------------------

describe('getEarliestDataDate', () => {
    it('returns null for empty consultants array', () => {
        expect(getEarliestDataDate([])).toBeNull();
    });

    it('returns null when no consultant has weeklyHours', () => {
        expect(getEarliestDataDate([{ weeklyHours: {} }])).toBeNull();
    });

    it('returns the start date of the earliest week key across all consultants', () => {
        const consultants = [
            { weeklyHours: { '2026-04-W4': 10, '2026-06-W1': 8 } },
            { weeklyHours: { '2026-01-W1': 5 } },
        ];
        const result = getEarliestDataDate(consultants);
        // 2026-01-W1 → Jan 1, 2026 (week-of-month scheme: W1 = days 1–7)
        expect(result).toEqual(new Date(2026, 0, 1));
    });

    it('handles a single consultant with one week key', () => {
        const consultants = [{ weeklyHours: { '2026-04-W4': 40 } }];
        const result = getEarliestDataDate(consultants);
        expect(result).toBeInstanceOf(Date);
        expect(isNaN(result.getTime())).toBe(false);
    });

    it('picks the earlier of actuals vs forecast week keys', () => {
        // actuals start Jan, forecast starts Apr — min should be Jan
        const consultants = [
            { weeklyHours: { '2026-01-W1': 40, '2026-04-W1': 40 } },
        ];
        const result = getEarliestDataDate(consultants);
        // 2026-01-W1 → Jan 1, 2026
        expect(result).toEqual(new Date(2026, 0, 1));
    });
});
