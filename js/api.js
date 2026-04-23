const BASE = '/api';

async function request(method, path, body) {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: body != null ? { 'Content-Type': 'application/json' } : {},
        body: body != null ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
    }
    return res.json();
}

export const api = {
    getProjects:   ()               => request('GET',    '/projects'),
    createProject: (name, desc)     => request('POST',   '/projects',        { name, description: desc }),
    getProject:    (id)             => request('GET',    `/projects/${id}`),
    updateProject: (id, data)       => request('PUT',    `/projects/${id}`,  data),
    deleteProject: (id)             => request('DELETE', `/projects/${id}`),
    restoreProject:(id)             => request('POST',   `/projects/${id}/restore`),
    uploadCSV:     (id, consultants)=> request('POST',   `/projects/${id}/upload`, { consultants }),
    updateForecast:(id, forecastHoursPerWeek, weeklyHours) =>
                                       request('PUT',    `/consultants/${id}/forecast`, { forecastHoursPerWeek, weeklyHours }),
};
