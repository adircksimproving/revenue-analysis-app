import { Router } from 'express';
import db from '../db.js';
import { loadProject } from '../projectLoader.js';

const router = Router();

// Merge incoming consultant data (parsed from CSV on the client) into the DB.
// Exported separately so it can be unit-tested with an injected DB.
export function mergeConsultants(database, projectId, incoming) {
    const upsertConsultant = database.prepare(`
        INSERT INTO consultants (project_id, name, rate, billed_total)
        VALUES (?, ?, ?, 0)
        ON CONFLICT(project_id, name) DO UPDATE SET
            rate = CASE WHEN excluded.rate > 0 THEN excluded.rate ELSE rate END
    `);

    const upsertHours = database.prepare(`
        INSERT INTO weekly_hours (consultant_id, week_key, hours, from_csv)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(consultant_id, week_key) DO UPDATE SET
            hours    = excluded.hours,
            from_csv = 1
    `);

    // Recompute from weekly_hours after each upload so repeated uploads never double-count.
    const recalcBilledTotal = database.prepare(`
        UPDATE consultants
        SET billed_total = (
            SELECT COALESCE(SUM(wh.hours), 0) * consultants.rate
            FROM weekly_hours wh
            WHERE wh.consultant_id = consultants.id AND wh.from_csv = 1
        )
        WHERE id = ?
    `);

    const runMerge = database.transaction(() => {
        for (const c of incoming) {
            const { lastInsertRowid } = upsertConsultant.run(projectId, c.name, c.rate ?? 0);
            for (const [weekKey, hours] of Object.entries(c.weeklyHours ?? {})) {
                if (hours > 0) upsertHours.run(lastInsertRowid, weekKey, hours);
            }
            recalcBilledTotal.run(lastInsertRowid);
        }
    });

    runMerge();
}

router.post('/projects/:id/upload', (req, res) => {
    const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(req.params.id, req.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { consultants } = req.body;
    if (!Array.isArray(consultants) || consultants.length === 0) {
        return res.status(400).json({ error: 'No consultant data provided' });
    }

    mergeConsultants(db, project.id, consultants);
    res.json(loadProject(db, project.id));
});

export default router;
