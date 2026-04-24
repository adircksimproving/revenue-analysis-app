import { buildChartData, buildChartImageForExport } from './chart.js';
import { isWeekFuture } from './date-utils.js';

function weekKeyToDate(weekKey) {
    const match = weekKey.match(/(\d{4})-(\d{2})-W(\d+)/);
    if (!match) return new Date();
    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, (parseInt(match[3]) - 1) * 7 + 1);
}

// Pure function: finds where the forecast line first crosses the flat budget line.
// Returns { weekLabel, date } or null if no crossing exists.
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

async function fetchImageAsBase64(url) {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
}

function drawTile(doc, x, y, w, h, label, value, valueColor) {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, y, w, h, 4, 4, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text(label.toUpperCase(), x + 10, y + 16);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    if (valueColor) {
        doc.setTextColor(...valueColor);
    } else {
        doc.setTextColor(26, 26, 26);
    }
    doc.text(String(value), x + 10, y + 42);
}

export async function generateProjectPDF(projectName, state) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });

    const margin = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    // ── HEADER ─────────────────────────────────────────────────────────────
    const logoData = await fetchImageAsBase64('/assets/improving-logo-full.png');
    doc.addImage(logoData, 'PNG', margin, y, 110, 28);

    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.5);
    doc.line(margin + 118, y + 4, margin + 118, y + 24);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(26, 26, 26);
    doc.text(projectName, margin + 128, y + 19);

    y += 44;

    doc.setDrawColor(229, 231, 235);
    doc.line(margin, y, pageWidth - margin, y);
    y += 20;

    // ── METRIC TILES (3) ────────────────────────────────────────────────────
    const gap = 8;
    const tileH = 60;
    const tileW3 = (contentWidth - gap * 2) / 3;

    const totalHours = state.consultantsData.reduce((s, c) => s + (c.totalHours || 0), 0);
    const totalBilled = state.consultantsData.reduce((s, c) => s + (c.billedTotal || 0), 0);

    drawTile(doc, margin, y, tileW3, tileH,
        'Total Consultants', String(state.consultantsData.length));
    drawTile(doc, margin + tileW3 + gap, y, tileW3, tileH,
        'Billed Hours to Date', Math.round(totalHours).toLocaleString());
    drawTile(doc, margin + (tileW3 + gap) * 2, y, tileW3, tileH,
        'Amount Billed to Date', '$' + Math.round(totalBilled).toLocaleString());

    y += tileH + 12;

    // ── FINANCIAL SUMMARY (4) ───────────────────────────────────────────────
    const tileW4 = (contentWidth - gap * 3) / 4;

    const forecastedRevenue = state.consultantsData.reduce((sum, c) => {
        const futureHours = Object.entries(c.weeklyHours)
            .filter(([week]) => isWeekFuture(week))
            .reduce((s, [, hrs]) => s + hrs, 0);
        return sum + c.rate * futureHours;
    }, 0);
    const actuals = state.actualsValue || 0;
    const variance = state.budgetValue - actuals - forecastedRevenue;
    const varianceStr = (variance < 0 ? '-$' : '$') + Math.abs(Math.round(variance)).toLocaleString();
    const varianceColor = variance < 0 ? [220, 38, 38] : [5, 150, 105];

    drawTile(doc, margin, y, tileW4, tileH,
        'Budget', '$' + Math.round(state.budgetValue || 0).toLocaleString());
    drawTile(doc, margin + (tileW4 + gap), y, tileW4, tileH,
        'Actuals', '$' + Math.round(actuals).toLocaleString());
    drawTile(doc, margin + (tileW4 + gap) * 2, y, tileW4, tileH,
        'Forecast', '$' + Math.round(forecastedRevenue).toLocaleString());
    drawTile(doc, margin + (tileW4 + gap) * 3, y, tileW4, tileH,
        'Variance', varianceStr, varianceColor);

    y += tileH + 16;

    // ── CHART ───────────────────────────────────────────────────────────────
    // Off-screen render at 800×400 — aspect ratio 0.5
    const chartImg = buildChartImageForExport(state.consultantsData, state.budgetValue);
    const chartH = contentWidth * 0.5;
    doc.addImage(chartImg, 'PNG', margin, y, contentWidth, chartH);
    y += chartH + 12;

    // ── INTERSECTION CALLOUT ─────────────────────────────────────────────────
    if (state.budgetValue > 0) {
        const { weeks, labels, forecastData } = buildChartData(state.consultantsData, state.budgetValue);
        const intersection = findBudgetIntersection(weeks, labels, forecastData, state.budgetValue);
        if (intersection) {
            doc.setFillColor(235, 244, 251);
            doc.setDrawColor(0, 85, 150);
            doc.setLineWidth(0.5);
            doc.roundedRect(margin, y, contentWidth, 32, 4, 4, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(0, 85, 150);
            doc.text(`Forecast meets budget around ${intersection.date}`, margin + 12, y + 21);
            y += 44;
        }
    }

    // ── FOOTER ──────────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.text(`Exported ${dateStr}`, margin, pageHeight - 20);
    doc.text('1', pageWidth - margin, pageHeight - 20, { align: 'right' });

    // ── SAVE ────────────────────────────────────────────────────────────────
    const filename = `${projectName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-forecast.pdf`;
    doc.save(filename);
}
