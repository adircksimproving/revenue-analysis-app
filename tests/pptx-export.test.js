import { describe, it, expect, vi } from 'vitest';
import { findBurndownIntersection, computeExportMetrics } from '../js/export-utils.js';

vi.mock('../js/chart.js', () => ({
    buildChartData: vi.fn(),
    buildBurndownData: vi.fn(),
    buildChartImageForExport: vi.fn(),
}));

const weeks  = ['2026-04-W1', '2026-04-W2', '2026-04-W3', '2026-04-W4'];
const labels = ['Apr W1',     'Apr W2',     'Apr W3',     'Apr W4'];

describe('findBurndownIntersection', () => {
    it('returns null when forecast never reaches zero', () => {
        const forecast = [100_000, 80_000, 60_000, 40_000];
        expect(findBurndownIntersection(weeks, labels, forecast)).toBeNull();
    });

    it('returns null when all values are null', () => {
        const forecast = [null, null, null, null];
        expect(findBurndownIntersection(weeks, labels, forecast)).toBeNull();
    });

    it('returns null when forecast is already at or below zero from the start', () => {
        const forecast = [-10_000, -20_000, -30_000, -40_000];
        expect(findBurndownIntersection(weeks, labels, forecast)).toBeNull();
    });

    it('detects crossing from positive to zero', () => {
        const forecast = [null, 50_000, 10_000, 0];
        const result = findBurndownIntersection(weeks, labels, forecast);
        expect(result).not.toBeNull();
        expect(result.weekLabel).toBe('Apr W4');
    });

    it('detects crossing from positive to negative', () => {
        const forecast = [null, 80_000, 40_000, -10_000];
        const result = findBurndownIntersection(weeks, labels, forecast);
        expect(result).not.toBeNull();
        expect(result.weekLabel).toBe('Apr W4');
    });

    it('returns the first crossing only', () => {
        // Crosses zero at W3, then goes positive again — only first crossing matters
        const forecast = [null, 50_000, -10_000, 20_000];
        const result = findBurndownIntersection(weeks, labels, forecast);
        expect(result).not.toBeNull();
        expect(result.weekLabel).toBe('Apr W3');
    });

    it('returns a non-empty date string', () => {
        const forecast = [null, 80_000, 40_000, -10_000];
        const result = findBurndownIntersection(weeks, labels, forecast);
        expect(result.date).toBeTypeOf('string');
        expect(result.date.length).toBeGreaterThan(0);
    });
});

describe('computeExportMetrics', () => {
    it('sums totalHours and totalBilled across all consultants', () => {
        const state = {
            actualsValue: 50_000,
            budgetValue: 200_000,
            consultantsData: [
                { totalHours: 100, billedTotal: 20_000, rate: 200, weeklyHours: {} },
                { totalHours: 80,  billedTotal: 16_000, rate: 200, weeklyHours: {} },
            ],
        };
        const { totalHours, totalBilled } = computeExportMetrics(state);
        expect(totalHours).toBe(180);
        expect(totalBilled).toBe(36_000);
    });

    it('computes variance as budget minus actuals minus forecast', () => {
        const state = {
            actualsValue: 60_000,
            budgetValue: 200_000,
            consultantsData: [
                { totalHours: 0, billedTotal: 0, rate: 100, weeklyHours: {} },
            ],
        };
        const { variance, forecastedRevenue } = computeExportMetrics(state);
        expect(forecastedRevenue).toBe(0);
        expect(variance).toBe(200_000 - 60_000 - 0);
    });

    it('returns zero forecastedRevenue when no weeklyHours data', () => {
        const state = {
            actualsValue: 0,
            budgetValue: 100_000,
            consultantsData: [
                { totalHours: 0, billedTotal: 0, rate: 150, weeklyHours: {} },
            ],
        };
        const { forecastedRevenue } = computeExportMetrics(state);
        expect(forecastedRevenue).toBe(0);
    });

    it('handles missing actualsValue gracefully', () => {
        const state = {
            budgetValue: 100_000,
            consultantsData: [],
        };
        const { actuals, variance } = computeExportMetrics(state);
        expect(actuals).toBe(0);
        expect(variance).toBe(100_000);
    });
});
