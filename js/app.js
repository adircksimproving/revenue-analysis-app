import { state } from './state.js';
import { setCurrentQuarter } from './date-utils.js';
import { updateFinancialSummary } from './metrics.js';
import { initUpload } from './upload.js';
import { openForecastModal, initModal } from './modal.js';
import { api } from './api.js';
import { populateFromProject } from './data-processor.js';
import { generateProjectPDF } from './pdf-export.js';

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

function enableExportButton() {
    const btn = document.getElementById('btnExportPDF');
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
}

document.getElementById('btnExportPDF').addEventListener('click', () => {
    generateProjectPDF(state.projectName || 'Project', state)
        .catch(err => console.error('PDF export failed:', err));
});

// Required: openForecastModal is called from inline onclick attributes in table rows
window.openForecastModal = openForecastModal;
