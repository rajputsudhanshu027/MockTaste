import fs from 'node:fs';
import path from 'node:path';
import { createHash, createPublicKey, randomBytes, randomUUID, verify, constants } from 'node:crypto';

const AUTH_BASE = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';

const base64url = (bytes) => Buffer.from(bytes).toString('base64url');
const safeJson = async (response) => {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error_description || body.error?.message || body.error || `OpenAI sign-in failed (${response.status})`);
  return body;
};

export class ChatGPTAuth {
  constructor(dataDir, baseUrl) {
    this.file = path.join(dataDir, 'chatgpt-auth.json');
    this.hostFile = path.join(dataDir, 'chatgpt-host.json');
    this.baseUrl = baseUrl;
    this.credentials = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : null;
    this.hostId = fs.existsSync(this.hostFile)
      ? JSON.parse(fs.readFileSync(this.hostFile, 'utf8')).hostId
      : `urn:uuid:${randomUUID()}`;
    if (!fs.existsSync(this.hostFile)) fs.writeFileSync(this.hostFile, JSON.stringify({ hostId: this.hostId }), { mode: 0o600 });
    this.pending = null;
    this.refreshing = null;
    this.discovery = null;
  }

  status() {
    const credentials = this.credentials;
    return {
      connected: Boolean(credentials?.refresh_token && credentials?.scopes?.includes('chatgpt.tokens.use.direct')),
      email: credentials?.email || null,
      model: credentials?.model || null,
    };
  }

  start() {
    const state = base64url(randomBytes(24));
    const nonce = base64url(randomBytes(24));
    const verifier = base64url(randomBytes(48));
    const redirectUri = `${this.baseUrl}/auth/callback`;
    const previous = this.credentials?.client_id ? this.credentials : null;
    this.pending = { state, nonce, verifier, redirectUri, previous, createdAt: Date.now() };
    const params = new URLSearchParams({
      client_id: previous?.client_id || 'dynamic_agent_client',
      ext_agent_host_id: this.hostId,
      response_type: 'code', redirect_uri: redirectUri, scope: SCOPES,
      resource: RESOURCE, state, nonce, code_challenge_method: 'S256',
      code_challenge: base64url(createHash('sha256').update(verifier).digest()),
    });
    if (previous) {
      if (previous.id_token) params.set('id_token_hint', previous.id_token);
      if (previous.email) params.set('login_hint', previous.email);
    } else {
      params.set('agent_name_hint', 'MockTaste');
    }
    return `${AUTH_BASE}/api/accounts/authorize?${params}`;
  }

  async complete(query) {
    const pending = this.pending;
    this.pending = null;
    if (!pending || Date.now() - pending.createdAt > 10 * 60_000) throw new Error('Sign-in request expired. Try again.');
    if (query.get('state') !== pending.state) throw new Error('Sign-in state did not match. Try again.');
    if (query.get('error')) throw new Error(`Sign-in was not completed: ${query.get('error')}`);
    const code = query.get('code');
    const issuedClient = query.get('client_id');
    const clientId = pending.previous?.client_id || issuedClient;
    if (!code || !clientId || clientId === 'dynamic_agent_client') throw new Error('OpenAI did not return a complete sign-in response');
    if (pending.previous && issuedClient && issuedClient !== clientId) throw new Error('Sign-in client changed unexpectedly');
    const token = await this.tokenRequest(new URLSearchParams({
      grant_type: 'authorization_code', client_id: clientId, code,
      code_verifier: pending.verifier, redirect_uri: pending.redirectUri, resource: RESOURCE,
    }));
    if (!token.id_token || !token.refresh_token || !token.access_token) throw new Error('OpenAI did not return the required credentials');
    const identity = await this.verifyIdToken(token.id_token, clientId, pending.nonce);
    if (pending.previous && pending.previous.subject !== identity.sub) throw new Error('Sign-in returned a different ChatGPT account');
    const scopes = String(token.scope || SCOPES).split(/\s+/).filter(Boolean);
    if (!scopes.includes('chatgpt.tokens.use.direct')) throw new Error('ChatGPT plan usage was not approved');
    this.credentials = {
      email: identity.email || '', subject: identity.sub, client_id: clientId,
      ext_agent_host_id: this.hostId, id_token: token.id_token,
      access_token: token.access_token, refresh_token: token.refresh_token,
      scopes, expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000,
      model: pending.previous?.model || 'gpt-6.1-sol',
    };
    this.save();
    return this.status();
  }

