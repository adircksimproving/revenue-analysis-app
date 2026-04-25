import { Router } from 'express';
import db, { USER_ID } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
    const clients = db.prepare(
        'SELECT id, name FROM clients WHERE user_id = ? ORDER BY name ASC'
    ).all(USER_ID);
    res.json(clients);
});

router.post('/', (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Client name is required' });
    db.prepare('INSERT OR IGNORE INTO clients (user_id, name) VALUES (?, ?)').run(USER_ID, name.trim());
    const client = db.prepare('SELECT id, name FROM clients WHERE user_id = ? AND name = ?').get(USER_ID, name.trim());
    res.status(201).json(client);
});

export default router;
