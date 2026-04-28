import { state } from './state.js';
import { isWeekFuture } from './date-utils.js';

let revenueChart = null;

// Returns all past weeks with actuals plus all future weeks that have a non-zero
// forecast across any consultant, sorted chronologically.
export function computeChartWeeks(consultantsData) {
    const allKeys = new Set();
    consultantsData.forEach(c => Object.keys(c.weeklyHours).forEach(w => allKeys.add(w)));

    const past = [...allKeys].filter(w => !isWeekFuture(w)).sort();
    const future = [...allKeys].filter(w =>
        isWeekFuture(w) &&
        consultantsData.reduce((sum, c) => sum + (c.weeklyHours[w] || 0), 0) > 0
    ).sort();

    return [...past, ...future];
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getGranularity(weekCount) {
    if (weekCount <= 26)  return 'week';
    if (weekCount <= 215) return 'month';
    return 'quarter';
}

function weekToPeriodKey(weekKey, granularity) {
    if (granularity === 'week') return weekKey;
    const match = weekKey.match(/(\d{4})-(\d{2})-W\d+/);
    if (!match) return weekKey;
    const year = parseInt(match[1]);
    const month = parseInt(match[2]);
    if (granularity === 'month') return `${year}-${String(month).padStart(2, '0')}`;
    return `${year}-Q${Math.ceil(month / 3)}`;
}

function periodLabel(periodKey, granularity) {
    if (granularity === 'week') {
        const match = periodKey.match(/(\d{4})-(\d{2})-W(\d+)/);
        if (!match) return periodKey;
        const day = (parseInt(match[3]) - 1) * 7 + 1;
        return `${MONTH_NAMES[parseInt(match[2]) - 1]} ${day}`;
    }
    if (granularity === 'month') {
        const match = periodKey.match(/(\d{4})-(\d{2})/);
        if (!match) return periodKey;
        return `${MONTH_NAMES[parseInt(match[2]) - 1]} ${match[1]}`;
    }
    // quarter: '2026-Q2' → 'Q2 2026'
    const match = periodKey.match(/(\d{4})-Q(\d)/);
    return match ? `Q${match[2]} ${match[1]}` : periodKey;
}

export function buildChartData(consultantsData, budgetValue) {
    const weeks = computeChartWeeks(consultantsData);
    const granularity = getGranularity(weeks.length);

    // Per-week revenue
    const weekRevenue = {};
    weeks.forEach(w => {
        weekRevenue[w] = consultantsData.reduce((sum, c) => sum + (c.weeklyHours[w] || 0) * c.rate, 0);
    });

    // Group weeks into ordered periods
    const periodOrder = [];
    const weeksInPeriod = {};
    weeks.forEach(w => {
        const key = weekToPeriodKey(w, granularity);
        if (!weeksInPeriod[key]) { weeksInPeriod[key] = []; periodOrder.push(key); }
        weeksInPeriod[key].push(w);
    });

    const labels = periodOrder.map(k => periodLabel(k, granularity));

    // Actuals: cumulative sum of non-future weeks
    let cumulative = 0;
    let lastActualValue = 0;
    let bridgeIndex = -1;
    const actualsData = new Array(periodOrder.length).fill(null);

    periodOrder.forEach((key, i) => {
        const hasPast = weeksInPeriod[key].some(w => !isWeekFuture(w));
        if (hasPast) {
            const actualRev = weeksInPeriod[key]
                .filter(w => !isWeekFuture(w))
                .reduce((sum, w) => sum + weekRevenue[w], 0);
            cumulative += actualRev;
            actualsData[i] = cumulative;
            lastActualValue = cumulative;
            bridgeIndex = i;
        }
    });

    // Forecast: starts at lastActualValue from the bridge period
    let forecastCumulative = lastActualValue;
    const forecastData = new Array(periodOrder.length).fill(null);

    periodOrder.forEach((key, i) => {
        if (i === bridgeIndex) {
            forecastData[i] = lastActualValue;
        } else if (i > bridgeIndex) {
            const forecastRev = weeksInPeriod[key]
                .filter(w => isWeekFuture(w))
                .reduce((sum, w) => sum + weekRevenue[w], 0);
            forecastCumulative += forecastRev;
            forecastData[i] = forecastCumulative;
        }
    });

    const budgetData = budgetValue > 0 ? periodOrder.map(() => budgetValue) : [];

    return { labels, actualsData, forecastData, budgetData };
}

export function renderChart() {
    if (state.consultantsData.length === 0) return;

    const { labels, actualsData, forecastData, budgetData } = buildChartData(state.consultantsData, state.budgetValue);

    const datasets = [
        {
            label: 'Actuals',
            data: actualsData,
            borderColor: '#059669',
            backgroundColor: 'rgba(5,150,105,0.08)',
            borderWidth: 2.5,
            pointRadius: 4,
            pointBackgroundColor: '#059669',
            tension: 0.3,
            fill: false,
            spanGaps: false,
        },
        {
            label: 'Forecast',
            data: forecastData,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59,130,246,0.08)',
            borderWidth: 2.5,
            borderDash: [6, 4],
            pointRadius: 3,
            pointBackgroundColor: '#3b82f6',
            tension: 0.3,
            fill: false,
            spanGaps: false,
        },
    ];

    if (state.budgetValue > 0) {
        datasets.push({
            label: 'Budget',
            data: budgetData,
            borderColor: '#9ca3af',
            borderWidth: 1.5,
            borderDash: [4, 4],
            pointRadius: 0,
            tension: 0,
            fill: false,
        });
    }

    document.getElementById('chartQuarterLabel').textContent =
        `${state.currentQuarter.quarter} ${state.currentQuarter.year}`;

    const chartConfig = {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { usePointStyle: true, padding: 20, font: { size: 13 } }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => ctx.parsed.y === null ? null :
                            `${ctx.dataset.label}: $${Math.round(ctx.parsed.y).toLocaleString()}`
                    }
                }
            },
            scales: {
                x: { grid: { color: '#f3f4f6' }, ticks: { font: { size: 12 }, maxRotation: 45, minRotation: 0 } },
                y: {
                    grid: { color: '#f3f4f6' },
                    ticks: {
                        font: { size: 12 },
                        callback: v => '$' + Math.round(v).toLocaleString()
                    }
                }
            }
        }
    };

    if (revenueChart) {
        revenueChart.data = chartConfig.data;
        revenueChart.update();
    } else {
        const ctx = document.getElementById('revenueChart').getContext('2d');
        revenueChart = new Chart(ctx, chartConfig);
    }
}

