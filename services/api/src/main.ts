import { createApplication } from './app.js';
import { config } from './config.js';

const cfg = config();
const app = await createApplication(cfg);
await app.listen(cfg.port, cfg.host);
console.log(`Tutor API listening on ${cfg.host}:${cfg.port}; environment=${cfg.environment}`);
