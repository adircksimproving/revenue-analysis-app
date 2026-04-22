import { state } from './state.js';
import { getWeekKey, getQuarterWeeks, getWeeksRemainingInQuarter } from './date-utils.js';
import { updateQuarterDisplay } from './table.js';
import { updateFinancialSummary } from './metrics.js';

export function renderData(data) {
    const consultantData = {};

    data.rows.forEach(row => {
        const consultantName = row['Worker'] || row['worker'] || 'Unknown';

        if (!consultantData[consultantName]) {
            consultantData[consultantName] = {
                name: consultantName,
                rate: 0,
                totalHours: 0,
                totalBilled: 0,
                weeklyHours: {},
                forecastHoursPerWeek: 40,
                forecastedHours: getWeeksRemainingInQuarter() * 40
            };
        }

        const rateValue = row['Rate to Bill'] || row['rate to bill'] || row['Rate'] || row['rate'];
        if (rateValue) {
            const rate = parseFloat(rateValue.toString().replace(/[$,]/g, ''));
            if (!isNaN(rate) && rate > 0) {
                consultantData[consultantName].rate = rate;
            }
        }

        const hoursValue = row['Hours To Bill'] || row['hours to bill'] || row['Hours'] || row['hours'];
        let hours = 0;
        if (hoursValue) {
            hours = parseFloat(hoursValue.toString().replace(/,/g, ''));
            if (!isNaN(hours)) {
                consultantData[consultantName].totalHours += hours;
            }
        }

        const amountValue = row['Amount to Bill'] || row['amount to bill'] || row['Amount to bill'];
        if (amountValue) {
            const amount = parseFloat(amountValue.toString().replace(/[$,]/g, ''));
            if (!isNaN(amount)) {
                consultantData[consultantName].totalBilled += amount;
            }
        }

        const dateValue = row['Transaction Date'] || row['transaction date'] || row['Date'] || row['date'];
        if (dateValue && !isNaN(hours) && hours > 0) {
            const weekKey = getWeekKey(dateValue);
            consultantData[consultantName].weeklyHours[weekKey] =
                (consultantData[consultantName].weeklyHours[weekKey] || 0) + hours;
        }
    });

    state.consultantsData = Object.values(consultantData)
        .filter(c => c.name !== 'Unknown' && c.totalHours > 0)
        .map(c => ({
            ...c,
            billedTotal: c.totalBilled > 0 ? c.totalBilled : c.rate * c.totalHours
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

    if (state.consultantsData.length === 0) {
        return false;
    }

    const totalConsultants = state.consultantsData.length;
    const totalHours = state.consultantsData.reduce((sum, c) => sum + c.totalHours, 0);
    const consultantBilledTotal = state.consultantsData.reduce((sum, c) => sum + c.billedTotal, 0);

    document.getElementById('metricConsultants').textContent = totalConsultants;
    document.getElementById('metricHours').textContent = Math.round(totalHours).toLocaleString();
    document.getElementById('metricForecast').textContent = '$' + Math.round(consultantBilledTotal).toLocaleString();

    document.getElementById('metrics').style.display = 'grid';
    document.getElementById('financialSummary').style.display = 'grid';
    document.getElementById('tableContainer').style.display = 'block';
    document.getElementById('emptyState').style.display = 'none';

    updateQuarterDisplay();
    updateFinancialSummary();

    return true;
}
