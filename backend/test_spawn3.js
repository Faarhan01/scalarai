import { spawn } from 'child_process';

const cli = 'C:/Users/faarh/Workspaces/Custom-apps/scalarai/backend/src/gateway/mt5_bridge_cli.py';
const args = JSON.stringify({ symbol: 'EURUSD', timeframe: 15, count: 5000 });

function once() {
  return new Promise((resolve) => {
    // exactly what mt5-bridge.ts does
    const child = spawn('python', [cli, 'rates', args], {
      timeout: 10000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
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

console.log('=== 12 runs spawned from Node (same options as the server) ===');
const tally = {};
for (let i = 0; i < 12; i++) {
  const r = await once();
  const key = `RC=${r.code} success=${r.ok}`;
  tally[key] = (tally[key] || 0) + 1;
  console.log(`  run ${String(i + 1).padStart(2)}: ${key}`);
}
console.log('\n  tally:', tally);
