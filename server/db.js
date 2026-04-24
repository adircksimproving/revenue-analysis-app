import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function applySchema(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id    INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT    UNIQUE NOT NULL,
            name  TEXT    NOT NULL,
            role  TEXT    NOT NULL DEFAULT 'admin'
        );

        CREATE TABLE IF NOT EXISTS projects (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER NOT NULL REFERENCES users(id),
            name         TEXT    NOT NULL,
            description  TEXT    DEFAULT '',
            budget_value REAL    DEFAULT 0,
            deleted_at   TEXT    DEFAULT NULL,
            created_at   TEXT    DEFAULT (datetime('now')),
            updated_at   TEXT    DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS consultants (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id            INTEGER NOT NULL REFERENCES projects(id),
            name                  TEXT    NOT NULL,
            rate                  REAL    DEFAULT 0,
            forecast_hours_per_week REAL  DEFAULT 40,
            billed_total          REAL    DEFAULT 0,
            UNIQUE(project_id, name)
        );

        CREATE TABLE IF NOT EXISTS weekly_hours (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            consultant_id INTEGER NOT NULL REFERENCES consultants(id),
            week_key      TEXT    NOT NULL,
            hours         REAL    DEFAULT 0,
            UNIQUE(consultant_id, week_key)
        );
    `);
}

const db = new Database(join(__dirname, '../data.db'));
applySchema(db);

// Seed hardcoded user
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('austin.dircks@improving.com');
if (!existing) {
    db.prepare('INSERT INTO users (email, name, role) VALUES (?, ?, ?)').run(
        'austin.dircks@improving.com', 'Austin Dircks', 'admin'
    );
}

export const USER_ID = db.prepare('SELECT id FROM users WHERE email = ?')
    .get('austin.dircks@improving.com').id;

export default db;
