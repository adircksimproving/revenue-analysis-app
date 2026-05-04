import { Router } from 'express';
import db from '../db.js';
import { loadProject } from '../projectLoader.js';

const router = Router();

// Update a consultant's forecast hours per week and overwrite future weekly hours.
// Unlike CSV upload (which adds hours), forecast is a deliberate SET operation.
router.put('/:id/forecast', (req, res) => {
    const consultant = db.prepare('SELECT * FROM consultants WHERE id = ?').get(req.params.id);
    if (!consultant) return res.status(404).json({ error: 'Consultant not found' });

    const { forecastHoursPerWeek, weeklyHours } = req.body;
    if (forecastHoursPerWeek == null) {
        return res.status(400).json({ error: 'forecastHoursPerWeek is required' });
    }

    db.prepare('UPDATE consultants SET forecast_hours_per_week = ? WHERE id = ?')
        .run(forecastHoursPerWeek, consultant.id);

    if (weeklyHours && typeof weeklyHours === 'object') {
        const upsert = db.prepare(`
            INSERT INTO weekly_hours (consultant_id, week_key, hours)
            VALUES (?, ?, ?)
            ON CONFLICT(consultant_id, week_key) DO UPDATE SET hours = excluded.hours
        `);
        const run = db.transaction(() => {
            for (const [weekKey, hours] of Object.entries(weeklyHours)) {
                upsert.run(consultant.id, weekKey, hours);
            }
        });
        run();
    }

    res.json(loadProject(db, consultant.project_id));
});

// Save manually entered actual hours for a single week.
// Refuses to overwrite hours that came from a CSV upload.
router.put('/:id/actuals', (req, res) => {
    const consultant = db.prepare('SELECT * FROM consultants WHERE id = ?').get(req.params.id);
    if (!consultant) return res.status(404).json({ error: 'Consultant not found' });

    const { weekKey, hours } = req.body;
    if (!weekKey || hours == null) {
        return res.status(400).json({ error: 'weekKey and hours are required' });
    }

    const existing = db.prepare('SELECT from_csv FROM weekly_hours WHERE consultant_id = ? AND week_key = ?')
        .get(consultant.id, weekKey);
    if (existing?.from_csv) {
        return res.status(409).json({ error: 'Week has CSV data and cannot be manually edited' });
    }

    if (hours > 0) {
        db.prepare(`
            INSERT INTO weekly_hours (consultant_id, week_key, hours, from_csv)
            VALUES (?, ?, ?, 0)
            ON CONFLICT(consultant_id, week_key) DO UPDATE SET hours = excluded.hours
        `).run(consultant.id, weekKey, hours);
    } else {
        db.prepare('DELETE FROM weekly_hours WHERE consultant_id = ? AND week_key = ? AND from_csv = 0')
            .run(consultant.id, weekKey);
    }

    res.json({ success: true });
});

export default router;
