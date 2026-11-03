export function validateApiUrl(value, allowLocal = false) {
  let url;
  try { url = new URL(String(value).trim()); } catch { throw new Error('Enter the server address provided for your workspace.'); }
  const host = url.hostname;
  const local = /^(127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(host);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(allowLocal && url.protocol === 'http:' && local))) throw new Error('Use HTTPS, or a private network address in a local-network build.');
  return url.origin;
}

export function mobileSession(base, value) {
  if (!value || !/^[a-f0-9]{64}$/.test(value.token) || !['student', 'teacher'].includes(value.user?.role) || typeof value.user?.id !== 'string' || typeof value.user?.name !== 'string' || typeof value.user?.email !== 'string') throw new Error('This server did not return a valid mobile account. Check your workspace address.');
  return { base, token: value.token, user: value.user };
}

export async function signOutMobile(api, clearLocal) {
  await clearLocal();
  try { await api.request('/api/mobile/logout', { method: 'POST' }); return { revoked: true }; }
  catch (error) { return { revoked: error.status === 401 }; }
}

export class MobileApi {
  constructor(base, token = '', onExpired = () => {}, fetcher = fetch) { this.base = base; this.token = token; this.onExpired = onExpired; this.fetcher = fetcher; }
  /** @param {string} path @param {{ method?: string, body?: any, publicRequest?: boolean }} options */
  async request(path, { method = 'GET', body, publicRequest = false } = {}) {
    if (!/^\/api\/(mobile|student)(?:\/|$)/.test(path)) throw new Error('Unsupported mobile request');
    let response;
    try {
      response = await this.fetcher(`${this.base}${path}`, { method, credentials: 'omit', redirect: 'error', headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(!publicRequest && this.token ? { authorization: `Bearer ${this.token}` } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(45000) });
    } catch { throw new Error('Cannot reach your workspace. Check its address, your connection, and that the server is running.'); }
    const value = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && !publicRequest) this.onExpired();
      throw Object.assign(new Error(value.error || 'Could not reach your workspace. Please try again.'), { status: response.status });
    }
    return value;
  }
  student(path, options) { return this.request(`/api/student${path}`, options); }
  image(path) {
    if (!/^\/api\/student\/snaps\/[a-f\d-]+\/photo$/.test(path)) throw new Error('Invalid study photo address');
    return { uri: `${this.base}${path}`, headers: { authorization: `Bearer ${this.token}` }, cache: 'reload' };
  }
}
