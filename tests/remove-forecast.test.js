import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { applySchema } from '../server/db.js';

function makeDb() {
    const db = new Database(':memory:');
    applySchema(db);
    db.exec('ALTER TABLE projects ADD COLUMN client_id INTEGER');
    db.exec('ALTER TABLE projects ADD COLUMN start_date TEXT');
    db.exec('ALTER TABLE projects ADD COLUMN end_date TEXT');

    db.prepare("INSERT INTO users (email, name, role) VALUES (?, ?, 'user')").run('alice@x.com', 'Alice');
    db.prepare("INSERT INTO users (email, name, role) VALUES (?, ?, 'user')").run('bob@x.com', 'Bob');
    return db;
}

// Mirrors DELETE /api/consultants/:id/forecast
function removeForecast(db, consultantId, userId, fromWeekKey) {
    const consultant = db.prepare(
        'SELECT c.* FROM consultants c JOIN projects p ON p.id = c.project_id WHERE c.id = ? AND p.user_id = ?'
    ).get(consultantId, userId);
    if (!consultant) return { error: 'not_found' };
    if (!fromWeekKey) return { error: 'fromWeekKey_required' };

    db.prepare(
        'DELETE FROM weekly_hours WHERE consultant_id = ? AND from_csv = 0 AND week_key >= ?'
    ).run(consultantId, fromWeekKey);

    return { success: true };
}

// Mirrors the optional-forecastHoursPerWeek PUT /api/consultants/:id/forecast
function updateForecast(db, consultantId, userId, { forecastHoursPerWeek, weeklyHours } = {}) {
    const consultant = db.prepare(
        'SELECT c.* FROM consultants c JOIN projects p ON p.id = c.project_id WHERE c.id = ? AND p.user_id = ?'
    ).get(consultantId, userId);
    if (!consultant) return { error: 'not_found' };

    if (forecastHoursPerWeek != null) {
        db.prepare('UPDATE consultants SET forecast_hours_per_week = ? WHERE id = ?')
            .run(forecastHoursPerWeek, consultantId);
    }

    if (weeklyHours && typeof weeklyHours === 'object') {
        const upsert = db.prepare(`
            INSERT INTO weekly_hours (consultant_id, week_key, hours)
            VALUES (?, ?, ?)
            ON CONFLICT(consultant_id, week_key) DO UPDATE SET hours = excluded.hours
        `);
        const remove = db.prepare(
            'DELETE FROM weekly_hours WHERE consultant_id = ? AND week_key = ? AND from_csv = 0'
        );
        db.transaction(() => {
            for (const [weekKey, hours] of Object.entries(weeklyHours)) {
                if (hours > 0) {
                    upsert.run(consultantId, weekKey, hours);
                } else {
                    remove.run(consultantId, weekKey);
                }
            }
        })();
    }

    return { success: true };
}

