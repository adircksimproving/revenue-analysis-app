import { state } from './state.js';
import { setCurrentQuarter } from './date-utils.js';
import { updateFinancialSummary } from './metrics.js';
import { initUpload } from './upload.js';
import { openForecastModal, initModal } from './modal.js';
import { api } from './api.js';
import { populateFromProject } from './data-processor.js';

setCurrentQuarter();
initUpload();
initModal();

// Read project ID from URL (?id=123) and load persisted data
const projectId = new URLSearchParams(location.search).get('id');
if (!projectId) {
    location.href = 'home.html';
} else {
    state.projectId = parseInt(projectId, 10);
    api.getProject(state.projectId)
        .then(project => {
            if (project.consultants.length > 0) populateFromProject(project);
        })
        .catch(err => console.error('Failed to load project:', err));
}

document.getElementById('inputBudget').addEventListener('input', (e) => {
    state.budgetValue = parseFloat(e.target.value) || 0;
    updateFinancialSummary();
    if (state.projectId) {
        api.updateProject(state.projectId, { budgetValue: state.budgetValue })
            .catch(err => console.error('Failed to save budget:', err));
    }
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

// Required: openForecastModal is called from inline onclick attributes in table rows
window.openForecastModal = openForecastModal;
