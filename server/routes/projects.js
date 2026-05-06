import { Router } from 'express';
import db from '../db.js';
import { loadProject } from '../projectLoader.js';

const router = Router();

// List all active projects for the hardcoded user
router.get('/', (req, res) => {
    const projects = db.prepare(
        `SELECT p.*, c.name AS client_name
         FROM projects p
         LEFT JOIN clients c ON c.id = p.client_id
         WHERE p.user_id = ? AND p.deleted_at IS NULL
         ORDER BY c.name ASC, p.created_at DESC`
    ).all(req.userId);
    res.json(projects.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        budgetValue: p.budget_value,
        clientId: p.client_id,
        clientName: p.client_name,
        startDate: p.start_date ?? null,
        endDate: p.end_date ?? null,
        createdAt: p.created_at,
    })));
});

// Create a new project
router.post('/', (req, res) => {
    const { name, description = '', clientName, startDate = null, endDate = null } = req.body;
    if (!name?.trim() || !clientName?.trim()) {
        return res.status(400).json({ error: 'Project name and client are required' });
    }
    db.prepare('INSERT OR IGNORE INTO clients (user_id, name) VALUES (?, ?)').run(req.userId, clientName.trim());
    const client = db.prepare('SELECT id FROM clients WHERE user_id = ? AND name = ?').get(req.userId, clientName.trim());
    const result = db.prepare(
        'INSERT INTO projects (user_id, name, description, client_id, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.userId, name.trim(), description.trim(), client.id, startDate || null, endDate || null);
    const project = loadProject(db, result.lastInsertRowid);
    res.status(201).json(project);
});

function ownedProject(db, projectId, userId, { includeDeleted = false } = {}) {
    const sql = includeDeleted
        ? 'SELECT * FROM projects WHERE id = ? AND user_id = ?'
        : 'SELECT * FROM projects WHERE id = ? AND user_id = ? AND deleted_at IS NULL';
    return db.prepare(sql).get(projectId, userId);
}

// Get a single project with all consultant + hours data
router.get('/:id', (req, res) => {
    if (!ownedProject(db, req.params.id, req.userId, { includeDeleted: true })) {
        return res.status(404).json({ error: 'Project not found' });
    }
    const project = loadProject(db, req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
});

// Update project name, description, or budget
router.put('/:id', (req, res) => {
    const project = ownedProject(db, req.params.id, req.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const name        = req.body.name        ?? project.name;
    const description = req.body.description ?? project.description;
    const budgetValue = req.body.budgetValue  ?? project.budget_value;
    const startDate   = req.body.startDate !== undefined ? (req.body.startDate || null) : project.start_date;
    const endDate     = req.body.endDate   !== undefined ? (req.body.endDate   || null) : project.end_date;

    let clientId = project.client_id;
    if (req.body.clientName !== undefined) {
        if (!req.body.clientName?.trim()) {
            return res.status(400).json({ error: 'Client name is required' });
        }
        db.prepare('INSERT OR IGNORE INTO clients (user_id, name) VALUES (?, ?)').run(req.userId, req.body.clientName.trim());
        const client = db.prepare('SELECT id FROM clients WHERE user_id = ? AND name = ?').get(req.userId, req.body.clientName.trim());
        clientId = client.id;
    }

    db.prepare(
        `UPDATE projects SET name = ?, description = ?, budget_value = ?, client_id = ?, start_date = ?, end_date = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(name, description, budgetValue, clientId, startDate, endDate, project.id);

    res.json(loadProject(db, project.id));
});

// Soft delete
router.delete('/:id', (req, res) => {
    const project = ownedProject(db, req.params.id, req.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    db.prepare(`UPDATE projects SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
        .run(project.id);
    res.json({ success: true });
});

// Restore a soft-deleted project
router.post('/:id/restore', (req, res) => {
    const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL').get(req.params.id, req.userId);
    if (!project) return res.status(404).json({ error: 'Deleted project not found' });

    db.prepare(`UPDATE projects SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ?`)
        .run(project.id);
    res.json(loadProject(db, project.id));
});

export default router;
