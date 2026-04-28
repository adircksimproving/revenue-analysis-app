import { state } from './state.js';

export function setCurrentQuarter() {
    const now = new Date();
    state.currentQuarter.year = now.getFullYear();
    state.currentQuarter.quarter = Math.ceil((now.getMonth() + 1) / 3);
}

export function getWeeksRemainingInQuarter() {
    const now = new Date();
    const quarterEndMonth = state.currentQuarter.quarter * 3;
    const quarterEnd = new Date(state.currentQuarter.year, quarterEndMonth, 0);
    const msRemaining = quarterEnd - now;
    if (msRemaining <= 0) return 0;
    return Math.ceil(msRemaining / (7 * 24 * 60 * 60 * 1000));
}

export function getQuarterWeeks(year, quarter) {
    const weeks = [];
    const startMonth = (quarter - 1) * 3 + 1;

    for (let month = startMonth; month < startMonth + 3; month++) {
        const daysInMonth = new Date(year, month, 0).getDate();
        const weeksInMonth = Math.ceil(daysInMonth / 7);

        for (let week = 1; week <= weeksInMonth; week++) {
            weeks.push(`${year}-${String(month).padStart(2, '0')}-W${week}`);
        }
    }

    return weeks;
}

export function parseDateRaw(dateStr) {
    if (!dateStr) return null;
    try {
        let date;
        if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                let month = parseInt(parts[0]);
                let day = parseInt(parts[1]);
                let year = parseInt(parts[2]);
                if (year < 100) year += 2000;
                date = new Date(year, month - 1, day);
            }
        } else {
            date = new Date(dateStr);
        }
        return date && !isNaN(date.getTime()) ? date : null;
    } catch {
        return null;
    }
}

export function getWeekKey(dateStr) {
    try {
        const date = parseDateRaw(dateStr);
        if (!date) return dateStr;
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const weekOfMonth = Math.ceil(day / 7);
        return `${year}-${String(month).padStart(2, '0')}-W${weekOfMonth}`;
    } catch (e) {
        return dateStr;
    }
}

export function isWeekFuture(weekKey) {
    const match = weekKey.match(/(\d{4})-(\d{2})-W(\d+)/);
    if (!match) return false;
    const year = parseInt(match[1]);
    const month = parseInt(match[2]);
    const weekOfMonth = parseInt(match[3]);
    const weekStart = new Date(year, month - 1, (weekOfMonth - 1) * 7 + 1);
    return weekStart > new Date();
}

export function weekKeyToStartDate(weekKey) {
    const match = weekKey.match(/(\d{4})-(\d{2})-W(\d+)/);
    if (!match) return null;
    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, (parseInt(match[3]) - 1) * 7 + 1);
}

export function weekKeyToEndDate(weekKey) {
    const start = weekKeyToStartDate(weekKey);
    if (!start) return null;
    return new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
}

export function formatDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function isWeekWithinProjectDates(weekKey) {
    const { startDate, endDate } = state;
    if (!startDate && !endDate) return true;
    const weekStart = weekKeyToStartDate(weekKey);
    const weekEnd = weekKeyToEndDate(weekKey);
    if (!weekStart || !weekEnd) return true;
    if (startDate && weekEnd < new Date(startDate)) return false;
    if (endDate && weekStart > new Date(endDate)) return false;
    return true;
}

export function isWeekOnOrAfterProjectStart(weekKey) {
    if (!state.startDate) return true;
    const weekEnd = weekKeyToEndDate(weekKey);
    if (!weekEnd) return true;
    return weekEnd >= new Date(state.startDate);
}

export function parseLocalDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

export function snapToMonday(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay(); // 0=Sun, 1=Mon..6=Sat
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return d;
}

export function groupWeeksByQuarter(weeks) {
    const quarters = {};

    weeks.forEach(week => {
        const match = week.match(/(\d{4})-(\d{2})/);
        if (match) {
            const year = match[1];
            const month = parseInt(match[2]);
            const quarter = Math.ceil(month / 3);
            const key = `Q${quarter} ${year}`;

            if (!quarters[key]) {
                quarters[key] = [];
            }
            quarters[key].push(week);
        }
    });

    return quarters;
}
