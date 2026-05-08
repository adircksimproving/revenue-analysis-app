import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../js/metrics.js', () => ({ updateFinancialSummary: vi.fn() }));
vi.mock('../js/chart.js', () => ({ renderChart: vi.fn() }));
vi.mock('../js/table.js', () => ({ updateQuarterDisplay: vi.fn() }));
vi.mock('../js/api.js', () => ({
    api: {
        updateForecast: vi.fn().mockResolvedValue({}),
        removeForecast: vi.fn().mockResolvedValue({ success: true }),
    },
}));

import { openForecastModal, initModal } from '../js/modal.js';
import { state } from '../js/state.js';
import { updateFinancialSummary } from '../js/metrics.js';
import { updateQuarterDisplay } from '../js/table.js';
import { api } from '../js/api.js';

function buildModalDOM() {
    document.body.innerHTML = `
        <div id="forecastModal" class="modal-overlay">
            <div class="modal-box">
                <div id="modalTitle"></div>
                <div id="modalSubtitle"></div>
                <input id="modalHrsInput" type="number" />
                <div class="modal-actions">
                    <button id="modalRemoveForecast"></button>
                    <div class="modal-actions-right">
                        <button id="modalCancel"></button>
                        <button id="modalApply"></button>
                    </div>
                </div>
            </div>
        </div>
        <thead id="tableHeader"></thead>
        <tbody id="tableBody"></tbody>
    `;
}

function makeConsultant(overrides = {}) {
    return {
        name: 'Alice',
        rate: 100,
        billedTotal: 0,
        totalHours: 40,
        weeklyHours: {},
        forecastHoursPerWeek: 40,
        forecastedHours: 80,
        ...overrides,
    };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 22)); // April 22, 2026 — mid Q2
    buildModalDOM();
    state.consultantsData = [makeConsultant()];
    state.currentQuarter = { year: 2026, quarter: 2 };
    vi.clearAllMocks();
    initModal();
});

afterEach(() => {
    vi.useRealTimers();
});

// ── openForecastModal ────────────────────────────────────────────────────────

describe('openForecastModal', () => {
    it('adds the "open" class to the modal overlay', () => {
        openForecastModal(0);
        expect(document.getElementById('forecastModal').classList.contains('open')).toBe(true);
    });

    it('populates the title with the consultant name', () => {
        openForecastModal(0);
        expect(document.getElementById('modalTitle').textContent).toContain('Alice');
    });

    it('shows weeks remaining in the subtitle', () => {
        openForecastModal(0);
        const subtitle = document.getElementById('modalSubtitle').textContent;
        expect(subtitle).toMatch(/remaining in Q2 2026/);
    });

    it('pre-fills the hours input with the consultant forecastHoursPerWeek', () => {
        state.consultantsData[0].forecastHoursPerWeek = 32;
        openForecastModal(0);
        expect(document.getElementById('modalHrsInput').value).toBe('32');
    });
});

// ── Cancel / backdrop close ──────────────────────────────────────────────────

describe('modal cancel', () => {
    it('removes the "open" class when the Cancel button is clicked', () => {
        openForecastModal(0);
        document.getElementById('modalCancel').click();
        expect(document.getElementById('forecastModal').classList.contains('open')).toBe(false);
    });

    it('removes the "open" class when the backdrop itself is clicked', () => {
        openForecastModal(0);
        document.getElementById('forecastModal').dispatchEvent(
            new MouseEvent('click', { bubbles: true })
        );
        expect(document.getElementById('forecastModal').classList.contains('open')).toBe(false);
    });

    it('Escape key closes the modal', () => {
        openForecastModal(0);
        document.getElementById('modalHrsInput').dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
        );
        expect(document.getElementById('forecastModal').classList.contains('open')).toBe(false);
    });
});

// ── applyForecast (via Apply button) ────────────────────────────────────────

