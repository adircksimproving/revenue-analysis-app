import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findBudgetIntersection } from '../js/pdf-export.js';

// Silence module-level imports that require DOM or Chart.js
vi.mock('../js/chart.js', () => ({
    buildChartData: vi.fn(),
    buildChartImageForExport: vi.fn(),
}));

const weeks  = ['2026-04-W1', '2026-04-W2', '2026-04-W3', '2026-04-W4'];
const labels = ['Apr W1',     'Apr W2',     'Apr W3',     'Apr W4'];

describe('findBudgetIntersection', () => {
    it('returns null when budgetValue is 0', () => {
        const forecast = [null, 50_000, 100_000, 150_000];
        expect(findBudgetIntersection(weeks, labels, forecast, 0)).toBeNull();
    });

    it('returns null when budgetValue is negative', () => {
        const forecast = [null, 50_000, 100_000, 150_000];
        expect(findBudgetIntersection(weeks, labels, forecast, -1)).toBeNull();
    });

    it('returns null when forecast never reaches budget', () => {
        const forecast = [null, 30_000, 60_000, 80_000];
        expect(findBudgetIntersection(weeks, labels, forecast, 200_000)).toBeNull();
    });

    it('returns null when forecastData is all nulls', () => {
        const forecast = [null, null, null, null];
        expect(findBudgetIntersection(weeks, labels, forecast, 100_000)).toBeNull();
    });

    it('returns null when actuals already exceed budget (no future crossing)', () => {
        // Bridge value is already above budget — no upward crossing
        const forecast = [120_000, 140_000, 160_000, 180_000];
        expect(findBudgetIntersection(weeks, labels, forecast, 100_000)).toBeNull();
    });

    it('detects crossing and returns the week label where forecast first meets budget', () => {
        const forecast = [null, 50_000, 80_000, 120_000];
        const result = findBudgetIntersection(weeks, labels, forecast, 100_000);
        expect(result).not.toBeNull();
        expect(result.weekLabel).toBe('Apr W4');
    });

    it('returns the crossing week label when forecast hits budget exactly', () => {
        const forecast = [null, 50_000, 100_000, 150_000];
        const result = findBudgetIntersection(weeks, labels, forecast, 100_000);
        expect(result).not.toBeNull();
        expect(result.weekLabel).toBe('Apr W3');
    });

    it('detects a crossing at the very first forecast step', () => {
        // Bridge is 0, first forecast step already exceeds budget
        const forecast = [0, 150_000, 200_000, 250_000];
        const result = findBudgetIntersection(weeks, labels, forecast, 100_000);
        expect(result).not.toBeNull();
        expect(result.weekLabel).toBe('Apr W2');
    });

    it('returns a non-empty date string', () => {
        const forecast = [null, 50_000, 100_000, 150_000];
        const result = findBudgetIntersection(weeks, labels, forecast, 100_000);
        expect(result.date).toBeTypeOf('string');
        expect(result.date.length).toBeGreaterThan(0);
    });

    it('returns a date between the two bounding weeks', () => {
        // forecast crosses 100k between Apr W3 (80k) and Apr W4 (120k)
        const forecast = [null, 50_000, 80_000, 120_000];
        const result = findBudgetIntersection(weeks, labels, forecast, 100_000);
        // Apr W3 starts 2026-04-15, Apr W4 starts 2026-04-22
        const intersectDate = new Date(result.date);
        expect(intersectDate.getTime()).toBeGreaterThanOrEqual(new Date(2026, 3, 15).getTime());
        expect(intersectDate.getTime()).toBeLessThan(new Date(2026, 3, 22).getTime());
    });

    it('finds first crossing only, ignoring subsequent crossings', () => {
        // Forecast drops below budget again after Apr W3 — we only want the first cross
        const forecast = [null, 50_000, 110_000, 90_000];
        const result = findBudgetIntersection(weeks, labels, forecast, 100_000);
        expect(result).not.toBeNull();
        expect(result.weekLabel).toBe('Apr W3');
    });
});
