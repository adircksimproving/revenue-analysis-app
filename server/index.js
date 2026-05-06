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
} from './middleware/portalAuth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '10mb' }));

app.get('/auth/portal', startHandoff);
app.get('/auth/callback', handleCallback);
app.get('/auth/logout', handleLogout);

app.get('/api/me', requirePortalAuth, (req, res) => {
    res.json({
        id: req.user.id,
        portalUserId: req.user.portalUserId,
        username: req.user.username,
        isAdmin: req.user.isAdmin,
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
