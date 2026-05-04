export function loadProject(db, id) {
    const project = db.prepare(
        'SELECT p.*, c.name AS client_name FROM projects p LEFT JOIN clients c ON c.id = p.client_id WHERE p.id = ?'
    ).get(id);
    if (!project) return null;

    const rows = db.prepare('SELECT * FROM consultants WHERE project_id = ?').all(project.id);
    const getHours = db.prepare('SELECT week_key, hours, from_csv FROM weekly_hours WHERE consultant_id = ?');
    const consultants = rows.map(c => {
        const hours = getHours.all(c.id);
        const weeklyHours = Object.fromEntries(hours.map(h => [h.week_key, h.hours]));
        const csvWeekKeys = hours.filter(h => h.from_csv).map(h => h.week_key);
        return {
            id: c.id,
            name: c.name,
            rate: c.rate,
            forecastHoursPerWeek: c.forecast_hours_per_week,
            billedTotal: c.billed_total,
            weeklyHours,
            csvWeekKeys,
        };
    });

    return {
        id: project.id,
        name: project.name,
        description: project.description,
        budgetValue: project.budget_value,
        clientId: project.client_id,
        clientName: project.client_name,
        startDate: project.start_date ?? null,
        endDate: project.end_date ?? null,
        deletedAt: project.deleted_at,
        createdAt: project.created_at,
        consultants,
    };
}
