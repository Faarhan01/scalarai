import { spawn } from 'child_process';

const cli = 'C:/Users/faarh/Workspaces/Custom-apps/scalarai/backend/src/gateway/mt5_bridge_cli.py';
const CWD = 'C:/Users/faarh/Workspaces/Custom-apps/scalarai/backend';

function run(label, bin, opts) {
  return new Promise((resolve) => {
    const child = spawn(bin, [cli, 'status', '{}'], opts);
    let out = '', err = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', code => {
      console.log(`--- ${label} ---`);
      console.log(`  RC: ${code}`);
      console.log(`  OUT: ${out.slice(0, 200)}`);
      if (err.trim()) console.log(`  ERR: ${err.slice(0, 200)}`);
      console.log();
      resolve();
    });
    child.on('error', e => {
      console.log(`--- ${label} ---`);
      console.log(`  SPAWN ERROR: ${e.code} ${e.message}`);
      console.log();
      resolve();
    });
  });
}

await run('A: default env, cwd=backend', 'python', { cwd: CWD });
await run('B: with PYTHONIOENCODING', 'python', { cwd: CWD, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
await run('C: full python path', 'C:\\Program Files\\Python311\\python.exe', { cwd: CWD, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
