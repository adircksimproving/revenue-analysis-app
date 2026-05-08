import { buildChartData, buildBurndownData, buildChartImageForExport } from './chart.js';
import {
    findBudgetIntersection,
    findBurndownIntersection,
    fetchImageAsBase64,
    computeExportMetrics,
} from './export-utils.js';

const SLIDE_W = 10;
const SLIDE_H = 5.625;
const MARGIN = 0.3;
const CONTENT_W = SLIDE_W - MARGIN * 2;

function addTile(slide, pptx, x, y, w, h, label, value, valueColor) {
    slide.addShape(pptx.ShapeType.roundRect, {
        x, y, w, h,
        rectRadius: 0.05,
        line: { color: 'E5E7EB', width: 0.5 },
        fill: { color: 'FFFFFF' },
    });
    slide.addText(label.toUpperCase(), {
        x: x + 0.1, y: y + 0.06, w: w - 0.2, h: 0.2,
        fontSize: 7,
        color: '6B7280',
        fontFace: 'Helvetica',
    });
    slide.addText(String(value), {
        x: x + 0.1, y: y + 0.28, w: w - 0.2, h: 0.28,
        fontSize: 13,
        bold: true,
        color: valueColor || '1A1A1A',
        fontFace: 'Helvetica',
    });
}

export async function generateProjectPPTX(projectName, state) {
    const pptx = new window.PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';

    const slide = pptx.addSlide();
    let y = MARGIN;

    // ── HEADER ─────────────────────────────────────────────────────────────
    const logoData = await fetchImageAsBase64('/assets/improving-logo-full.png');
    slide.addImage({ data: logoData, x: MARGIN, y, w: 1.1, h: 0.28 });

    slide.addShape(pptx.ShapeType.line, {
        x: MARGIN + 1.22, y: y + 0.02, w: 0, h: 0.24,
        line: { color: 'D1D5DB', width: 0.5 },
    });

    slide.addText(projectName, {
        x: MARGIN + 1.32, y: y + 0.02, w: CONTENT_W - 1.32, h: 0.28,
        fontSize: 14,
        bold: true,
        color: '1A1A1A',
        fontFace: 'Helvetica',
        valign: 'middle',
    });

    y += 0.4;

    slide.addShape(pptx.ShapeType.line, {
        x: MARGIN, y, w: CONTENT_W, h: 0,
        line: { color: 'E5E7EB', width: 0.5 },
    });
    y += 0.1;

    // ── METRIC TILES (3) ────────────────────────────────────────────────────
    const gap = 0.08;
    const tileH = 0.58;
    const tileW3 = (CONTENT_W - gap * 2) / 3;

    const { totalHours, totalBilled, forecastedRevenue, actuals, variance } = computeExportMetrics(state);

    addTile(slide, pptx, MARGIN, y, tileW3, tileH,
        'Total Consultants', String(state.consultantsData.length));
    addTile(slide, pptx, MARGIN + tileW3 + gap, y, tileW3, tileH,
        'Billed Hours to Date', Math.round(totalHours).toLocaleString());
    addTile(slide, pptx, MARGIN + (tileW3 + gap) * 2, y, tileW3, tileH,
        'Amount Billed to Date', '$' + Math.round(totalBilled).toLocaleString());

    y += tileH + 0.08;

    // ── FINANCIAL SUMMARY (4) ───────────────────────────────────────────────
    const tileW4 = (CONTENT_W - gap * 3) / 4;
    const varianceStr = (variance < 0 ? '-$' : '$') + Math.abs(Math.round(variance)).toLocaleString();
    const varianceColor = variance < 0 ? 'DC2626' : '059668';

    addTile(slide, pptx, MARGIN, y, tileW4, tileH,
        'Budget', '$' + Math.round(state.budgetValue || 0).toLocaleString());
    addTile(slide, pptx, MARGIN + (tileW4 + gap), y, tileW4, tileH,
        'Actuals', '$' + Math.round(actuals).toLocaleString());
    addTile(slide, pptx, MARGIN + (tileW4 + gap) * 2, y, tileW4, tileH,
        'Forecast', '$' + Math.round(forecastedRevenue).toLocaleString());
    addTile(slide, pptx, MARGIN + (tileW4 + gap) * 3, y, tileW4, tileH,
        'Variance', varianceStr, varianceColor);

    y += tileH + 0.1;

    // ── CHART ───────────────────────────────────────────────────────────────
    // Off-screen render at 800×400; fixed height to fit widescreen slide dimensions
    const chartImg = buildChartImageForExport(state.consultantsData, state.budgetValue, state.chartType);
    const chartH = 2.4;
    slide.addImage({ data: chartImg, x: MARGIN, y, w: CONTENT_W, h: chartH });
    y += chartH + 0.1;

    // ── INTERSECTION CALLOUT ─────────────────────────────────────────────────
    if (state.budgetValue > 0) {
        let intersection = null;
        if (state.chartType === 'burndown') {
            const { periods, labels, forecastData } = buildBurndownData(state.consultantsData, state.budgetValue);
            intersection = findBurndownIntersection(periods, labels, forecastData);
        } else {
            const { periods, labels, forecastData } = buildChartData(state.consultantsData, state.budgetValue);
            intersection = findBudgetIntersection(periods, labels, forecastData, state.budgetValue);
        }
        if (intersection && y + 0.38 < SLIDE_H - 0.28) {
            slide.addShape(pptx.ShapeType.roundRect, {
                x: MARGIN, y, w: CONTENT_W, h: 0.34,
                rectRadius: 0.04,
                line: { color: '005596', width: 0.5 },
                fill: { color: 'EBF4FB' },
            });
            slide.addText(`Forecast meets budget around ${intersection.date}`, {
                x: MARGIN + 0.1, y: y + 0.07, w: CONTENT_W - 0.2, h: 0.22,
                fontSize: 9,
                bold: true,
                color: '005596',
                fontFace: 'Helvetica',
            });
            y += 0.46;
        }
    }

    // ── FOOTER ──────────────────────────────────────────────────────────────
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    slide.addText(`Exported ${dateStr}`, {
        x: MARGIN, y: SLIDE_H - 0.25, w: CONTENT_W / 2, h: 0.2,
        fontSize: 8,
        color: '9CA3AF',
        fontFace: 'Helvetica',
    });
    slide.addText('1', {
        x: SLIDE_W - MARGIN - 0.3, y: SLIDE_H - 0.25, w: 0.3, h: 0.2,
        fontSize: 8,
        color: '9CA3AF',
        fontFace: 'Helvetica',
        align: 'right',
    });

    const filename = `${projectName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-forecast.pptx`;
    await pptx.writeFile({ fileName: filename });
}
