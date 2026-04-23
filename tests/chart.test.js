import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { computeChartWeeks } from '../js/chart.js';

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
