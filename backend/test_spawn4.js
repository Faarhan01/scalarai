import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const dump = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'mt5_cli_env.json'), 'utf8'));
const serverEnv = {};
for (const [k, v] of Object.entries(dump.env)) if (v !== null) serverEnv[k] = String(v);

const cli = 'C:/Users/faarh/Workspaces/Custom-apps/scalarai/backend/src/gateway/mt5_bridge_cli.py';
const args = JSON.stringify({ symbol: 'EURUSD', timeframe: 15, count: 5000 });

function once(env) {
  return new Promise((resolve) => {
    const child = spawn('python', [cli, 'rates', args], {
      timeout: 10000,
      env,
    });
    let out = '';
    child.stdout.on('data', d => out += d);
    child.on('close', code => {
      let ok = false;
      try { ok = JSON.parse(out).success; } catch {}
      resolve({ code, ok });
    });
  });
}

async function series(label, env, n = 6) {
  const tally = {};
  for (let i = 0; i < n; i++) {
    const r = await once(env);
    const k = `RC=${r.code} ok=${r.ok}`;
    tally[k] = (tally[k] || 0) + 1;
  }
  console.log(`  ${label.padEnd(34)} ${JSON.stringify(tally)}`);
}

await series('my shell env', { ...process.env, PYTHONIOENCODING: 'utf-8' });
await series('SERVER env', serverEnv);
await series('SERVER env + PYTHONIOENCODING', { ...serverEnv, PYTHONIOENCODING: 'utf-8' });
await series('my env, no PYTHONIOENCODING', { ...process.env });
