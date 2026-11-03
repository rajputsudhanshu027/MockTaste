import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID, scrypt as deriveKey, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(deriveKey);
const SESSION_AGE = 7 * 24 * 60 * 60 * 1000;
export const COOKIE_NAME = 'mocktaste_session';
const digest = value => createHash('sha256').update(value).digest('hex');
export const publicAccount = ({ id, name, email, role, timeZone }) => ({ id, name, email, role, timeZone });
export function accountError(message, status = 400) { return Object.assign(new Error(message), { status }); }

function identity(input) {
  const email = String(input.email || '').trim().toLowerCase();
  const name = String(input.name || '').trim();
  const password = String(input.password || '');
  const timeZone = String(input.timeZone || 'UTC');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw accountError('Enter a valid email address');
  if (!name || name.length > 80) throw accountError('Enter a name of up to 80 characters');
  if (password.length < 10 || password.length > 128) throw accountError('Use a password between 10 and 128 characters');
  try { new Intl.DateTimeFormat('en', { timeZone }).format(); } catch { throw accountError('Choose a valid time zone'); }
  return { email, name, password, timeZone };
}

async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

async function matches(password, saved) {
  const [salt, hash] = saved.split(':');
  const key = await scrypt(password, salt, 64);
  return timingSafeEqual(key, Buffer.from(hash, 'hex'));
}

export function sessionCookie(token, clear = false) {
  return `${COOKIE_NAME}=${clear ? '' : token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : SESSION_AGE / 1000}`;
}

export class Accounts {
  constructor(dir) {
    this.dir = path.join(dir, 'accounts');
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    this.file = path.join(this.dir, 'accounts.json');
    this.state = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : { users: [], sessions: [] };
    this.limits = new Map();
    this.pendingEmails = new Set();
  }

  save() {
    const temp = `${this.file}.${randomUUID()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    fs.renameSync(temp, this.file);
  }

  limit(key, maximum, windowMs) {
    const now = Date.now();
    for (const [id, value] of this.limits) if (value.until <= now) this.limits.delete(id);
    const entry = this.limits.get(key) || { count: 0, until: now + windowMs };
    if (entry.count >= maximum) throw accountError('Too many attempts. Please try again later.', 429);
    entry.count++;
    this.limits.set(key, entry);
  }

  async create(input, { admin = false } = {}) {
    const fields = identity(input);
    const role = admin ? 'admin' : input.role;
    if (!admin && !['student', 'teacher'].includes(role)) throw accountError('Choose Student or Teacher');
    if (this.state.users.some(user => user.email === fields.email) || this.pendingEmails.has(fields.email)) throw accountError('An account with this email already exists', 409);
    this.pendingEmails.add(fields.email);
    try {
      const hash = await passwordHash(fields.password);
      const user = { id: randomUUID(), name: fields.name, email: fields.email, timeZone: fields.timeZone, role, passwordHash: hash, createdAt: new Date().toISOString() };
      this.state.users.push(user);
      this.save();
      return publicAccount(user);
    } finally { this.pendingEmails.delete(fields.email); }
  }

  async login(email, password, ip = '', roles = null) {
    const normalized = String(email || '').trim().toLowerCase();
    this.limit(`login:${ip}`, 30, 15 * 60 * 1000);
    this.limit(`email:${ip}:${normalized}`, 8, 15 * 60 * 1000);
    if (typeof password !== 'string' || password.length > 128) throw accountError('Email or password is incorrect', 401);
    const user = this.state.users.find(item => item.email === normalized);
    // Derive a key even for unknown addresses so login does not expose account existence by timing.
    const valid = await matches(password, user?.passwordHash || `${'0'.repeat(32)}:${'0'.repeat(128)}`);
    if (!user || !valid) throw accountError('Email or password is incorrect', 401);
    if (roles && !roles.includes(user.role)) throw accountError('Use the web admin panel for this account', 403);
    return { user: publicAccount(user), token: this.startSession(user.id) };
  }

  startSession(userId) {
    const token = randomBytes(32).toString('hex');
    this.state.sessions = this.state.sessions.filter(session => session.expiresAt > Date.now());
    const own = this.state.sessions.filter(session => session.userId === userId);
    if (own.length >= 10) this.state.sessions = this.state.sessions.filter(session => session !== own[0]);
    this.state.sessions.push({ hash: digest(token), userId, expiresAt: Date.now() + SESSION_AGE });
    this.save();
    return token;
  }

  token(req) {
    const raw = String(req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE_NAME}=`));
    return raw?.slice(COOKIE_NAME.length + 1) || '';
  }

  current(req) {
    return this.currentToken(this.token(req));
  }

  currentToken(token) {
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const session = this.state.sessions.find(item => item.hash === digest(token) && item.expiresAt > Date.now());
    const user = session && this.state.users.find(item => item.id === session.userId);
    return user ? publicAccount(user) : null;
  }

  require(req, roles) {
    const user = this.current(req);
    if (!user) throw accountError('Please sign in to continue', 401);
    if (!roles.includes(user.role)) throw accountError('This workspace is not available to your account', 403);
    return user;
  }

  logout(req) {
    this.revoke(this.token(req));
  }

  revoke(token) {
    const hash = digest(token);
    this.state.sessions = this.state.sessions.filter(item => item.hash !== hash);
    this.save();
  }
}
