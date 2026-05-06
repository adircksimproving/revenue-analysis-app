import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (req, res) => {
    const clients = db.prepare(
        'SELECT id, name FROM clients WHERE user_id = ? ORDER BY name ASC'
    ).all(req.userId);
    res.json(clients);
});

router.post('/', (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Client name is required' });
    db.prepare('INSERT OR IGNORE INTO clients (user_id, name) VALUES (?, ?)').run(req.userId, name.trim());
    const client = db.prepare('SELECT id, name FROM clients WHERE user_id = ? AND name = ?').get(req.userId, name.trim());
    res.status(201).json(client);
});

export default router;
