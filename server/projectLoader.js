// Returns a fully-hydrated project object (with nested consultants + weeklyHours),
// or null if not found.
export function loadProject(db, id) {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!project) return null;

    const rows = db.prepare('SELECT * FROM consultants WHERE project_id = ?').all(project.id);
    const consultants = rows.map(c => {
        const hours = db.prepare(
            'SELECT week_key, hours FROM weekly_hours WHERE consultant_id = ?'
        ).all(c.id);
        const weeklyHours = Object.fromEntries(hours.map(h => [h.week_key, h.hours]));
        return {
            id: c.id,
            name: c.name,
            rate: c.rate,
            forecastHoursPerWeek: c.forecast_hours_per_week,
            billedTotal: c.billed_total,
            weeklyHours,
        };
    });

    return {
        id: project.id,
        name: project.name,
        description: project.description,
        budgetValue: project.budget_value,
        deletedAt: project.deleted_at,
        createdAt: project.created_at,
        consultants,
    };
}
