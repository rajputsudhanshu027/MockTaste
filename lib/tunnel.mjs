import { spawn } from 'node:child_process';
import { extractTunnelUrl } from '../scripts/share.mjs';
import { requestTunnelPage } from './tunnel-request.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export class FriendTunnel {
  constructor(port, { launch = spawn, request = requestTunnelPage, timeoutMs = 45_000, retryMs = 1000 } = {}) {
    Object.assign(this, { port, launch, request, timeoutMs, retryMs });
    this.current = null;
    this.pending = null;
    this.lastError = '';
    this.lastDiagnostic = '';
    this.probeError = '';
  }

  get status() {
    return { state: this.url ? 'ready' : this.pending ? 'connecting' : this.lastError ? 'error' : 'idle', error: this.lastError, detail: this.lastDiagnostic, probeError: this.probeError, address: this.current?.url || '' };
  }

  get url() { return this.current?.ready ? this.current.url : ''; }

  async reachable(url, pathname) {
    try {
      const response = await this.request(url + pathname, { signal: AbortSignal.timeout(3000), redirect: 'error' });
      const valid = response.ok && (await response.text()).includes('<div class="brand">MockTaste</div>');
      this.probeError = valid ? '' : `Public exam returned HTTP ${response.status}`;
      return valid;
    } catch (error) { this.probeError = error.cause?.message || error.message; return false; }
  }

  async ensure(pathname) {
    const existing = this.current;
    if (existing?.ready && await this.reachable(existing.url, pathname)
      && this.current === existing && !existing.error) return existing.url;
    if (this.pending) {
      const url = await this.pending;
      if (await this.reachable(url, pathname)) return url;
      throw new Error('The friend exam could not be reached. Try creating the link again.');
    }
    this.stop();
    this.pending = this.start(pathname).finally(() => { this.pending = null; });
    return this.pending;
  }

  async start(pathname) {
    this.lastError = '';
    this.lastDiagnostic = '';
    this.probeError = '';
    // A personal cloudflared config can override --url with unrelated ingress rules.
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rrb-tunnel-'));
    const configFile = path.join(configDir, 'config.yml');
    fs.writeFileSync(configFile, '{}\n', { mode: 0o600 });
    const cleanup = () => fs.rmSync(configDir, { recursive: true, force: true });
    let child;
    try {
      child = this.launch('cloudflared', ['tunnel', '--config', configFile, '--edge-ip-version', '4', '--url', `http://127.0.0.1:${this.port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) { cleanup(); throw error; }
    const session = { child, url: '', error: null, cleanup };
    this.current = session;
    let output = '';
    const inspect = chunk => {
      output = (output + chunk.toString()).slice(-12_000);
      session.url ||= extractTunnelUrl(output) || '';
      const failure = chunk.toString().split('\n').filter(line => /\bERR\b|Registered tunnel connection/.test(line)).at(-1);
      if (failure) this.lastDiagnostic = failure.slice(0, 600);
    };
    child.stdout.on('data', inspect);
    child.stderr.on('data', inspect);
    child.once('error', () => { session.error = new Error('Could not start sharing. Check that cloudflared is installed.'); });
    child.once('close', () => {
      cleanup();
      session.error ||= new Error('The sharing connection stopped. Create the link again.');
      if (this.current === session) this.current = null;
    });
    try {
      const deadline = Date.now() + this.timeoutMs;
      while (Date.now() < deadline) {
        if (session.error) throw session.error;
        if (session.url && await this.reachable(session.url, pathname)) {
          if (session.error || this.current !== session) throw session.error || new Error('Sharing stopped.');
          session.ready = true;
          return session.url;
        }
        await new Promise(resolve => setTimeout(resolve, this.retryMs));
      }
      throw new Error('The public exam link is not reachable yet. Check your internet connection and try again.');
    } catch (error) {
      this.lastError = error.message;
      child.kill('SIGTERM');
      cleanup();
      if (this.current === session) this.current = null;
      throw error;
    }
  }

  stop() {
    if (this.current) {
      this.current.error = new Error('Sharing stopped.');
      this.current.child.kill('SIGTERM');
      this.current?.cleanup();
      this.current = null;
    }
  }
}
