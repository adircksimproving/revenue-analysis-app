import { isWeekFuture } from './date-utils.js';

function weekKeyToDate(weekKey) {
    const match = weekKey.match(/(\d{4})-(\d{2})-W(\d+)/);
    if (!match) return new Date();
    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, (parseInt(match[3]) - 1) * 7 + 1);
}

export function findBudgetIntersection(weeks, labels, forecastData, budgetValue) {
    if (!budgetValue || budgetValue <= 0) return null;

    let prevVal = null;
    let prevIdx = -1;

    for (let i = 0; i < forecastData.length; i++) {
        const val = forecastData[i];
        if (val === null || val === undefined) continue;

        if (prevVal !== null) {
            const crosses = (prevVal < budgetValue && val >= budgetValue) ||
                            (prevVal > budgetValue && val <= budgetValue);
            if (crosses) {
                const frac = (budgetValue - prevVal) / (val - prevVal);
                const prevDate = weekKeyToDate(weeks[prevIdx]);
                const currDate = weekKeyToDate(weeks[i]);
                const intersectDate = new Date(prevDate.getTime() + frac * (currDate.getTime() - prevDate.getTime()));
                return {
                    weekLabel: labels[i],
                    date: intersectDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
                };
            }
        }

        prevVal = val;
        prevIdx = i;
    }

    return null;
}

export function findBurndownIntersection(weeks, labels, forecastData) {
    let prevVal = null;
    let prevIdx = -1;

    for (let i = 0; i < forecastData.length; i++) {
        const val = forecastData[i];
        if (val === null || val === undefined) continue;

        if (prevVal !== null && prevVal > 0 && val <= 0) {
            const frac = prevVal / (prevVal - val);
            const prevDate = weekKeyToDate(weeks[prevIdx]);
            const currDate = weekKeyToDate(weeks[i]);
            const intersectDate = new Date(prevDate.getTime() + frac * (currDate.getTime() - prevDate.getTime()));
            return {
                weekLabel: labels[i],
                date: intersectDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
            };
        }

        prevVal = val;
        prevIdx = i;
    }

    return null;
}

export async function fetchImageAsBase64(url) {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
}

export function computeExportMetrics(state) {
    const totalHours = state.consultantsData.reduce((s, c) => s + (c.totalHours || 0), 0);
    const totalBilled = state.consultantsData.reduce((s, c) => s + (c.billedTotal || 0), 0);
    const forecastedRevenue = state.consultantsData.reduce((sum, c) => {
        const futureHours = Object.entries(c.weeklyHours)
            .filter(([week]) => isWeekFuture(week))
            .reduce((s, [, hrs]) => s + hrs, 0);
        return sum + c.rate * futureHours;
    }, 0);
    const actuals = state.actualsValue || 0;
    const variance = (state.budgetValue || 0) - actuals - forecastedRevenue;
    return { totalHours, totalBilled, forecastedRevenue, actuals, variance };
}
