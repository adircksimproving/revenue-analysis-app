import { state } from './state.js';
import { getWeekKey, getWeeksRemainingInQuarter, weekKeyToStartDate, weekKeyToEndDate, formatDateISO, parseDateRaw } from './date-utils.js';
import { updateQuarterDisplay } from './table.js';
import { updateFinancialSummary } from './metrics.js';
import { api } from './api.js';

export function processCSVRows(rows, { startDate, endDate } = {}) {
    const map = {};
    let skippedDateRows = 0;
    const projectStart = startDate ? new Date(startDate) : null;
    const projectEnd = endDate ? new Date(endDate) : null;

    rows.forEach(row => {
        const name = row['Worker'] || row['worker'] || 'Unknown';

        const hoursRaw = row['Hours To Bill'] || row['hours to bill'] || row['Hours'] || row['hours'];
        let hours = 0;
        if (hoursRaw) hours = parseFloat(hoursRaw.toString().replace(/,/g, ''));

        const dateRaw = row['Transaction Date'] || row['transaction date'] || row['Date'] || row['date'];

        if ((projectStart || projectEnd) && dateRaw && !isNaN(hours) && hours > 0) {
            const date = parseDateRaw(dateRaw);
            if (date && ((projectStart && date < projectStart) || (projectEnd && date > projectEnd))) {
                skippedDateRows++;
                return;
            }
        }

        if (!map[name]) {
            map[name] = { name, rate: 0, totalHours: 0, totalBilled: 0, weeklyHours: {} };
        }

        const rateRaw = row['Rate To Bill'] || row['Rate to Bill'] || row['rate to bill'] || row['Rate'] || row['rate'];
        if (rateRaw) {
            const rate = parseFloat(rateRaw.toString().replace(/[$,]/g, ''));
            if (!isNaN(rate) && rate > 0) map[name].rate = rate;
        }

        if (!isNaN(hours)) map[name].totalHours += hours;

        const amountRaw = row['Amount To Bill'] || row['Amount to Bill'] || row['amount to bill'] || row['Amount to bill'];
        if (amountRaw) {
            const amount = parseFloat(amountRaw.toString().replace(/[$,]/g, ''));
            if (!isNaN(amount)) map[name].totalBilled += amount;
        }

        if (dateRaw && !isNaN(hours) && hours > 0) {
            const weekKey = getWeekKey(dateRaw);
            map[name].weeklyHours[weekKey] = (map[name].weeklyHours[weekKey] || 0) + hours;
        }
    });

    const consultants = Object.values(map)
        .filter(c => c.name !== 'Unknown' && c.totalHours > 0)
        .map(c => ({
            name: c.name,
            rate: c.rate,
            billedTotal: c.totalBilled > 0 ? c.totalBilled : c.rate * c.totalHours,
            weeklyHours: c.weeklyHours,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

    return { consultants, skippedDateRows };
}

export function populateFromProject(project) {
    state.projectName = project.name ?? '';
    state.budgetValue = project.budgetValue ?? 0;
    state.startDate = project.startDate ?? null;
    state.endDate = project.endDate ?? null;

    if (project.consultants.length > 0 && (!project.startDate || !project.endDate)) {
        const allWeekKeys = project.consultants.flatMap(c => Object.keys(c.weeklyHours));
        if (allWeekKeys.length > 0) {
            const weekDates = allWeekKeys
                .map(k => ({ start: weekKeyToStartDate(k), end: weekKeyToEndDate(k) }))
                .filter(w => w.start && w.end);
            if (weekDates.length > 0) {
                const earliest = weekDates.reduce((min, w) => w.start < min.start ? w : min);
                const latest = weekDates.reduce((max, w) => w.end > max.end ? w : max);
                const startDate = project.startDate || formatDateISO(earliest.start);
                const endDate = project.endDate || formatDateISO(latest.end);
                state.startDate = startDate;
                state.endDate = endDate;
                api.updateProject(project.id, { startDate, endDate }).catch(() => {});
            }
        }
    }

    const heading = document.getElementById('projectHeading');
    if (heading && project.clientName) {
        heading.textContent = `Project Revenue Forecast | ${project.clientName}`;
    }

    state.consultantsData = project.consultants.map(c => ({
        ...c,
        totalHours: Object.values(c.weeklyHours).reduce((s, h) => s + h, 0),
        forecastedHours: getWeeksRemainingInQuarter() * (c.forecastHoursPerWeek ?? 40),
    }));

    const budgetInput = document.getElementById('inputBudget');
    if (budgetInput && state.budgetValue > 0) budgetInput.value = state.budgetValue;

    if (state.consultantsData.length === 0) return false;

    const { totalHours, totalBilled } = state.consultantsData.reduce(
        (acc, c) => ({ totalHours: acc.totalHours + c.totalHours, totalBilled: acc.totalBilled + c.billedTotal }),
        { totalHours: 0, totalBilled: 0 }
    );

    document.getElementById('metricConsultants').textContent = state.consultantsData.length;
    document.getElementById('metricHours').textContent = Math.round(totalHours).toLocaleString();
    document.getElementById('metricForecast').textContent = '$' + Math.round(totalBilled).toLocaleString();

    document.getElementById('metrics').style.display = 'grid';
    document.getElementById('financialSummary').style.display = 'grid';
    document.getElementById('tableContainer').style.display = 'block';
    document.getElementById('emptyState').style.display = 'none';

    updateQuarterDisplay();
    updateFinancialSummary();
    return true;
}

export async function renderData(data) {
    const { consultants, skippedDateRows } = processCSVRows(data.rows, {
        startDate: state.startDate,
        endDate: state.endDate,
    });
    if (consultants.length === 0) return { success: false, skippedDateRows };

    try {
        const project = await api.uploadCSV(state.projectId, consultants);
        const success = populateFromProject(project);
        return { success, skippedDateRows };
    } catch (err) {
        console.error('Failed to save CSV data:', err);
        return { success: false, skippedDateRows };
    }
}
