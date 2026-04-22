import { describe, it, expect, beforeEach, vi } from 'vitest';

// Prevent DOM side-effects from table and metrics during data transformation tests
vi.mock('../js/table.js', () => ({ updateQuarterDisplay: vi.fn() }));
vi.mock('../js/metrics.js', () => ({ updateFinancialSummary: vi.fn() }));
vi.mock('../js/chart.js', () => ({ renderChart: vi.fn() }));

import { renderData } from '../js/data-processor.js';
import { state } from '../js/state.js';

function makeRows(overrides = []) {
    return overrides.map(r => ({
        Worker: '',
        'Rate to Bill': '',
        'Hours To Bill': '',
        'Transaction Date': '',
        'Amount to Bill': '',
        ...r,
    }));
}

function minimalDOM() {
    document.body.innerHTML = `
        <div id="metricConsultants"></div>
        <div id="metricHours"></div>
        <div id="metricForecast"></div>
        <div id="metrics" style="display:none"></div>
        <div id="financialSummary" style="display:none"></div>
        <div id="tableContainer" style="display:none"></div>
        <div id="emptyState"></div>
    `;
}

beforeEach(() => {
    minimalDOM();
    state.consultantsData = [];
    state.currentQuarter = { year: 2026, quarter: 2 };
    state.budgetValue = 0;
    state.actualsValue = 0;
});

describe('renderData — validation', () => {
    it('returns false when no rows produce valid consultants', () => {
        const result = renderData({ rows: makeRows([{ Worker: 'Unknown', 'Hours To Bill': '0' }]) });
        expect(result).toBe(false);
    });

    it('returns false for an empty row set', () => {
        expect(renderData({ rows: [] })).toBe(false);
    });

    it('returns true when at least one valid consultant is found', () => {
        const result = renderData({ rows: makeRows([{ Worker: 'Alice', 'Rate to Bill': '100', 'Hours To Bill': '8', 'Transaction Date': '4/1/2026' }]) });
        expect(result).toBe(true);
    });
});

describe('renderData — consultant aggregation', () => {
    it('accumulates hours across multiple rows for the same consultant', () => {
        const rows = makeRows([
            { Worker: 'Alice', 'Rate to Bill': '100', 'Hours To Bill': '8', 'Transaction Date': '4/1/2026' },
            { Worker: 'Alice', 'Rate to Bill': '100', 'Hours To Bill': '16', 'Transaction Date': '4/8/2026' },
        ]);
        renderData({ rows });
        expect(state.consultantsData[0].totalHours).toBe(24);
    });

    it('uses the last non-zero rate seen for a consultant', () => {
        const rows = makeRows([
            { Worker: 'Alice', 'Rate to Bill': '100', 'Hours To Bill': '8', 'Transaction Date': '4/1/2026' },
            { Worker: 'Alice', 'Rate to Bill': '150', 'Hours To Bill': '8', 'Transaction Date': '4/8/2026' },
        ]);
        renderData({ rows });
        expect(state.consultantsData[0].rate).toBe(150);
    });

    it('strips $ and commas from the rate field', () => {
        const rows = makeRows([{ Worker: 'Alice', 'Rate to Bill': '$1,500', 'Hours To Bill': '8', 'Transaction Date': '4/1/2026' }]);
        renderData({ rows });
        expect(state.consultantsData[0].rate).toBe(1500);
    });

    it('filters out the literal "Unknown" worker name', () => {
        const rows = makeRows([{ Worker: 'Unknown', 'Rate to Bill': '100', 'Hours To Bill': '8', 'Transaction Date': '4/1/2026' }]);
        renderData({ rows });
        expect(state.consultantsData).toHaveLength(0);
    });

    it('filters out consultants with zero total hours', () => {
        const rows = makeRows([{ Worker: 'Ghost', 'Rate to Bill': '100', 'Hours To Bill': '0', 'Transaction Date': '4/1/2026' }]);
        renderData({ rows });
        expect(state.consultantsData).toHaveLength(0);
    });

    it('sorts consultants alphabetically by name', () => {
        const rows = makeRows([
            { Worker: 'Zara', 'Rate to Bill': '100', 'Hours To Bill': '8', 'Transaction Date': '4/1/2026' },
            { Worker: 'Alice', 'Rate to Bill': '100', 'Hours To Bill': '8', 'Transaction Date': '4/1/2026' },
        ]);
        renderData({ rows });
        expect(state.consultantsData[0].name).toBe('Alice');
        expect(state.consultantsData[1].name).toBe('Zara');
    });
});

describe('renderData — billedTotal calculation', () => {
    it('uses Amount to Bill when present instead of rate × hours', () => {
        const rows = makeRows([{
            Worker: 'Alice',
            'Rate to Bill': '100',
            'Hours To Bill': '8',
            'Transaction Date': '4/1/2026',
            'Amount to Bill': '1200',
        }]);
        renderData({ rows });
        // Should be 1200, not 100 * 8 = 800
        expect(state.consultantsData[0].billedTotal).toBe(1200);
    });

    it('falls back to rate × hours when Amount to Bill is absent', () => {
        const rows = makeRows([{
            Worker: 'Alice',
            'Rate to Bill': '150',
            'Hours To Bill': '10',
            'Transaction Date': '4/1/2026',
        }]);
        renderData({ rows });
        expect(state.consultantsData[0].billedTotal).toBe(1500);
    });

    it('accumulates Amount to Bill across multiple rows', () => {
        const rows = makeRows([
            { Worker: 'Alice', 'Rate to Bill': '100', 'Hours To Bill': '8', 'Transaction Date': '4/1/2026', 'Amount to Bill': '800' },
            { Worker: 'Alice', 'Rate to Bill': '100', 'Hours To Bill': '8', 'Transaction Date': '4/8/2026', 'Amount to Bill': '1000' },
        ]);
        renderData({ rows });
        expect(state.consultantsData[0].billedTotal).toBe(1800);
    });
});

describe('renderData — weekly hours grouping', () => {
    it('groups hours into weeklyHours by the Transaction Date week key', () => {
        const rows = makeRows([
            { Worker: 'Alice', 'Rate to Bill': '100', 'Hours To Bill': '8', 'Transaction Date': '4/1/2026' },
            { Worker: 'Alice', 'Rate to Bill': '100', 'Hours To Bill': '4', 'Transaction Date': '4/2/2026' },
        ]);
        renderData({ rows });
        // Both dates fall in W1 of April
        expect(state.consultantsData[0].weeklyHours['2026-04-W1']).toBe(12);
    });
});

describe('renderData — DOM updates', () => {
    it('reveals the metrics, financialSummary, and tableContainer elements', () => {
        const rows = makeRows([{ Worker: 'Alice', 'Rate to Bill': '100', 'Hours To Bill': '8', 'Transaction Date': '4/1/2026' }]);
        renderData({ rows });
        expect(document.getElementById('metrics').style.display).toBe('grid');
        expect(document.getElementById('financialSummary').style.display).toBe('grid');
        expect(document.getElementById('tableContainer').style.display).toBe('block');
        expect(document.getElementById('emptyState').style.display).toBe('none');
    });

    it('writes the consultant count to #metricConsultants', () => {
        const rows = makeRows([
            { Worker: 'Alice', 'Rate to Bill': '100', 'Hours To Bill': '8', 'Transaction Date': '4/1/2026' },
            { Worker: 'Bob', 'Rate to Bill': '200', 'Hours To Bill': '40', 'Transaction Date': '4/1/2026' },
        ]);
        renderData({ rows });
        expect(document.getElementById('metricConsultants').textContent).toBe('2');
    });
});
