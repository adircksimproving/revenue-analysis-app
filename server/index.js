import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import projectsRouter from './routes/projects.js';
import uploadRouter from './routes/upload.js';
import consultantsRouter from './routes/consultants.js';
import clientsRouter from './routes/clients.js';
import { requirePortalAuth } from './middleware/portalAuth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '10mb' }));

const PORTAL_URL = process.env.PORTAL_URL || 'http://localhost:3001';
app.get('/auth/portal', (req, res) => res.redirect(PORTAL_URL));

app.get('/api/me', requirePortalAuth, (req, res) => {
    res.json({
        id: req.userId,
        portal_user_id: req.portalUser.id,
        username: req.portalUser.username,
        is_admin: req.portalUser.is_admin,
        impersonating: req.portalUser.impersonating,
        impersonator: req.portalUser.impersonator,
    });
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
