import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as config from './config.js';
import { sourceRouter } from './routes/sources.js';
import { statsRouter } from './routes/stats.js';
import { startAll } from './sourceManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, '..', '..', 'frontend')));

app.use('/api/sources', sourceRouter);
app.use('/api/stats', statsRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

config.load();
startAll();

app.listen(PORT, () => {
  console.log(`Telemetry Generator running at http://localhost:${PORT}`);
});
