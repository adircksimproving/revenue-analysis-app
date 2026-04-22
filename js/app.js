import { state } from './state.js';
import { setCurrentQuarter } from './date-utils.js';
import { updateFinancialSummary } from './metrics.js';
import { initUpload } from './upload.js';
import { openForecastModal, initModal } from './modal.js';

setCurrentQuarter();
initUpload();
initModal();

document.getElementById('inputBudget').addEventListener('input', (e) => {
    state.budgetValue = parseFloat(e.target.value) || 0;
    updateFinancialSummary();
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
