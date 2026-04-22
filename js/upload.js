import { parseCSV } from './csv-parser.js';
import { renderData } from './data-processor.js';

const errorContainer = document.getElementById('errorContainer');

export function showError(message) {
    errorContainer.innerHTML = `<div class="error-message">${message}</div>`;
}

export function clearError() {
    errorContainer.innerHTML = '';
}

function processFile(file) {
    clearError();
    const reader = new FileReader();

    reader.onload = (e) => {
        try {
            const csv = e.target.result;
            const data = parseCSV(csv);
            const success = renderData(data);
            if (!success) {
                showError('No valid consultant data found in CSV. Expected columns: Worker, Rate to Bill, Hours To Bill, Transaction Date');
            }
        } catch (error) {
            showError(`Error processing file: ${error.message}`);
        }
    };

    reader.onerror = () => {
        showError('Error reading file');
    };

    reader.readAsText(file);
}

export function initUpload() {
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');

    uploadZone.addEventListener('click', () => fileInput.click());

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.csv')) {
            processFile(file);
        } else {
            showError('Please upload a valid CSV file');
        }
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            processFile(file);
        }
    });
}
