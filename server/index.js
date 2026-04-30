import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import projectsRouter from './routes/projects.js';
import uploadRouter from './routes/upload.js';
import consultantsRouter from './routes/consultants.js';
import clientsRouter from './routes/clients.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, '..')));

app.use('/api/clients', clientsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api', uploadRouter);
app.use('/api/consultants', consultantsRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Revenue Analysis running on port ${PORT}`);
});
