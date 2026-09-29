import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as config from './config.js';
import * as settings from './settings.js';
import { sourceRouter } from './routes/sources.js';
import { statsRouter } from './routes/stats.js';
import { configRouter } from './routes/config.js';
import { settingsRouter } from './routes/settings.js';
import { startAll } from './sourceManager.js';
import { startMetricsServers } from './metricsServer.js';
import { startMysqlServer } from './mysqlServer.js';
import { startKafkaBrokerServer } from './kafkaServer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(join(__dirname, '..', '..', 'frontend')));

app.use('/api/sources', sourceRouter);
app.use('/api/stats', statsRouter);
app.use('/api/config', configRouter);
app.use('/api/settings', settingsRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

settings.load();
config.load();
startAll();
startMetricsServers();
startMysqlServer();
startKafkaBrokerServer();

app.listen(PORT, () => {
  console.log(`Telemetry Generator running at http://localhost:${PORT}`);
});
