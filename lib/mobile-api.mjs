import { accountError } from './accounts.mjs';

export function mobileOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw accountError('Set a complete mobile API origin, such as http://192.168.1.10:4175'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw accountError('Mobile API origin must contain only a scheme, host, and port');
  return url.origin;
}

export function createMobileHandler({ origin, accounts, students, json, readBody }) {
  const expected = new URL(mobileOrigin(origin));
  return async (req, res) => {
    try {
      if (req.headers.host !== expected.host || (req.headers.origin && req.headers.origin !== expected.origin)) throw accountError('Request origin is not allowed', 403);
      const url = new URL(req.url, expected);
      const method = req.method;
      if (url.pathname === '/api/mobile/info' && method === 'GET') return json(res, 200, { name: 'MockTaste', protocol: 1 });
      if (url.pathname === '/api/mobile/login' && method === 'POST') {
        const body = await readBody(req, 8192);
        const result = await accounts.login(body.email, body.password, req.socket.remoteAddress, ['student', 'teacher']);
        return json(res, 200, result);
      }
      if (url.pathname === '/api/mobile/signup' && method === 'POST') {
        accounts.limit(`signup:${req.socket.remoteAddress}`, 10, 3600000);
        const user = await accounts.create(await readBody(req, 8192));
        return json(res, 201, { user, token: accounts.startSession(user.id) });
      }
      // Native sessions are explicit bearer tokens. Browser cookies alone never
      // authorize the mobile port, and this listener has no admin/static routes.
      const token = String(req.headers.authorization || '').match(/^Bearer ([a-f0-9]{64})$/)?.[1];
      const user = token && accounts.currentToken(token);
      if (!user) throw accountError('Please sign in to continue', 401);
      if (!['student', 'teacher'].includes(user.role)) throw accountError('Use the web admin panel for this account', 403);
      if (url.pathname === '/api/mobile/session' && method === 'GET') return json(res, 200, { user });
      if (url.pathname === '/api/mobile/logout' && method === 'POST') { accounts.revoke(token); return json(res, 200, { signedOut: true }); }
      if (url.pathname.startsWith('/api/student/') && url.pathname !== '/api/student/auth/start') {
        if (user.role !== 'student') throw accountError('Student account required', 403);
        return await students.handle(req, res, url, user, { json, readBody });
      }
      throw accountError('Endpoint not found', 404);
    } catch (error) { return json(res, error.status || 400, { error: error.message || 'Request failed' }); }
  };
}
