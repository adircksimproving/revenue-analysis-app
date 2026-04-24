import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../js/table.js',   () => ({ updateQuarterDisplay: vi.fn() }));
vi.mock('../js/metrics.js', () => ({ updateFinancialSummary: vi.fn() }));
vi.mock('../js/chart.js',   () => ({ renderChart: vi.fn() }));
vi.mock('../js/api.js',     () => ({ api: { uploadCSV: vi.fn(), updateProject: vi.fn() } }));

import { processCSVRows, populateFromProject } from '../js/data-processor.js';
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
        <div id="summaryActuals"></div>
        <div id="summaryForecast"></div>
        <div id="summaryVariance"></div>
        <canvas id="revenueChart"></canvas>
        <div id="chartQuarterLabel"></div>
    `;
}

beforeEach(() => {
    minimalDOM();
    state.consultantsData = [];
    state.currentQuarter = { year: 2026, quarter: 2 };
    state.budgetValue = 0;
    state.actualsValue = 0;
    state.projectId = 1;
});

// ── processCSVRows — validation ───────────────────────────────────────────────

describe('processCSVRows — validation', () => {
    it('returns an empty array when no rows produce valid consultants', () => {
        expect(processCSVRows(makeRows([{ Worker: 'Unknown', 'Hours To Bill': '0' }]))).toEqual([]);
    });

    it('returns an empty array for an empty row set', () => {
        expect(processCSVRows([])).toEqual([]);
    });

    it('returns a non-empty array when at least one valid consultant is found', () => {
        const result = processCSVRows(makeRows([{ Worker: 'Alice', 'Rate to Bill': '100', 'Hours To Bill': '8', 'Transaction Date': '4/1/2026' }]));
        expect(result.length).toBe(1);
    });
});

// ── processCSVRows — consultant aggregation ───────────────────────────────────

describe('processCSVRows — consultant aggregation', () => {
    it('accumulates hours across multiple rows for the same consultant', () => {
        const rows = makeRows([
            { Worker: 'Alice', 'Rate to Bill': '100', 'Hours To Bill': '8',  'Transaction Date': '4/1/2026' },
            { Worker: 'Alice', 'Rate to Bill': '100', 'Hours To Bill': '16', 'Transaction Date': '4/8/2026' },
        ]);
        const [alice] = processCSVRows(rows);
        expect(Object.values(alice.weeklyHours).reduce((s, h) => s + h, 0)).toBe(24);
    });

    it('uses the last non-zero rate seen for a consultant', () => {
        const rows = makeRows([
            { Worker: 'Alice', 'Rate to Bill': '100', 'Hours To Bill': '8', 'Transaction Date': '4/1/2026' },
            { Worker: 'Alice', 'Rate to Bill': '150', 'Hours To Bill': '8', 'Transaction Date': '4/8/2026' },
        ]);
        const [alice] = processCSVRows(rows);
        expect(alice.rate).toBe(150);
    });

    it('strips $ and commas from the rate field', () => {
        const rows = makeRows([{ Worker: 'Alice', 'Rate to Bill': '$1,500', 'Hours To Bill': '8', 'Transaction Date': '4/1/2026' }]);
        expect(processCSVRows(rows)[0].rate).toBe(1500);
    });

    it('filters out the literal "Unknown" worker name', () => {
        const rows = makeRows([{ Worker: 'Unknown', 'Rate to Bill': '100', 'Hours To Bill': '8', 'Transaction Date': '4/1/2026' }]);
        expect(processCSVRows(rows)).toHaveLength(0);
    });

    it('filters out consultants with zero total hours', () => {
        const rows = makeRows([{ Worker: 'Ghost', 'Rate to Bill': '100', 'Hours To Bill': '0', 'Transaction Date': '4/1/2026' }]);
        expect(processCSVRows(rows)).toHaveLength(0);
    });

    it('sorts consultants alphabetically by name', () => {
        const rows = makeRows([
            { Worker: 'Zara',  'Rate to Bill': '100', 'Hours To Bill': '8', 'Transaction Date': '4/1/2026' },
            { Worker: 'Alice', 'Rate to Bill': '100', 'Hours To Bill': '8', 'Transaction Date': '4/1/2026' },
        ]);
        const result = processCSVRows(rows);
        expect(result[0].name).toBe('Alice');
        expect(result[1].name).toBe('Zara');
    });
});

// ── processCSVRows — billedTotal calculation ──────────────────────────────────

describe('processCSVRows — billedTotal calculation', () => {
    it('uses Amount to Bill when present instead of rate × hours', () => {
        const rows = makeRows([{
            Worker: 'Alice', 'Rate to Bill': '100', 'Hours To Bill': '8',
            'Transaction Date': '4/1/2026', 'Amount to Bill': '1200',
        }]);
        expect(processCSVRows(rows)[0].billedTotal).toBe(1200);
    });

    it('falls back to rate × hours when Amount to Bill is absent', () => {
        const rows = makeRows([{ Worker: 'Alice', 'Rate to Bill': '150', 'Hours To Bill': '10', 'Transaction Date': '4/1/2026' }]);
        expect(processCSVRows(rows)[0].billedTotal).toBe(1500);
    });

    it('accumulates Amount to Bill across multiple rows', () => {
        const rows = makeRows([
            { Worker: 'Alice', 'Rate to Bill': '100', 'Hours To Bill': '8', 'Transaction Date': '4/1/2026', 'Amount to Bill': '800'  },
            { Worker: 'Alice', 'Rate to Bill': '100', 'Hours To Bill': '8', 'Transaction Date': '4/8/2026', 'Amount to Bill': '1000' },
        ]);
        expect(processCSVRows(rows)[0].billedTotal).toBe(1800);
    });
});

// ── processCSVRows — weekly hours grouping ────────────────────────────────────

describe('processCSVRows — weekly hours grouping', () => {
    it('groups hours into weeklyHours by the Transaction Date week key', () => {
        const rows = makeRows([
            { Worker: 'Alice', 'Rate to Bill': '100', 'Hours To Bill': '8', 'Transaction Date': '4/1/2026' },
            { Worker: 'Alice', 'Rate to Bill': '100', 'Hours To Bill': '4', 'Transaction Date': '4/2/2026' },
        ]);
        expect(processCSVRows(rows)[0].weeklyHours['2026-04-W1']).toBe(12);
    });
});

// ── populateFromProject — DOM updates ────────────────────────────────────────

describe('populateFromProject — DOM updates', () => {
    function makeProject(consultants) {
        return { id: 1, name: 'Test', budgetValue: 0, consultants };
    }

    it('reveals the metrics, financialSummary, and tableContainer elements', () => {
        populateFromProject(makeProject([
            { id: 1, name: 'Alice', rate: 100, forecastHoursPerWeek: 40, billedTotal: 800,
              weeklyHours: { '2026-04-W1': 8 } },
        ]));
        expect(document.getElementById('metrics').style.display).toBe('grid');
        expect(document.getElementById('financialSummary').style.display).toBe('grid');
        expect(document.getElementById('tableContainer').style.display).toBe('block');
        expect(document.getElementById('emptyState').style.display).toBe('none');
    });

    it('writes the consultant count to #metricConsultants', () => {
        populateFromProject(makeProject([
            { id: 1, name: 'Alice', rate: 100, forecastHoursPerWeek: 40, billedTotal: 800, weeklyHours: { '2026-04-W1': 8  } },
            { id: 2, name: 'Bob',   rate: 200, forecastHoursPerWeek: 40, billedTotal: 800, weeklyHours: { '2026-04-W1': 40 } },
        ]));
        expect(document.getElementById('metricConsultants').textContent).toBe('2');
    });

    it('populates state.consultantsData from the project', () => {
        populateFromProject(makeProject([
            { id: 1, name: 'Alice', rate: 100, forecastHoursPerWeek: 40, billedTotal: 800, weeklyHours: { '2026-04-W1': 8 } },
        ]));
        expect(state.consultantsData).toHaveLength(1);
        expect(state.consultantsData[0].name).toBe('Alice');
    });

    it('returns false when the project has no consultants', () => {
        expect(populateFromProject(makeProject([]))).toBe(false);
    });
});
