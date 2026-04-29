import { weekKeyToStartDate, weekKeyToEndDate, snapToMonday, parseLocalDate } from './date-utils.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getBurnRatePeriod(timeframe, customStart, customEnd) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisMonday = snapToMonday(today);

    let start, end;
    switch (timeframe) {
        case 'week':
            start = thisMonday;
            end = new Date(thisMonday.getTime() + 6 * MS_PER_DAY);
            break;
        case 'biweekly':
            start = thisMonday;
            end = new Date(thisMonday.getTime() + 13 * MS_PER_DAY);
            break;
        case 'custom':
            start = customStart ? parseLocalDate(customStart) : thisMonday;
            end = customEnd ? parseLocalDate(customEnd) : new Date(thisMonday.getTime() + 6 * MS_PER_DAY);
            break;
        default: // month — 4 full weeks
            start = thisMonday;
            end = new Date(thisMonday.getTime() + 27 * MS_PER_DAY);
    }

    const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return { start, end, label: `${fmt(start)} – ${fmt(end)}` };
}

export function calculateBurnRate(startDate, endDate, consultantsData) {
    let total = 0;
    for (const consultant of consultantsData) {
        for (const [weekKey, hours] of Object.entries(consultant.weeklyHours)) {
            if (!hours) continue;
            const weekStart = weekKeyToStartDate(weekKey);
            if (!weekStart) continue;
            // Include a week's full hours only if it starts within the window.
            // No proration — the window end is a lookahead cutoff, not a denominator.
            if (weekStart < startDate || weekStart > endDate) continue;
            total += hours * consultant.rate;
        }
    }
    return total;
}

export function getEarliestDataDate(consultantsData) {
    let earliest = null;
    for (const consultant of consultantsData) {
        for (const weekKey of Object.keys(consultant.weeklyHours)) {
            const date = weekKeyToStartDate(weekKey);
            if (date && (!earliest || date < earliest)) earliest = date;
        }
    }
    return earliest;
}

export function getBudgetPaceInfo(burnRate, windowDays, budgetValue, actualsValue, endDate) {
    if (!budgetValue || windowDays <= 0 || burnRate <= 0) return null;

    const remainingBudget = budgetValue - actualsValue;
    if (remainingBudget <= 0) return { text: 'Budget exhausted', status: 'over' };

    const dailyRate = burnRate / windowDays;
    const daysToExhaustion = remainingBudget / dailyRate;
    const weeksToExhaustion = Math.round(daysToExhaustion / 7);
    const weeksLabel = `${weeksToExhaustion} week${weeksToExhaustion !== 1 ? 's' : ''}`;

    let status = 'neutral';
    if (endDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysRemaining = Math.max(0, (new Date(endDate) - today) / MS_PER_DAY);
        status = daysToExhaustion < daysRemaining ? 'over' : 'good';
    }

    return { text: `~${weeksLabel} of budget remaining`, status };
}
