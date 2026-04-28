import { state } from './state.js';
import { isWeekFuture, isWeekOnOrAfterProjectStart } from './date-utils.js';
import { renderChart } from './chart.js';

export function updateFinancialSummary() {
    const forecastedRevenue = state.consultantsData.reduce((sum, c) => {
        const futureHours = Object.entries(c.weeklyHours)
            .filter(([week]) => isWeekFuture(week) && isWeekOnOrAfterProjectStart(week))
            .reduce((s, [, hrs]) => s + hrs, 0);
        return sum + c.rate * futureHours;
    }, 0);
    state.actualsValue = state.consultantsData.reduce((sum, c) => sum + c.billedTotal, 0);
    const variance = state.budgetValue - state.actualsValue - forecastedRevenue;

    document.getElementById('summaryActuals').textContent = '$' + Math.round(state.actualsValue).toLocaleString();
    document.getElementById('summaryForecast').textContent = '$' + Math.round(forecastedRevenue).toLocaleString();

    const varianceEl = document.getElementById('summaryVariance');
    varianceEl.textContent = (variance < 0 ? '-$' : '$') + Math.abs(Math.round(variance)).toLocaleString();
    varianceEl.className = 'financial-value' + (variance < 0 ? ' negative' : variance > 0 ? ' positive' : '');

    renderChart();
}

export function updateMetrics() {
    const totalConsultants = state.consultantsData.length;
    const totalHours = state.consultantsData.reduce((sum, c) => sum + c.totalHours, 0);
    const consultantBilledTotal = state.consultantsData.reduce((sum, c) => sum + c.billedTotal, 0);

    document.getElementById('metricConsultants').textContent = totalConsultants;
    document.getElementById('metricHours').textContent = Math.round(totalHours).toLocaleString();
    document.getElementById('metricForecast').textContent = '$' + Math.round(consultantBilledTotal).toLocaleString();
    updateFinancialSummary();
}
