import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../js/chart.js', () => ({ renderChart: vi.fn() }));

import { updateFinancialSummary, updateMetrics } from '../js/metrics.js';
import { state } from '../js/state.js';
import { renderChart } from '../js/chart.js';

// Pin "today" to April 22, 2026 so isWeekFuture is deterministic
beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 22));

    document.body.innerHTML = `
        <div id="summaryActuals"></div>
        <div id="summaryForecast"></div>
        <div id="summaryVariance" class="financial-value"></div>
        <div id="metricConsultants"></div>
        <div id="metricHours"></div>
        <div id="metricForecast"></div>
        <canvas id="revenueChart"></canvas>
        <span id="chartQuarterLabel"></span>
    `;

    state.consultantsData = [];
    state.budgetValue = 0;
    state.actualsValue = 0;
    state.currentQuarter = { year: 2026, quarter: 2 };

    vi.clearAllMocks();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('updateFinancialSummary', () => {
    it('shows $0 for all fields when there is no data', () => {
        updateFinancialSummary();
        expect(document.getElementById('summaryActuals').textContent).toBe('$0');
        expect(document.getElementById('summaryForecast').textContent).toBe('$0');
    });

    it('computes actuals as the sum of billedTotal across all consultants', () => {
        state.consultantsData = [
            { rate: 100, billedTotal: 2000, weeklyHours: {} },
            { rate: 150, billedTotal: 3000, weeklyHours: {} },
        ];
        updateFinancialSummary();
        expect(document.getElementById('summaryActuals').textContent).toBe('$5,000');
    });

    it('computes forecasted revenue only from future weeks', () => {
        state.consultantsData = [{
            rate: 100,
            billedTotal: 0,
            weeklyHours: {
                '2026-04-W1': 10, // past
                '2026-05-W1': 20, // future (May 1 > April 22)
                '2026-05-W2': 10, // future (May 8 > April 22)
            },
        }];
        updateFinancialSummary();
        // forecastedRevenue = 100 * (20 + 10) = 3000
        expect(document.getElementById('summaryForecast').textContent).toBe('$3,000');
    });

    it('excludes past weeks from the forecast', () => {
        state.consultantsData = [{
            rate: 200,
            billedTotal: 0,
            weeklyHours: { '2026-03-W1': 40 }, // past
        }];
        updateFinancialSummary();
        expect(document.getElementById('summaryForecast').textContent).toBe('$0');
    });

    it('computes variance as budget − actuals − forecast', () => {
        state.budgetValue = 10000;
        state.consultantsData = [{
            rate: 100,
            billedTotal: 4000,
            weeklyHours: { '2026-05-W1': 20 },
        }];
        updateFinancialSummary();
        // variance = 10000 - 4000 - (100 * 20) = 4000
        expect(document.getElementById('summaryVariance').textContent).toBe('$4,000');
    });

    it('applies the "positive" class when variance is positive', () => {
        state.budgetValue = 99999;
        state.consultantsData = [{ rate: 100, billedTotal: 0, weeklyHours: {} }];
        updateFinancialSummary();
        expect(document.getElementById('summaryVariance').className).toContain('positive');
    });

    it('applies the "negative" class and prefixes "-$" when variance is negative', () => {
        state.budgetValue = 0;
        state.consultantsData = [{ rate: 100, billedTotal: 5000, weeklyHours: {} }];
        updateFinancialSummary();
        const el = document.getElementById('summaryVariance');
        expect(el.className).toContain('negative');
        expect(el.textContent).toMatch(/^-\$/);
    });

    it('applies no positive/negative class when variance is exactly zero', () => {
        state.budgetValue = 1000;
        state.consultantsData = [{ rate: 100, billedTotal: 1000, weeklyHours: {} }];
        updateFinancialSummary();
        const el = document.getElementById('summaryVariance');
        expect(el.className).not.toContain('positive');
        expect(el.className).not.toContain('negative');
    });

    it('calls renderChart after updating the DOM', () => {
        updateFinancialSummary();
        expect(renderChart).toHaveBeenCalledOnce();
    });
});

describe('updateMetrics', () => {
    it('writes consultant count, total hours, and total billed to the DOM', () => {
        state.consultantsData = [
            { rate: 100, billedTotal: 800, totalHours: 8, weeklyHours: {} },
            { rate: 150, billedTotal: 1500, totalHours: 10, weeklyHours: {} },
        ];
        updateMetrics();
        expect(document.getElementById('metricConsultants').textContent).toBe('2');
        expect(document.getElementById('metricHours').textContent).toBe('18');
        expect(document.getElementById('metricForecast').textContent).toBe('$2,300');
    });
});
