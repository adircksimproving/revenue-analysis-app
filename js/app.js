import { state } from './state.js';
import { setCurrentQuarter } from './date-utils.js';
import { updateFinancialSummary, updateBurnRate } from './metrics.js';
import { initUpload } from './upload.js';
import { openForecastModal, initModal } from './modal.js';
import { api } from './api.js';
import { populateFromProject } from './data-processor.js';
import { generateProjectPDF } from './pdf-export.js';
import { generateProjectPPTX } from './pptx-export.js';
import { renderChart } from './chart.js';

setCurrentQuarter();
initUpload();
initModal();

let budgetSaveTimer = null;
function saveBudgetDebounced() {
    clearTimeout(budgetSaveTimer);
    budgetSaveTimer = setTimeout(() => {
        api.updateProject(state.projectId, { budgetValue: state.budgetValue })
            .catch(err => console.error('Failed to save budget:', err));
    }, 400);
}

const projectId = new URLSearchParams(location.search).get('id');
if (!projectId) {
    location.href = 'home.html';
} else {
    state.projectId = parseInt(projectId, 10);
    api.getProject(state.projectId)
        .then(project => {
            populateFromProject(project);
            if (project.consultants.length > 0) {
                enableExportButton();
            }
        })
        .catch(err => console.error('Failed to load project:', err));
}

document.getElementById('inputBudget').addEventListener('input', (e) => {
    state.budgetValue = parseFloat(e.target.value) || 0;
    updateFinancialSummary();
    if (state.projectId) saveBudgetDebounced();
});

let chartVisible = false;
document.getElementById('forecastToggleTile').addEventListener('click', () => {
    if (state.consultantsData.length === 0) return;
    chartVisible = !chartVisible;
    const chartContainer = document.getElementById('chartContainer');
    const icon = document.getElementById('chartToggleIcon');
    const tile = document.getElementById('forecastToggleTile');
    chartContainer.style.display = chartVisible ? 'block' : 'none';
    icon.textContent = chartVisible ? '▲ chart' : '▼ chart';
    tile.classList.toggle('chart-active', chartVisible);
});

function setChartType(type) {
    state.chartType = type;
    document.getElementById('btnBurnup').classList.toggle('active', type === 'burnup');
    document.getElementById('btnBurndown').classList.toggle('active', type === 'burndown');
    renderChart();
}

document.getElementById('btnBurnup').addEventListener('click', () => setChartType('burnup'));
document.getElementById('btnBurndown').addEventListener('click', () => setChartType('burndown'));

function enableExportButton() {
    for (const id of ['btnExportPDF', 'btnExportPPTX']) {
        const btn = document.getElementById(id);
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    }
}

document.getElementById('btnExportPDF').addEventListener('click', () => {
    generateProjectPDF(state.projectName || 'Project', state)
        .catch(err => console.error('PDF export failed:', err));
});

document.getElementById('btnExportPPTX').addEventListener('click', () => {
    generateProjectPPTX(state.projectName || 'Project', state)
        .catch(err => console.error('PPTX export failed:', err));
});

document.getElementById('burnRateTimeframe').addEventListener('change', (e) => {
    state.burnRateTimeframe = e.target.value;
    document.getElementById('burnRateCustomRange').hidden = e.target.value !== 'custom';
    updateBurnRate();
});

document.getElementById('burnRateStart').addEventListener('change', (e) => {
    if (e.target.value && e.target.min && e.target.value < e.target.min) {
        e.target.value = e.target.min;
    }
    state.burnRateCustomStart = e.target.value;
    updateBurnRate();
});

document.getElementById('burnRateEnd').addEventListener('change', (e) => {
    if (e.target.value && e.target.min && e.target.value < e.target.min) {
        e.target.value = e.target.min;
    }
    state.burnRateCustomEnd = e.target.value;
    updateBurnRate();
});

// Required: openForecastModal is called from inline onclick attributes in table rows
window.openForecastModal = openForecastModal;