describe('applyForecast', () => {
    it('updates forecastHoursPerWeek on the consultant', () => {
        openForecastModal(0);
        document.getElementById('modalHrsInput').value = '30';
        document.getElementById('modalApply').click();
        expect(state.consultantsData[0].forecastHoursPerWeek).toBe(30);
    });

    it('populates future weeks in weeklyHours with the new value', () => {
        openForecastModal(0);
        document.getElementById('modalHrsInput').value = '25';
        document.getElementById('modalApply').click();
        // 2026-05-W1 starts May 1, which is after April 22 → future
        expect(state.consultantsData[0].weeklyHours['2026-05-W1']).toBe(25);
    });

    it('does not overwrite past weeks', () => {
        state.consultantsData[0].weeklyHours['2026-04-W1'] = 8;
        openForecastModal(0);
        document.getElementById('modalHrsInput').value = '40';
        document.getElementById('modalApply').click();
        // Past week should remain unchanged
        expect(state.consultantsData[0].weeklyHours['2026-04-W1']).toBe(8);
    });

    it('closes the modal after applying', () => {
        openForecastModal(0);
        document.getElementById('modalApply').click();
        expect(document.getElementById('forecastModal').classList.contains('open')).toBe(false);
    });

    it('calls updateFinancialSummary after applying', () => {
        openForecastModal(0);
        document.getElementById('modalApply').click();
        expect(updateFinancialSummary).toHaveBeenCalled();
    });

    it('Enter key in the hours input triggers apply', () => {
        openForecastModal(0);
        document.getElementById('modalHrsInput').value = '20';
        document.getElementById('modalHrsInput').dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
        );
        expect(state.consultantsData[0].forecastHoursPerWeek).toBe(20);
        expect(document.getElementById('forecastModal').classList.contains('open')).toBe(false);
    });

    it('treats an empty input as 0 hours per week', () => {
        openForecastModal(0);
        document.getElementById('modalHrsInput').value = '';
        document.getElementById('modalApply').click();
        expect(state.consultantsData[0].forecastHoursPerWeek).toBe(0);
    });
});

// ── removeForecast (via Remove forecast button) ──────────────────────────────

describe('removeForecast', () => {
    beforeEach(() => {
        // April 22, 2026 is mid Q2; 2026-04-W4 starts Apr 22, which is current week (not future)
        // 2026-05-W1 starts May 1 — future
        state.consultantsData = [makeConsultant({
            weeklyHours: {
                '2026-03-W1': 40, // past, non-CSV
                '2026-04-W4': 40, // current week, non-CSV
                '2026-05-W1': 40, // future, non-CSV → should be cleared
                '2026-05-W2': 40, // future, non-CSV → should be cleared
                '2026-06-W1': 32, // future, non-CSV → should be cleared
            },
            csvWeekKeys: ['2026-03-W1'],
        })];
    });

    it('closes the modal', () => {
        openForecastModal(0);
        document.getElementById('modalRemoveForecast').click();
        expect(document.getElementById('forecastModal').classList.contains('open')).toBe(false);
    });

    it('removes future non-CSV weeks from state', () => {
        openForecastModal(0);
        document.getElementById('modalRemoveForecast').click();
        const hours = state.consultantsData[0].weeklyHours;
        expect(hours['2026-05-W1']).toBeUndefined();
        expect(hours['2026-05-W2']).toBeUndefined();
        expect(hours['2026-06-W1']).toBeUndefined();
    });

    it('preserves past non-CSV weeks in state', () => {
        openForecastModal(0);
        document.getElementById('modalRemoveForecast').click();
        expect(state.consultantsData[0].weeklyHours['2026-03-W1']).toBe(40);
    });

    it('calls updateQuarterDisplay to re-render the table', () => {
        openForecastModal(0);
        document.getElementById('modalRemoveForecast').click();
        expect(updateQuarterDisplay).toHaveBeenCalled();
    });

    it('calls updateFinancialSummary to refresh metrics', () => {
        openForecastModal(0);
        document.getElementById('modalRemoveForecast').click();
        expect(updateFinancialSummary).toHaveBeenCalled();
    });

    it('does not call api.removeForecast when consultant has no id', () => {
        openForecastModal(0);
        document.getElementById('modalRemoveForecast').click();
        expect(api.removeForecast).not.toHaveBeenCalled();
    });

    it('calls api.removeForecast with the consultant id when consultant has an id', () => {
        state.consultantsData[0].id = 7;
        state.projectId = 1;
        openForecastModal(0);
        document.getElementById('modalRemoveForecast').click();
        expect(api.removeForecast).toHaveBeenCalledWith(7, expect.stringMatching(/^\d{4}-\d{2}-W\d+$/));
    });
});
