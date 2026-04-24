import { state } from './state.js';
import { getQuarterWeeks, isWeekFuture } from './date-utils.js';
import { updateFinancialSummary } from './metrics.js';

export function updateQuarterDisplay() {
    if (state.consultantsData.length > 0) {
        renderTable(state.consultantsData, getQuarterWeeks(state.currentQuarter.year, state.currentQuarter.quarter));
    }
}

function attachQuarterNavListeners() {
    const prevBtn = document.getElementById('prevQuarter');
    const nextBtn = document.getElementById('nextQuarter');

    if (prevBtn) {
        prevBtn.onclick = () => {
            state.currentQuarter.quarter--;
            if (state.currentQuarter.quarter < 1) {
                state.currentQuarter.quarter = 4;
                state.currentQuarter.year--;
            }
            updateQuarterDisplay();
        };
    }

    if (nextBtn) {
        nextBtn.onclick = () => {
            state.currentQuarter.quarter++;
            if (state.currentQuarter.quarter > 4) {
                state.currentQuarter.quarter = 1;
                state.currentQuarter.year++;
            }
            updateQuarterDisplay();
        };
    }
}

export function renderTable(consultants, weeks) {
    const tableHeader = document.getElementById('tableHeader');
    const tableBody = document.getElementById('tableBody');

    const quarterLabel = `Q${state.currentQuarter.quarter} ${state.currentQuarter.year}`;

    let headerHTML = '<tr>';
    headerHTML += '<th colspan="5"></th>';
    headerHTML += `<th colspan="${weeks.length}" class="quarter-nav-cell">`;
    headerHTML += '<div class="quarter-nav-content">';
    headerHTML += '<button id="prevQuarter" class="quarter-btn">← Prev</button>';
    headerHTML += `<span class="quarter-label">${quarterLabel}</span>`;
    headerHTML += '<button id="nextQuarter" class="quarter-btn">Next →</button>';
    headerHTML += '</div>';
    headerHTML += '</th>';
    headerHTML += '</tr>';

    headerHTML += '<tr>';
    headerHTML += '<th>Consultant Name</th>';
    headerHTML += '<th>Billing Rate</th>';
    headerHTML += '<th class="actual-col">Billed Hours to Date</th>';
    headerHTML += '<th class="actual-col">Amount Billed to Date</th>';
    headerHTML += '<th class="forecast-col">Forecast Hours</th>';

    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    weeks.forEach(week => {
        const match = week.match(/(\d{4})-(\d{2})-W(\d+)/);
        const display = match
            ? `${monthNames[parseInt(match[2]) - 1]} ${(parseInt(match[3]) - 1) * 7 + 1}`
            : week.substring(5);
        headerHTML += `<th class="week-header">${display}</th>`;
    });

    headerHTML += '</tr>';
    tableHeader.innerHTML = headerHTML;

    let bodyHTML = '';
    consultants.forEach((consultant, consultantIndex) => {
        const consultantBilledTotal = consultant.billedTotal;

        bodyHTML += '<tr>';
        bodyHTML += `<td class="consultant-name">${consultant.name}</td>`;
        bodyHTML += `<td class="rate">$${Math.round(consultant.rate).toLocaleString()}</td>`;
        bodyHTML += `<td class="hours">${Math.round(consultant.totalHours).toLocaleString()}</td>`;
        bodyHTML += `<td class="forecast">$${Math.round(consultantBilledTotal).toLocaleString()}</td>`;
        bodyHTML += `<td><button class="forecast-btn" data-consultant="${consultantIndex}" onclick="openForecastModal(${consultantIndex})">Update Forecast</button></td>`;

        weeks.forEach(week => {
            const hours = consultant.weeklyHours[week];
            if (hours && hours > 0) {
                bodyHTML += `<td class="week-cell actual">${Math.round(hours)}</td>`;
            } else {
                bodyHTML += `<td class="week-cell empty"><input type="number" class="week-input" data-consultant="${consultantIndex}" data-week="${week}" value="" placeholder="—" min="0" /></td>`;
            }
        });

        bodyHTML += '</tr>';
    });

    tableBody.innerHTML = bodyHTML;

    attachQuarterNavListeners();

    document.querySelectorAll('.week-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const consultantIndex = parseInt(e.target.dataset.consultant);
            const week = e.target.dataset.week;
            const value = parseFloat(e.target.value) || 0;

            if (value > 0) {
                state.consultantsData[consultantIndex].weeklyHours[week] = value;
                e.target.parentElement.classList.remove('empty');
                e.target.parentElement.classList.add('actual');
            } else {
                delete state.consultantsData[consultantIndex].weeklyHours[week];
            }

            if (isWeekFuture(week)) {
                updateFinancialSummary();
            }
        });
    });
}
