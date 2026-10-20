import { spawn } from 'child_process';

const cli = 'C:/Users/faarh/Workspaces/Custom-apps/scalarai/backend/src/gateway/mt5_bridge_cli.py';
const args = JSON.stringify({ symbol: 'EURUSD', timeframe: 15, count: 5000 });

function run(label, opts) {
  return new Promise((resolve) => {
    const child = spawn('python', [cli, 'rates', args], opts);
    let out = '', err = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', code => {
      console.log(`--- ${label} ---`);
      console.log(`  RC: ${code}`);
      console.log(`  OUT: ${out.slice(0, 180)}`);
      if (err.trim()) console.log(`  ERR: ${err.slice(0, 180)}`);
      console.log();
      resolve();
    });
  });
}

await run('A: cwd=backend', { cwd: 'C:/Users/faarh/Workspaces/Custom-apps/scalarai/backend' });
await run('B: cwd=scalarai root (what the server does)', { cwd: 'C:/Users/faarh/Workspaces/Custom-apps/scalarai' });
await run('C: no cwd', {});
await run('D: cwd=backend + PYTHONIOENCODING', {
  cwd: 'C:/Users/faarh/Workspaces/Custom-apps/scalarai/backend',
  env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
});
