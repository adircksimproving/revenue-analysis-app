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

export function renderChart() {
    if (state.consultantsData.length === 0) return;

    const weeks = computeChartWeeks(state.consultantsData);
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    const labels = weeks.map(week => {
        const match = week.match(/(\d{4})-(\d{2})-W(\d+)/);
        if (!match) return week;
        return `${monthNames[parseInt(match[2]) - 1]} W${match[3]}`;
    });

    const weeklyRevenue = weeks.map(week =>
        state.consultantsData.reduce((sum, c) => sum + (c.weeklyHours[week] || 0) * c.rate, 0)
    );

    let cumulative = 0;
    let lastActualValue = 0;
    let bridgeIndex = -1;
    const actualsData = [];
    const forecastData = [];

    weeks.forEach((week, i) => {
        if (!isWeekFuture(week)) {
            cumulative += weeklyRevenue[i];
            actualsData.push(cumulative);
            forecastData.push(null);
            lastActualValue = cumulative;
            bridgeIndex = i;
        } else {
            actualsData.push(null);
            forecastData.push(null);
        }
    });

    let forecastCumulative = lastActualValue;
    weeks.forEach((week, i) => {
        if (i === bridgeIndex) {
            forecastData[i] = lastActualValue;
        } else if (isWeekFuture(week)) {
            forecastCumulative += weeklyRevenue[i];
            forecastData[i] = forecastCumulative;
        }
    });

    const budgetData = state.budgetValue > 0 ? weeks.map(() => state.budgetValue) : [];

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
                x: { grid: { color: '#f3f4f6' }, ticks: { font: { size: 12 } } },
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