// Returns a base64 PNG of the chart rendered to an off-screen canvas at a fixed
// size. Using an off-screen canvas with responsive:false avoids the 0×0 dimension
// problem that occurs when the chart container is display:none on the page.
export function buildChartImageForExport(consultantsData, budgetValue) {
    const { labels, actualsData, forecastData, budgetData } = buildChartData(consultantsData, budgetValue);

    const datasets = [
        {
            label: 'Actuals',
            data: actualsData,
            borderColor: '#059669',
            backgroundColor: 'rgba(5,150,105,0.08)',
            borderWidth: 2.5,
            pointRadius: 4,
            pointBackgroundColor: '#059669',
            tension: 0.3,
            fill: false,
            spanGaps: false,
        },
        {
            label: 'Forecast',
            data: forecastData,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59,130,246,0.08)',
            borderWidth: 2.5,
            borderDash: [6, 4],
            pointRadius: 3,
            pointBackgroundColor: '#3b82f6',
            tension: 0.3,
            fill: false,
            spanGaps: false,
        },
    ];

    if (budgetValue > 0) {
        datasets.push({
            label: 'Budget',
            data: budgetData,
            borderColor: '#9ca3af',
            borderWidth: 1.5,
            borderDash: [4, 4],
            pointRadius: 0,
            tension: 0,
            fill: false,
        });
    }

    const offscreen = document.createElement('canvas');
    offscreen.width = 800;
    offscreen.height = 400;

    const tempChart = new Chart(offscreen.getContext('2d'), {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top', labels: { usePointStyle: true, padding: 20, font: { size: 13 } } },
                tooltip: { enabled: false },
            },
            scales: {
                x: { grid: { color: '#f3f4f6' }, ticks: { font: { size: 12 } } },
                y: {
                    grid: { color: '#f3f4f6' },
                    ticks: { font: { size: 12 }, callback: v => '$' + Math.round(v).toLocaleString() },
                },
            },
        },
    });

    const img = tempChart.toBase64Image('image/png', 1.0);
    tempChart.destroy();
    return img;
}
