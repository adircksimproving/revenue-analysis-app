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

// Mirrors the transaction logic in POST /api/projects/:id/duplicate
function duplicateProject(db, sourceId, userId, newName) {
    const source = db.prepare(
        'SELECT * FROM projects WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
    ).get(sourceId, userId);
    if (!source) return { error: 'not_found' };

    if (!newName?.trim()) return { error: 'name_required' };

    const conflict = db.prepare(
        'SELECT id FROM projects WHERE user_id = ? AND name = ? AND deleted_at IS NULL'
    ).get(userId, newName.trim());
    if (conflict) return { error: 'conflict' };

    const newProjectId = db.transaction(() => {
        const { lastInsertRowid: projectId } = db.prepare(
            `INSERT INTO projects (user_id, name, description, budget_value, client_id, start_date, end_date)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(userId, newName.trim(), source.description, source.budget_value, source.client_id, source.start_date, source.end_date);

        const consultants = db.prepare('SELECT * FROM consultants WHERE project_id = ?').all(source.id);
        const getHours = db.prepare('SELECT * FROM weekly_hours WHERE consultant_id = ?');
        const insertConsultant = db.prepare(
            `INSERT INTO consultants (project_id, name, rate, forecast_hours_per_week, billed_total)
             VALUES (?, ?, ?, ?, ?)`
        );
        const insertHours = db.prepare(
            `INSERT INTO weekly_hours (consultant_id, week_key, hours, from_csv) VALUES (?, ?, ?, ?)`
        );

        for (const c of consultants) {
            const { lastInsertRowid: newConsultantId } = insertConsultant.run(
                projectId, c.name, c.rate, c.forecast_hours_per_week, c.billed_total
            );
            for (const h of getHours.all(c.id)) {
                insertHours.run(newConsultantId, h.week_key, h.hours, h.from_csv);
            }
        }

        return projectId;
    })();

    return { id: newProjectId };
}

describe('project duplication', () => {
    let db;
    let sourceId;

    beforeEach(() => {
        db = makeDb();

        sourceId = db.prepare(
            `INSERT INTO projects (user_id, name, description, budget_value, start_date, end_date)
             VALUES (1, 'Alpha', 'A description', 50000, '2025-01-01', '2025-12-31')`
        ).run().lastInsertRowid;

        const c1 = db.prepare(
            `INSERT INTO consultants (project_id, name, rate, forecast_hours_per_week, billed_total)
             VALUES (?, 'Jane', 150, 40, 12000)`
        ).run(sourceId).lastInsertRowid;

        const c2 = db.prepare(
            `INSERT INTO consultants (project_id, name, rate, forecast_hours_per_week, billed_total)
             VALUES (?, 'John', 120, 32, 9600)`
        ).run(sourceId).lastInsertRowid;

        db.prepare("INSERT INTO weekly_hours (consultant_id, week_key, hours, from_csv) VALUES (?, '2025-01', 40, 1)").run(c1);
        db.prepare("INSERT INTO weekly_hours (consultant_id, week_key, hours, from_csv) VALUES (?, '2025-02', 40, 1)").run(c1);
        db.prepare("INSERT INTO weekly_hours (consultant_id, week_key, hours, from_csv) VALUES (?, '2025-01', 32, 1)").run(c2);
    });

    it('copies project metadata to the new project', () => {
        const { id } = duplicateProject(db, sourceId, 1, 'Alpha - COPY');
        const copy = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);

        expect(copy.name).toBe('Alpha - COPY');
        expect(copy.description).toBe('A description');
        expect(copy.budget_value).toBe(50000);
        expect(copy.start_date).toBe('2025-01-01');
        expect(copy.end_date).toBe('2025-12-31');
        expect(copy.user_id).toBe(1);
        expect(copy.deleted_at).toBeNull();
    });

    it('clones all consultants with correct field values', () => {
        const { id } = duplicateProject(db, sourceId, 1, 'Alpha - COPY');
        const consultants = db.prepare('SELECT * FROM consultants WHERE project_id = ? ORDER BY name').all(id);

        expect(consultants).toHaveLength(2);

        const jane = consultants.find(c => c.name === 'Jane');
        expect(jane.rate).toBe(150);
        expect(jane.forecast_hours_per_week).toBe(40);
        expect(jane.billed_total).toBe(12000);

        const john = consultants.find(c => c.name === 'John');
        expect(john.rate).toBe(120);
        expect(john.forecast_hours_per_week).toBe(32);
        expect(john.billed_total).toBe(9600);
    });

    it('clones all weekly_hours entries preserving from_csv flag', () => {
        const { id } = duplicateProject(db, sourceId, 1, 'Alpha - COPY');
        const consultants = db.prepare('SELECT * FROM consultants WHERE project_id = ?').all(id);

        const allHours = consultants.flatMap(c =>
            db.prepare('SELECT * FROM weekly_hours WHERE consultant_id = ?').all(c.id)
        );

        expect(allHours).toHaveLength(3);

        const janeConsultant = consultants.find(c => c.name === 'Jane');
        const janeHours = db.prepare('SELECT * FROM weekly_hours WHERE consultant_id = ? ORDER BY week_key').all(janeConsultant.id);
        expect(janeHours).toHaveLength(2);
        expect(janeHours[0]).toMatchObject({ week_key: '2025-01', hours: 40, from_csv: 1 });
        expect(janeHours[1]).toMatchObject({ week_key: '2025-02', hours: 40, from_csv: 1 });

        const johnConsultant = consultants.find(c => c.name === 'John');
        const johnHours = db.prepare('SELECT * FROM weekly_hours WHERE consultant_id = ?').all(johnConsultant.id);
        expect(johnHours).toHaveLength(1);
        expect(johnHours[0]).toMatchObject({ week_key: '2025-01', hours: 32, from_csv: 1 });
    });

    it('does not share consultant rows between source and copy', () => {
        const { id } = duplicateProject(db, sourceId, 1, 'Alpha - COPY');
        const sourceCons = db.prepare('SELECT id FROM consultants WHERE project_id = ?').all(sourceId).map(c => c.id);
        const copyCons = db.prepare('SELECT id FROM consultants WHERE project_id = ?').all(id).map(c => c.id);

        expect(sourceCons.some(id => copyCons.includes(id))).toBe(false);
    });

    it('returns conflict when the new name matches an existing active project for the same user', () => {
        db.prepare("INSERT INTO projects (user_id, name) VALUES (1, 'Taken')").run();
        const result = duplicateProject(db, sourceId, 1, 'Taken');
        expect(result.error).toBe('conflict');
    });

    it('returns name_required when name is empty', () => {
        expect(duplicateProject(db, sourceId, 1, '').error).toBe('name_required');
        expect(duplicateProject(db, sourceId, 1, '   ').error).toBe('name_required');
    });

    it('returns not_found when the source project belongs to a different user', () => {
        const result = duplicateProject(db, sourceId, 2, 'Alpha - COPY');
        expect(result.error).toBe('not_found');
    });

    it('returns not_found for a soft-deleted source project', () => {
        db.prepare("UPDATE projects SET deleted_at = datetime('now') WHERE id = ?").run(sourceId);
        const result = duplicateProject(db, sourceId, 1, 'Alpha - COPY');
        expect(result.error).toBe('not_found');
    });

    it('allows the same copy name to be used by a different user', () => {
        db.prepare("INSERT INTO projects (user_id, name) VALUES (2, 'Alpha - COPY')").run();
        const result = duplicateProject(db, sourceId, 1, 'Alpha - COPY');
        expect(result.id).toBeDefined();
    });
});
