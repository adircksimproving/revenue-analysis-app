import { state } from './state.js';
import { isWeekFuture, isWeekOnOrAfterProjectStart } from './date-utils.js';
import { renderChart } from './chart.js';
import { calculateBurnRate, getBurnRatePeriod, getBudgetPaceInfo, getEarliestDataDate } from './burn-rate.js';

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
    updateBurnRate();
}

export function updateBurnRate() {
    const timeframe = state.burnRateTimeframe || 'month';
    const { start, end, label } = getBurnRatePeriod(
        timeframe,
        state.burnRateCustomStart,
        state.burnRateCustomEnd
    );

    const windowDays = Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1;
    const burnRate = calculateBurnRate(start, end, state.consultantsData);

    document.getElementById('burnRateValue').textContent = '$' + Math.round(burnRate).toLocaleString();
    document.getElementById('burnRatePeriodLabel').textContent = label;

    const earliest = getEarliestDataDate(state.consultantsData);
    const minVal = earliest ? earliest.toISOString().slice(0, 10) : '';
    document.getElementById('burnRateStart').min = minVal;
    document.getElementById('burnRateEnd').min = minVal;

    const paceInfo = getBudgetPaceInfo(burnRate, windowDays, state.budgetValue, state.actualsValue, state.endDate);
    const paceEl = document.getElementById('burnRatePace');
    if (paceInfo) {
        paceEl.textContent = paceInfo.text;
        paceEl.className = 'burn-rate-pace ' + paceInfo.status;
    } else {
        paceEl.textContent = '';
        paceEl.className = 'burn-rate-pace';
    }
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