describe('removeForecast server logic', () => {
    let db, projectId, consultantId;

    beforeEach(() => {
        db = makeDb();
        projectId = db.prepare("INSERT INTO projects (user_id, name) VALUES (1, 'Alpha')").run().lastInsertRowid;
        consultantId = db.prepare(
            "INSERT INTO consultants (project_id, name, rate) VALUES (?, 'Jane', 150)"
        ).run(projectId).lastInsertRowid;

        // Past forecast row
        db.prepare("INSERT INTO weekly_hours (consultant_id, week_key, hours, from_csv) VALUES (?, '2026-03-W1', 40, 0)").run(consultantId);
        // CSV row in the past — must never be deleted
        db.prepare("INSERT INTO weekly_hours (consultant_id, week_key, hours, from_csv) VALUES (?, '2026-04-W1', 40, 1)").run(consultantId);
        // Future forecast rows
        db.prepare("INSERT INTO weekly_hours (consultant_id, week_key, hours, from_csv) VALUES (?, '2026-05-W1', 40, 0)").run(consultantId);
        db.prepare("INSERT INTO weekly_hours (consultant_id, week_key, hours, from_csv) VALUES (?, '2026-05-W2', 40, 0)").run(consultantId);
        db.prepare("INSERT INTO weekly_hours (consultant_id, week_key, hours, from_csv) VALUES (?, '2026-06-W1', 32, 0)").run(consultantId);
    });

    it('deletes future non-CSV rows at and after fromWeekKey', () => {
        removeForecast(db, consultantId, 1, '2026-05-W1');
        const remaining = db.prepare('SELECT week_key FROM weekly_hours WHERE consultant_id = ?').all(consultantId).map(r => r.week_key);
        expect(remaining).not.toContain('2026-05-W1');
        expect(remaining).not.toContain('2026-05-W2');
        expect(remaining).not.toContain('2026-06-W1');
    });

    it('preserves forecast rows before fromWeekKey', () => {
        removeForecast(db, consultantId, 1, '2026-05-W1');
        const row = db.prepare("SELECT * FROM weekly_hours WHERE consultant_id = ? AND week_key = '2026-03-W1'").get(consultantId);
        expect(row).toBeDefined();
        expect(row.hours).toBe(40);
    });

    it('never deletes CSV rows regardless of week_key', () => {
        removeForecast(db, consultantId, 1, '2026-01-W1'); // fromWeekKey before all rows
        const csvRow = db.prepare("SELECT * FROM weekly_hours WHERE consultant_id = ? AND from_csv = 1").get(consultantId);
        expect(csvRow).toBeDefined();
        expect(csvRow.week_key).toBe('2026-04-W1');
    });

    it('does not change the consultant forecast_hours_per_week', () => {
        db.prepare('UPDATE consultants SET forecast_hours_per_week = 32 WHERE id = ?').run(consultantId);
        removeForecast(db, consultantId, 1, '2026-05-W1');
        const c = db.prepare('SELECT forecast_hours_per_week FROM consultants WHERE id = ?').get(consultantId);
        expect(c.forecast_hours_per_week).toBe(32);
    });

    it('returns not_found when the consultant belongs to a different user', () => {
        const result = removeForecast(db, consultantId, 2, '2026-05-W1');
        expect(result.error).toBe('not_found');
    });

    it('returns fromWeekKey_required when fromWeekKey is missing', () => {
        expect(removeForecast(db, consultantId, 1, '').error).toBe('fromWeekKey_required');
    });
});

describe('updateForecast optional forecastHoursPerWeek', () => {
    let db, projectId, consultantId;

    beforeEach(() => {
        db = makeDb();
        projectId = db.prepare("INSERT INTO projects (user_id, name) VALUES (1, 'Beta')").run().lastInsertRowid;
        consultantId = db.prepare(
            "INSERT INTO consultants (project_id, name, rate, forecast_hours_per_week) VALUES (?, 'John', 120, 40)"
        ).run(projectId).lastInsertRowid;
    });

    it('updates forecast_hours_per_week when provided', () => {
        updateForecast(db, consultantId, 1, { forecastHoursPerWeek: 32, weeklyHours: {} });
        const c = db.prepare('SELECT forecast_hours_per_week FROM consultants WHERE id = ?').get(consultantId);
        expect(c.forecast_hours_per_week).toBe(32);
    });

    it('leaves forecast_hours_per_week unchanged when omitted', () => {
        updateForecast(db, consultantId, 1, { weeklyHours: { '2026-05-W1': 24 } });
        const c = db.prepare('SELECT forecast_hours_per_week FROM consultants WHERE id = ?').get(consultantId);
        expect(c.forecast_hours_per_week).toBe(40);
    });

    it('upserts a week with hours > 0', () => {
        updateForecast(db, consultantId, 1, { weeklyHours: { '2026-05-W1': 24 } });
        const row = db.prepare("SELECT hours FROM weekly_hours WHERE consultant_id = ? AND week_key = '2026-05-W1'").get(consultantId);
        expect(row.hours).toBe(24);
    });

    it('deletes a non-CSV week when hours = 0', () => {
        db.prepare("INSERT INTO weekly_hours (consultant_id, week_key, hours, from_csv) VALUES (?, '2026-05-W1', 40, 0)").run(consultantId);
        updateForecast(db, consultantId, 1, { weeklyHours: { '2026-05-W1': 0 } });
        const row = db.prepare("SELECT * FROM weekly_hours WHERE consultant_id = ? AND week_key = '2026-05-W1'").get(consultantId);
        expect(row).toBeUndefined();
    });

    it('does not delete a CSV week when hours = 0', () => {
        db.prepare("INSERT INTO weekly_hours (consultant_id, week_key, hours, from_csv) VALUES (?, '2026-04-W1', 40, 1)").run(consultantId);
        updateForecast(db, consultantId, 1, { weeklyHours: { '2026-04-W1': 0 } });
        const row = db.prepare("SELECT * FROM weekly_hours WHERE consultant_id = ? AND week_key = '2026-04-W1'").get(consultantId);
        expect(row).toBeDefined();
        expect(row.hours).toBe(40);
    });
});
