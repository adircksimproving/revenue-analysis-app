import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { applySchema } from '../server/db.js';
import { mergeConsultants } from '../server/routes/upload.js';

function makeDb() {
    const db = new Database(':memory:');
    applySchema(db);
    db.prepare('INSERT INTO users (email, name, role) VALUES (?, ?, ?)').run('test@test.com', 'Test', 'admin');
    db.prepare('INSERT INTO projects (user_id, name) VALUES (?, ?)').run(1, 'Test Project');
    return db;
}

function getConsultant(db, projectId, name) {
    return db.prepare('SELECT * FROM consultants WHERE project_id = ? AND name = ?').get(projectId, name);
}

function getHours(db, consultantId) {
    return db.prepare('SELECT week_key, hours, from_csv FROM weekly_hours WHERE consultant_id = ?').all(consultantId);
}

// ── mergeConsultants ──────────────────────────────────────────────────────────

describe('mergeConsultants — inserts', () => {
    let db;
    beforeEach(() => { db = makeDb(); });

    it('creates a new consultant record', () => {
        mergeConsultants(db, 1, [{ name: 'Alice', rate: 150, billedTotal: 600, weeklyHours: {} }]);
        expect(getConsultant(db, 1, 'Alice')).not.toBeNull();
    });

    it('stores the rate', () => {
        mergeConsultants(db, 1, [{ name: 'Alice', rate: 150, billedTotal: 0, weeklyHours: {} }]);
        expect(getConsultant(db, 1, 'Alice').rate).toBe(150);
    });

    it('stores billedTotal', () => {
        mergeConsultants(db, 1, [{ name: 'Alice', rate: 150, billedTotal: 1200, weeklyHours: {} }]);
        expect(getConsultant(db, 1, 'Alice').billed_total).toBe(1200);
    });

    it('creates weekly_hours rows for each non-zero week', () => {
        mergeConsultants(db, 1, [{ name: 'Alice', rate: 100, billedTotal: 0, weeklyHours: { '2026-04-W1': 40, '2026-04-W2': 35 } }]);
        const { id } = getConsultant(db, 1, 'Alice');
        expect(getHours(db, id)).toHaveLength(2);
    });

    it('skips zero-hour week entries', () => {
        mergeConsultants(db, 1, [{ name: 'Alice', rate: 100, billedTotal: 0, weeklyHours: { '2026-04-W1': 0 } }]);
        const { id } = getConsultant(db, 1, 'Alice');
        expect(getHours(db, id)).toHaveLength(0);
    });

    it('inserts multiple consultants in one call', () => {
        mergeConsultants(db, 1, [
            { name: 'Alice', rate: 100, billedTotal: 0, weeklyHours: {} },
            { name: 'Bob',   rate: 120, billedTotal: 0, weeklyHours: {} },
        ]);
        expect(getConsultant(db, 1, 'Alice')).not.toBeNull();
        expect(getConsultant(db, 1, 'Bob')).not.toBeNull();
    });
});

describe('mergeConsultants — merge (additive) behaviour', () => {
    let db;
    beforeEach(() => { db = makeDb(); });

    it('accumulates billedTotal across uploads', () => {
        mergeConsultants(db, 1, [{ name: 'Alice', rate: 100, billedTotal: 600, weeklyHours: {} }]);
        mergeConsultants(db, 1, [{ name: 'Alice', rate: 100, billedTotal: 400, weeklyHours: {} }]);
        expect(getConsultant(db, 1, 'Alice').billed_total).toBe(1000);
    });

    it('accumulates hours for the same week across uploads', () => {
        mergeConsultants(db, 1, [{ name: 'Alice', rate: 100, billedTotal: 0, weeklyHours: { '2026-04-W1': 20 } }]);
        mergeConsultants(db, 1, [{ name: 'Alice', rate: 100, billedTotal: 0, weeklyHours: { '2026-04-W1': 15 } }]);
        const { id } = getConsultant(db, 1, 'Alice');
        const row = getHours(db, id).find(h => h.week_key === '2026-04-W1');
        expect(row.hours).toBe(35);
    });

    it('adds new weeks without touching existing ones', () => {
        mergeConsultants(db, 1, [{ name: 'Alice', rate: 100, billedTotal: 0, weeklyHours: { '2026-04-W1': 40 } }]);
        mergeConsultants(db, 1, [{ name: 'Alice', rate: 100, billedTotal: 0, weeklyHours: { '2026-04-W2': 32 } }]);
        const { id } = getConsultant(db, 1, 'Alice');
        const hours = getHours(db, id);
        expect(hours).toHaveLength(2);
        expect(hours.find(h => h.week_key === '2026-04-W1').hours).toBe(40);
        expect(hours.find(h => h.week_key === '2026-04-W2').hours).toBe(32);
    });

    it('updates rate when incoming rate is non-zero', () => {
        mergeConsultants(db, 1, [{ name: 'Alice', rate: 100, billedTotal: 0, weeklyHours: {} }]);
        mergeConsultants(db, 1, [{ name: 'Alice', rate: 150, billedTotal: 0, weeklyHours: {} }]);
        expect(getConsultant(db, 1, 'Alice').rate).toBe(150);
    });

    it('preserves existing rate when incoming rate is zero', () => {
        mergeConsultants(db, 1, [{ name: 'Alice', rate: 100, billedTotal: 0, weeklyHours: {} }]);
        mergeConsultants(db, 1, [{ name: 'Alice', rate: 0,   billedTotal: 0, weeklyHours: {} }]);
        expect(getConsultant(db, 1, 'Alice').rate).toBe(100);
    });
});

describe('mergeConsultants — project isolation', () => {
    let db;
    beforeEach(() => {
        db = makeDb();
        db.prepare('INSERT INTO projects (user_id, name) VALUES (?, ?)').run(1, 'Second Project');
    });

    it('does not mix consultants across projects', () => {
        mergeConsultants(db, 1, [{ name: 'Alice', rate: 100, billedTotal: 0, weeklyHours: {} }]);
        mergeConsultants(db, 2, [{ name: 'Alice', rate: 200, billedTotal: 0, weeklyHours: {} }]);
        expect(getConsultant(db, 1, 'Alice').rate).toBe(100);
        expect(getConsultant(db, 2, 'Alice').rate).toBe(200);
    });
});

// ── mergeConsultants — from_csv flag ──────────────────────────────────────────

describe('mergeConsultants — from_csv flag', () => {
    let db;
    beforeEach(() => { db = makeDb(); });

    it('sets from_csv=1 on all uploaded weekly_hours rows', () => {
        mergeConsultants(db, 1, [{ name: 'Alice', rate: 100, billedTotal: 0, weeklyHours: { '2026-04-W1': 40 } }]);
        const { id } = getConsultant(db, 1, 'Alice');
        const row = getHours(db, id).find(h => h.week_key === '2026-04-W1');
        expect(row.from_csv).toBe(1);
    });

    it('sets from_csv=1 on a second upload that targets the same week', () => {
        mergeConsultants(db, 1, [{ name: 'Alice', rate: 100, billedTotal: 0, weeklyHours: { '2026-04-W1': 20 } }]);
        mergeConsultants(db, 1, [{ name: 'Alice', rate: 100, billedTotal: 0, weeklyHours: { '2026-04-W1': 15 } }]);
        const { id } = getConsultant(db, 1, 'Alice');
        const row = getHours(db, id).find(h => h.week_key === '2026-04-W1');
        expect(row.from_csv).toBe(1);
    });
});
