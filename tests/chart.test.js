import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { computeChartWeeks, buildChartData, buildBurndownData } from '../js/chart.js';

vi.mock('../js/state.js', () => ({
    state: { currentQuarter: { year: 2026, quarter: 2 }, startDate: null, endDate: null, chartType: 'burnup' },
}));

// isWeekFuture compares week keys against today. Pin to a fixed date so tests
// don't drift as time passes.
beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 22)); // April 22, 2026 — mid Q2
});

afterEach(() => {
    vi.useRealTimers();
});

function makeConsultant(weeklyHours = {}) {
    return { name: 'Test', rate: 100, weeklyHours };
}

// ── computeChartWeeks ────────────────────────────────────────────────────────

describe('computeChartWeeks', () => {
    it('returns an empty array when there are no consultants', () => {
        expect(computeChartWeeks([])).toEqual([]);
    });

    it('returns an empty array when consultants have no weeklyHours', () => {
        expect(computeChartWeeks([makeConsultant({})])).toEqual([]);
    });

    it('includes past weeks that have actuals', () => {
        const c = makeConsultant({ '2026-04-W1': 40, '2026-04-W2': 40 });
        const weeks = computeChartWeeks([c]);
        expect(weeks).toContain('2026-04-W1');
        expect(weeks).toContain('2026-04-W2');
    });

    it('includes future weeks that have a non-zero forecast', () => {
        const c = makeConsultant({ '2026-05-W1': 40 });
        const weeks = computeChartWeeks([c]);
        expect(weeks).toContain('2026-05-W1');
    });

    it('excludes future weeks where all consultants have zero hours', () => {
        const c = makeConsultant({ '2026-05-W1': 0 });
        const weeks = computeChartWeeks([c]);
        expect(weeks).not.toContain('2026-05-W1');
    });

    it('includes a future week when at least one consultant has non-zero hours', () => {
        const c1 = makeConsultant({ '2026-05-W1': 0 });
        const c2 = makeConsultant({ '2026-05-W1': 20 });
        const weeks = computeChartWeeks([c1, c2]);
        expect(weeks).toContain('2026-05-W1');
    });

    it('returns weeks sorted chronologically', () => {
        const c = makeConsultant({
            '2026-05-W2': 40,
            '2026-04-W1': 40,
            '2026-05-W1': 40,
        });
        const weeks = computeChartWeeks([c]);
        expect(weeks).toEqual([...weeks].sort());
    });

    it('past weeks appear before future weeks', () => {
        const c = makeConsultant({ '2026-04-W1': 40, '2026-05-W1': 40 });
        const weeks = computeChartWeeks([c]);
        const pastIdx = weeks.indexOf('2026-04-W1');
        const futureIdx = weeks.indexOf('2026-05-W1');
        expect(pastIdx).toBeLessThan(futureIdx);
    });

    it('merges week keys from multiple consultants without duplicates', () => {
        const c1 = makeConsultant({ '2026-04-W1': 20, '2026-05-W1': 20 });
        const c2 = makeConsultant({ '2026-04-W1': 10, '2026-05-W2': 30 });
        const weeks = computeChartWeeks([c1, c2]);
        const unique = new Set(weeks);
        expect(unique.size).toBe(weeks.length);
        expect(weeks).toContain('2026-04-W1');
        expect(weeks).toContain('2026-05-W1');
        expect(weeks).toContain('2026-05-W2');
    });

    it('includes future weeks beyond the current quarter', () => {
        const c = makeConsultant({ '2026-07-W1': 40 }); // Q3 — future
        const weeks = computeChartWeeks([c]);
        expect(weeks).toContain('2026-07-W1');
    });
});

// ── buildBurndownData ────────────────────────────────────────────────────────
// Fake time: April 22, 2026 — weeks in Apr W1-W3 are past, W4+ are future

describe('buildBurndownData', () => {
    const budget = 100_000;

    it('actuals remaining starts below budget and decreases', () => {
        const c = makeConsultant({ '2026-04-W1': 40, '2026-04-W2': 40 });
        c.rate = 100;
        const { actualsData } = buildBurndownData([c], budget);
        const vals = actualsData.filter(v => v !== null);
        expect(vals.length).toBeGreaterThan(0);
        // All remaining values should be <= budget
        vals.forEach(v => expect(v).toBeLessThanOrEqual(budget));
        // Later values are less (more burned)
        expect(vals[vals.length - 1]).toBeLessThanOrEqual(vals[0]);
    });

    it('forecast remaining is a continuous line covering past and future periods', () => {
        const c = { ...makeConsultant({ '2026-04-W1': 40, '2026-05-W1': 40 }), rate: 100 };
        const { forecastData } = buildBurndownData([c], budget);
        // Should have no leading nulls — starts from the first period with data
        const firstNonNull = forecastData.findIndex(v => v !== null);
        const lastNonNull = forecastData.map((v, i) => v !== null ? i : -1).filter(i => i >= 0).pop();
        const nullsInMiddle = forecastData.slice(firstNonNull, lastNonNull + 1).some(v => v === null);
        expect(nullsInMiddle).toBe(false);
    });

    it('forecast remaining matches actuals remaining for past periods', () => {
        const c = { ...makeConsultant({ '2026-04-W1': 40 }), rate: 100 };
        const { actualsData, forecastData } = buildBurndownData([c], budget);
        actualsData.forEach((v, i) => {
            if (v !== null) expect(forecastData[i]).toBe(v);
        });
    });

    it('forecast remaining decreases as forecast spend accumulates', () => {
        const c = { ...makeConsultant({ '2026-04-W1': 40, '2026-05-W1': 40, '2026-06-W1': 40 }), rate: 100 };
        const { forecastData } = buildBurndownData([c], budget);
        const vals = forecastData.filter(v => v !== null);
        expect(vals.length).toBeGreaterThan(1);
        expect(vals[vals.length - 1]).toBeLessThan(vals[0]);
    });

    it('budget line is flat at 0', () => {
        const c = { ...makeConsultant({ '2026-04-W1': 40 }), rate: 100 };
        const { budgetData } = buildBurndownData([c], budget);
        expect(budgetData.length).toBeGreaterThan(0);
        budgetData.forEach(v => expect(v).toBe(0));
    });

    it('returns empty budgetData when budgetValue is 0', () => {
        const c = { ...makeConsultant({ '2026-04-W1': 40 }), rate: 100 };
        const { budgetData } = buildBurndownData([c], 0);
        expect(budgetData).toHaveLength(0);
    });

    it('actuals remaining = budget - cumulative actuals at each period', () => {
        // Single past week: 40hrs × $100 = $4,000 spent → $96,000 remaining
        const c = { ...makeConsultant({ '2026-04-W1': 40 }), rate: 100 };
        const { actualsData } = buildBurndownData([c], budget);
        const val = actualsData.find(v => v !== null);
        expect(val).toBe(budget - 4_000);
    });
});
