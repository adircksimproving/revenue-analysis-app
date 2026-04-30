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

        CREATE TABLE IF NOT EXISTS clients (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL REFERENCES users(id),
            name       TEXT    NOT NULL,
            created_at TEXT    DEFAULT (datetime('now')),
            UNIQUE(user_id, name)
        );
    `);
}

const dbPath = process.env.DB_PATH || join(__dirname, '../data.db');
const db = new Database(dbPath);
applySchema(db);

db.prepare('INSERT OR IGNORE INTO users (email, name, role) VALUES (?, ?, ?)').run(
    'austin.dircks@improving.com', 'Austin Dircks', 'admin'
);

export const USER_ID = db.prepare('SELECT id FROM users WHERE email = ?')
    .get('austin.dircks@improving.com').id;

// Migration: add client_id to projects if it doesn't exist yet
try { db.exec('ALTER TABLE projects ADD COLUMN client_id INTEGER REFERENCES clients(id)'); } catch {}

// Migration: add start/end dates to projects
try { db.exec('ALTER TABLE projects ADD COLUMN start_date TEXT DEFAULT NULL'); } catch {}
try { db.exec('ALTER TABLE projects ADD COLUMN end_date TEXT DEFAULT NULL'); } catch {}

// Seed Costco as the default client and assign it to any unassigned projects (AC2.2.1)
db.prepare('INSERT OR IGNORE INTO clients (user_id, name) VALUES (?, ?)').run(USER_ID, 'Costco');
const costcoId = db.prepare('SELECT id FROM clients WHERE user_id = ? AND name = ?').get(USER_ID, 'Costco').id;
db.prepare('UPDATE projects SET client_id = ? WHERE client_id IS NULL AND user_id = ?').run(costcoId, USER_ID);

export default db;
