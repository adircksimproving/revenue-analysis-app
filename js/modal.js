import { state } from './state.js';
import { getQuarterWeeks, isWeekFuture, isWeekOnOrAfterProjectStart, getCurrentWeekKey } from './date-utils.js';
import { updateFinancialSummary } from './metrics.js';
import { updateQuarterDisplay } from './table.js';
import { api } from './api.js';

let activeModalConsultantIndex = -1;

export function openForecastModal(consultantIndex) {
    const consultant = state.consultantsData[consultantIndex];
    activeModalConsultantIndex = consultantIndex;
    const quarterWeeks = getQuarterWeeks(state.currentQuarter.year, state.currentQuarter.quarter);
    const effectiveWeeks = quarterWeeks.filter(w => isWeekFuture(w) && isWeekOnOrAfterProjectStart(w));
    const weeksLeft = effectiveWeeks.length;
    const scope = state.endDate ? 'project' : `Q${state.currentQuarter.quarter} ${state.currentQuarter.year}`;
    document.getElementById('modalTitle').textContent = `Set Forecast — ${consultant.name}`;
    document.getElementById('modalSubtitle').textContent =
        `${weeksLeft} week${weeksLeft !== 1 ? 's' : ''} remaining in ${scope}`;
    document.getElementById('modalHrsInput').value = consultant.forecastHoursPerWeek ?? 40;
    document.getElementById('forecastModal').classList.add('open');
    setTimeout(() => document.getElementById('modalHrsInput').select(), 50);
}

async function applyForecast() {
    if (activeModalConsultantIndex < 0) return;
    const hrsPerWeek = parseFloat(document.getElementById('modalHrsInput').value) || 0;
    const consultant = state.consultantsData[activeModalConsultantIndex];
    consultant.forecastHoursPerWeek = hrsPerWeek;

    const quarterWeeks = getQuarterWeeks(state.currentQuarter.year, state.currentQuarter.quarter);
    const futureWeeklyHours = {};
    quarterWeeks.forEach(week => {
        if (!isWeekFuture(week)) return;
        if (!isWeekOnOrAfterProjectStart(week)) return;
        consultant.weeklyHours[week] = hrsPerWeek;
        futureWeeklyHours[week] = hrsPerWeek;
        const input = document.querySelector(`.week-input[data-consultant="${activeModalConsultantIndex}"][data-week="${week}"]`);
        if (input) {
            input.value = hrsPerWeek || '';
            input.parentElement.classList.remove('empty');
            input.parentElement.classList.add('actual');
        }
    });

    updateFinancialSummary();
    document.getElementById('forecastModal').classList.remove('open');
    activeModalConsultantIndex = -1;

    if (consultant.id && state.projectId) {
        try {
            await api.updateForecast(consultant.id, hrsPerWeek, futureWeeklyHours);
        } catch (err) {
            console.error('Failed to persist forecast:', err);
        }
    }
}

function closeModal() {
    document.getElementById('forecastModal').classList.remove('open');
    activeModalConsultantIndex = -1;
}

async function removeForecast() {
    if (activeModalConsultantIndex < 0) return;
    const consultant = state.consultantsData[activeModalConsultantIndex];
    const fromWeekKey = getCurrentWeekKey();

    closeModal();

    for (const key of Object.keys(consultant.weeklyHours)) {
        if (isWeekFuture(key) && !consultant.csvWeekKeys?.includes(key)) {
            delete consultant.weeklyHours[key];
        }
    }
    // Also clear current week if it has a non-CSV forecast entry
    if (consultant.weeklyHours[fromWeekKey] && !consultant.csvWeekKeys?.includes(fromWeekKey)) {
        delete consultant.weeklyHours[fromWeekKey];
    }

    updateQuarterDisplay();
    updateFinancialSummary();

    if (consultant.id && state.projectId) {
        try {
            await api.removeForecast(consultant.id, fromWeekKey);
        } catch (err) {
            console.error('Failed to remove forecast:', err);
        }
    }
}

export function initModal() {
    document.getElementById('modalCancel').addEventListener('click', closeModal);

    document.getElementById('forecastModal').addEventListener('click', (e) => {
        if (e.target.id === 'forecastModal') closeModal();
    });

    document.getElementById('modalApply').addEventListener('click', applyForecast);

    document.getElementById('modalRemoveForecast').addEventListener('click', removeForecast);

    document.getElementById('modalHrsInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') applyForecast();
        if (e.key === 'Escape') closeModal();
    });
}
