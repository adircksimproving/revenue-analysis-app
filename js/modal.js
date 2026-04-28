import { state } from './state.js';
import { getQuarterWeeks, isWeekFuture, isWeekOnOrAfterProjectStart } from './date-utils.js';
import { updateFinancialSummary } from './metrics.js';
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

export function initModal() {
    document.getElementById('modalCancel').addEventListener('click', () => {
        document.getElementById('forecastModal').classList.remove('open');
        activeModalConsultantIndex = -1;
    });

    document.getElementById('forecastModal').addEventListener('click', (e) => {
        if (e.target.id === 'forecastModal') {
            document.getElementById('forecastModal').classList.remove('open');
            activeModalConsultantIndex = -1;
        }
    });

    document.getElementById('modalApply').addEventListener('click', applyForecast);

    document.getElementById('modalHrsInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') applyForecast();
        if (e.key === 'Escape') document.getElementById('modalCancel').click();
    });
}
