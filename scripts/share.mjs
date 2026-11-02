import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const owner = `http://127.0.0.1:${Number(process.env.PORT || 4173)}`;
const friend = `http://127.0.0.1:${Number(process.env.FRIEND_PORT || 4174)}`;

export function extractTunnelUrl(text) {
  return String(text).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com(?![a-z0-9.-])/i)?.[0] || null;
}

async function ownerReady() {
  try {
    const response = await fetch(owner + '/api/status', { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch { return false; }
}

async function setAddress(baseUrl) {
  const response = await fetch(owner + '/api/friends/address', {
    method: 'POST',
    headers: { origin: owner, 'content-type': 'application/json' },
    body: JSON.stringify({ baseUrl }),
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error(`Could not set friend address (${response.status})`);
}

async function waitForOwner(child) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await ownerReady()) return;
    if (child.exitCode !== null) throw new Error('The local server could not start');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('The local server did not become ready');
}

async function main() {
  process.stdout.write('Checking the local RRB server...\n');
  let app = null;
  if (!await ownerReady()) {
    process.stdout.write('Starting the local server on ports 4173 and 4174...\n');
    app = spawn(process.execPath, ['server.mjs'], {
      cwd: root, env: { ...process.env, FRIEND_BIND: '127.0.0.1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    app.stdout.on('data', chunk => process.stdout.write(chunk));
    app.stderr.on('data', chunk => process.stderr.write(chunk));
    await waitForOwner(app);
  }
  process.stdout.write('Starting the temporary HTTPS tunnel to the student server...\n');
  const tunnel = spawn('cloudflared', ['tunnel', '--url', friend], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  let ready = false;
  let stopping = false;
  let startupTimeout;
  const close = async () => {
    if (stopping) return;
    stopping = true;
    tunnel.kill('SIGTERM');
    try { await setAddress(''); } catch {}
    if (app) app.kill('SIGTERM');
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
  const onTunnelOutput = async (chunk, stream) => {
    log = (log + chunk.toString()).slice(-12000);
    if (ready) { stream.write(chunk); return; }
    const url = extractTunnelUrl(log);
    if (!url) { stream.write(chunk); return; }
    ready = true;
    clearTimeout(startupTimeout);
    try {
      await setAddress(url);
      process.stdout.write(`\nTemporary friend address: ${url}\nOpen ${owner}/#friends to create and copy exam links.\nKeep this terminal open while your friend takes the exam.\n\n`);
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      await close();
    }
  };
  tunnel.stdout.on('data', chunk => onTunnelOutput(chunk, process.stdout));
  tunnel.stderr.on('data', chunk => onTunnelOutput(chunk, process.stderr));
  startupTimeout = setTimeout(() => {
    if (ready || stopping) return;
    process.stderr.write('\nNo temporary tunnel address arrived after 45 seconds. Check the cloudflared messages above, then try again.\n');
    close();
  }, 45_000);
  tunnel.on('error', async error => {
    process.stderr.write(`Could not start cloudflared: ${error.message}\n`);
    await close();
  });
  tunnel.on('close', async code => {
    if (!ready) process.stderr.write(`Tunnel closed before a link was ready (exit ${code}).\n`);
    await close();
    process.exitCode = code || (ready ? 0 : 1);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
