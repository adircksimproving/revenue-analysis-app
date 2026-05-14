import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import projectsRouter from './routes/projects.js';
import uploadRouter from './routes/upload.js';
import consultantsRouter from './routes/consultants.js';
import clientsRouter from './routes/clients.js';
import {
    requirePortalAuth,
    startHandoff,
    handleCallback,
    handleLogout,
    updateSessionName,
} from './middleware/portalAuth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '10mb' }));

app.get('/auth/portal', startHandoff);
app.get('/auth/callback', handleCallback);
app.get('/auth/logout', handleLogout);

app.get('/portal', (req, res) => {
    res.redirect(process.env.PORTAL_URL || 'http://localhost:3001');
});

app.get('/api/me', requirePortalAuth, (req, res) => {
    res.json({
        id: req.user.id,
        portalUserId: req.user.portalUserId,
        username: req.user.username,
        email: req.user.email,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        name: req.user.name,
        isAdmin: req.user.isAdmin,
    });
});

app.put('/api/me/name', requirePortalAuth, async (req, res) => {
    const firstName = (req.body.firstName || '').trim();
    const lastName = (req.body.lastName || '').trim();
    if (!firstName) return res.status(400).json({ error: 'firstName is required' });
    if (!lastName) return res.status(400).json({ error: 'lastName is required' });

    const PORTAL_URL = process.env.PORTAL_URL || 'http://localhost:3001';
    const secret = process.env.PORTAL_API_SECRET;
    try {
        const portalRes = await fetch(`${PORTAL_URL}/api/users/name`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${secret}`,
            },
            body: JSON.stringify({ portalUserId: req.user.portalUserId, firstName, lastName }),
        });
        if (!portalRes.ok) {
            console.error('Portal name update failed:', await portalRes.text());
        }
    } catch (err) {
        console.error('Portal name update error:', err.message);
    }

    updateSessionName(req, firstName, lastName);
    res.json({ ok: true, firstName, lastName, name: `${firstName} ${lastName}` });
});

app.use('/api/clients', requirePortalAuth, clientsRouter);
app.use('/api/projects', requirePortalAuth, projectsRouter);
app.use('/api', requirePortalAuth, uploadRouter);
app.use('/api/consultants', requirePortalAuth, consultantsRouter);

app.use(express.static(join(__dirname, '..')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Revenue Analysis running on port ${PORT}`);
});