  async tokenRequest(form) {
    const response = await fetch(`${AUTH_BASE}/api/accounts/oauth/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form, signal: AbortSignal.timeout(20000),
    });
    return safeJson(response);
  }

  async getDiscovery() {
    if (this.discovery && Date.now() - this.discovery.fetchedAt < 3600_000) return this.discovery.data;
    const response = await fetch(`${AUTH_BASE}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(20000) });
    const data = await safeJson(response);
    if (data.issuer !== AUTH_BASE || !data.jwks_uri?.startsWith(`${AUTH_BASE}/`)) throw new Error('Unexpected OpenAI identity configuration');
    this.discovery = { data, fetchedAt: Date.now() };
    return data;
  }

  async verifyIdToken(jwt, clientId, nonce) {
    const pieces = jwt.split('.');
    if (pieces.length !== 3) throw new Error('Malformed identity token');
    const header = JSON.parse(Buffer.from(pieces[0], 'base64url').toString('utf8'));
    const claims = JSON.parse(Buffer.from(pieces[1], 'base64url').toString('utf8'));
    if (!['RS256', 'PS256', 'ES256'].includes(header.alg) || !header.kid) throw new Error('Unsupported identity token signature');
    const discovery = await this.getDiscovery();
    const jwksResponse = await fetch(discovery.jwks_uri, { signal: AbortSignal.timeout(20000) });
    const jwks = await safeJson(jwksResponse);
    const jwk = jwks.keys?.find((key) => key.kid === header.kid && (!key.alg || key.alg === header.alg));
    if (!jwk) throw new Error('OpenAI signing key was not found');
    const key = createPublicKey({ key: jwk, format: 'jwk' });
    const data = Buffer.from(`${pieces[0]}.${pieces[1]}`);
    const signature = Buffer.from(pieces[2], 'base64url');
    const algorithm = header.alg === 'ES256' ? 'sha256' : 'RSA-SHA256';
    const options = header.alg === 'PS256'
      ? { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }
      : header.alg === 'ES256' ? { key, dsaEncoding: 'ieee-p1363' } : key;
    if (!verify(algorithm, data, options, signature)) throw new Error('Identity token signature is invalid');
    const now = Math.floor(Date.now() / 1000);
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== discovery.issuer || !audience.includes(clientId) ||
        (audience.length > 1 && claims.azp !== clientId) ||
        !Number.isFinite(claims.exp) || claims.exp <= now ||
        (Number.isFinite(claims.iat) && claims.iat > now + 60) ||
        claims.nonce !== nonce || !claims.sub) throw new Error('Identity token claims did not validate');
    return claims;
  }

  save() {
    const temp = `${this.file}.${randomUUID()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.credentials), { mode: 0o600 });
    fs.renameSync(temp, this.file);
  }

  async accessToken() {
    if (!this.credentials?.refresh_token) throw new Error('Connect your ChatGPT Plus account first');
    if (this.credentials.expiresAt > Date.now() + 120_000) return this.credentials.access_token;
    if (!this.refreshing) this.refreshing = this.refresh().finally(() => { this.refreshing = null; });
    await this.refreshing;
    return this.credentials.access_token;
  }

  async refresh() {
    const current = this.credentials;
    const token = await this.tokenRequest(new URLSearchParams({
      grant_type: 'refresh_token', client_id: current.client_id,
      refresh_token: current.refresh_token, resource: RESOURCE,
    }));
    if (!token.access_token) throw new Error('ChatGPT sign-in expired. Connect again.');
    this.credentials = {
      ...current,
      access_token: token.access_token,
      refresh_token: token.refresh_token || current.refresh_token,
      id_token: token.id_token || current.id_token,
      scopes: token.scope ? token.scope.split(/\s+/).filter(Boolean) : current.scopes,
      expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000,
    };
    this.save();
  }

  async modelList() {
    const response = await fetch(`${RESOURCE}/models`, {
      headers: { authorization: `Bearer ${await this.accessToken()}` }, signal: AbortSignal.timeout(20000),
    });
    const data = await safeJson(response);
    return (data.models || data.data || []).filter((item) => item.visibility === 'list').map((item) => ({ slug: item.slug || item.id, displayName: item.display_name || item.id }));
  }

  setModel(model) {
    if (!this.credentials) throw new Error('Connect ChatGPT first');
    this.credentials.model = model;
    this.save();
  }

  async signOut() {
    const current = this.credentials;
    this.credentials = null;
    if (fs.existsSync(this.file)) fs.rmSync(this.file, { force: true });
    if (!current?.refresh_token) return;
    try {
      const discovery = await this.getDiscovery();
      await fetch(discovery.revocation_endpoint, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: current.refresh_token, token_type_hint: 'refresh_token', client_id: current.client_id }),
        signal: AbortSignal.timeout(10000),
      });
    } catch { /* Local sign-out still removes saved credentials. */ }
  }
}
