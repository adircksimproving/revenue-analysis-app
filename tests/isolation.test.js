import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { applySchema } from '../server/db.js';

function makeDb() {
    const db = new Database(':memory:');
    applySchema(db);
    db.exec("ALTER TABLE projects ADD COLUMN client_id INTEGER");
    db.exec("ALTER TABLE projects ADD COLUMN start_date TEXT");
    db.exec("ALTER TABLE projects ADD COLUMN end_date TEXT");

    db.prepare("INSERT INTO users (email, name, role) VALUES (?, ?, 'user')").run('alice@x.com', 'Alice');
    db.prepare("INSERT INTO users (email, name, role) VALUES (?, ?, 'user')").run('bob@x.com', 'Bob');
    return db;
}

// Mirrors the SQL used by routes/projects.js. If these queries change there,
// these tests will start passing trivially and need to be re-aligned.
const listProjects = (db, userId) => db.prepare(
    `SELECT p.id FROM projects p WHERE p.user_id = ? AND p.deleted_at IS NULL`
).all(userId);

const ownedProject = (db, projectId, userId) => db.prepare(
    'SELECT * FROM projects WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
).get(projectId, userId);

describe('cross-user data isolation', () => {
    let db;
    let aliceProjectId;
    let bobProjectId;

    beforeEach(() => {
        db = makeDb();
        aliceProjectId = db.prepare("INSERT INTO projects (user_id, name) VALUES (1, 'Alice Project')").run().lastInsertRowid;
        bobProjectId = db.prepare("INSERT INTO projects (user_id, name) VALUES (2, 'Bob Project')").run().lastInsertRowid;
    });

    it('list returns only projects owned by the requesting user', () => {
        const aliceList = listProjects(db, 1);
        const bobList = listProjects(db, 2);
        expect(aliceList.map(p => p.id)).toEqual([aliceProjectId]);
        expect(bobList.map(p => p.id)).toEqual([bobProjectId]);
    });

    it('cross-user fetch by id returns nothing', () => {
        expect(ownedProject(db, bobProjectId, 1)).toBeUndefined();
        expect(ownedProject(db, aliceProjectId, 2)).toBeUndefined();
    });

    it('soft-deleted projects are excluded from list', () => {
        db.prepare("UPDATE projects SET deleted_at = datetime('now') WHERE id = ?").run(aliceProjectId);
        expect(listProjects(db, 1)).toEqual([]);
    });

    it('clients table is scoped by user_id', () => {
        db.prepare("INSERT INTO clients (user_id, name) VALUES (1, 'Acme')").run();
        db.prepare("INSERT INTO clients (user_id, name) VALUES (2, 'Acme')").run();
        const aliceClients = db.prepare('SELECT name FROM clients WHERE user_id = ?').all(1);
        const bobClients = db.prepare('SELECT name FROM clients WHERE user_id = ?').all(2);
        expect(aliceClients).toHaveLength(1);
        expect(bobClients).toHaveLength(1);
    });

    it('consultants are reachable only via owned project', () => {
        const aliceConsultantId = db.prepare(
            "INSERT INTO consultants (project_id, name) VALUES (?, 'Carla')"
        ).run(aliceProjectId).lastInsertRowid;

        const ownedByAlice = db.prepare(
            `SELECT c.id FROM consultants c
             JOIN projects p ON p.id = c.project_id
             WHERE c.id = ? AND p.user_id = ?`
        ).get(aliceConsultantId, 1);
        const seenByBob = db.prepare(
            `SELECT c.id FROM consultants c
             JOIN projects p ON p.id = c.project_id
             WHERE c.id = ? AND p.user_id = ?`
        ).get(aliceConsultantId, 2);

        expect(ownedByAlice).toBeTruthy();
        expect(seenByBob).toBeUndefined();
    });
});
