import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { accountError } from './accounts.mjs';
import { activityFor, dateKey, generatePractice, scorePractice } from './student-practice.mjs';

// Camera uploads are normalized to JPEG by the client. Remove metadata again on
// the server so a direct API upload cannot expose EXIF location or comments.
export function snapPhoto(base64) {
  if (typeof base64 !== 'string' || base64.length > 9 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw accountError('Choose a photo smaller than 6 MB');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length < 12 || bytes.length > 6 * 1024 * 1024 || bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) throw accountError('Choose a readable JPEG study photo');
  const parts = [bytes.subarray(0, 2)];
  let offset = 2;
  let sawScan = false;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) throw accountError('The photo could not be read. Try taking it again.');
    const start = offset;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) {
      if (!sawScan || offset !== bytes.length) break;
      parts.push(bytes.subarray(start, offset));
      return Buffer.concat(parts);
    }
    if (marker === 0xd8 || marker === 0 || marker === undefined) break;
    if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) { parts.push(bytes.subarray(start, offset)); continue; }
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (!(marker >= 0xe1 && marker <= 0xef) && marker !== 0xfe) parts.push(bytes.subarray(start, offset + length));
    offset += length;
    if (marker === 0xda) {
      sawScan = true;
      const scanStart = offset;
      let cursor = offset;
      while (cursor < bytes.length) {
        if (bytes[cursor] !== 0xff) { cursor++; continue; }
        const boundary = cursor;
        while (bytes[cursor] === 0xff) cursor++;
        const code = bytes[cursor];
        if (code === 0 || (code >= 0xd0 && code <= 0xd7)) { cursor++; continue; }
        parts.push(bytes.subarray(scanStart, boundary));
        offset = boundary;
        break;
      }
      if (cursor >= bytes.length) break;
    }
  }
  throw accountError('The photo could not be read. Try taking it again.');
}

const samePair = (connection, a, b) => [connection.from, connection.to].includes(a) && [connection.from, connection.to].includes(b);
const noSnap = () => accountError('Study snap not found', 404);

export class StudySnaps {
  constructor(dataDir, accounts = { state: { users: [] } }) {
    this.accounts = accounts;
    this.dir = path.join(dataDir, 'accounts', 'study-snaps');
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    this.file = path.join(this.dir, 'state.json');
    this.state = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : { profiles: [], connections: [], snaps: [] };
  }

  save() {
    const temp = `${this.file}.${randomUUID()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    fs.renameSync(temp, this.file);
  }

  profile(user) {
    if (user.role !== 'student') throw accountError('Student account required', 403);
    let profile = this.state.profiles.find(item => item.userId === user.id);
    if (!profile) {
      let code;
      do { code = randomBytes(5).toString('hex').toUpperCase(); } while (this.state.profiles.some(item => item.code === code));
      profile = { userId: user.id, code };
      this.state.profiles.push(profile); this.save();
    }
    return profile;
  }

  student(id) { return this.accounts.state.users.find(user => user.id === id && user.role === 'student'); }
  connection(user, id, accepted = false) {
    const connection = this.state.connections.find(item => item.id === id && [item.from, item.to].includes(user.id) && (accepted ? item.status === 'accepted' : item.status !== 'removed'));
    if (!connection) throw accountError('Study mate not found', 404);
    return connection;
  }
  activeDelivery(snap, user) {
    return snap.deliveries.find(delivery => delivery.recipientId === user.id && this.state.connections.some(connection => connection.id === delivery.connectionId && connection.status === 'accepted' && samePair(connection, user.id, snap.ownerId)));
  }
  streak(connection, now = new Date()) {
    const completed = this.state.snaps.flatMap(snap => snap.deliveries.filter(delivery => delivery.connectionId === connection.id && delivery.openedAt && dateKey(delivery.sentAt, connection.timeZone) === dateKey(delivery.openedAt, connection.timeZone)).map(delivery => delivery.openedAt));
    const dates = [...new Set(completed.map(value => dateKey(value, connection.timeZone)))].sort();
    const activity = activityFor(dates.map(day => ({ submittedAt: `${day}T12:00:00Z` })), 'UTC', new Date(`${dateKey(now, connection.timeZone)}T12:00:00Z`));
    return { current: activity.current, longest: activity.longest, totalDays: dates.length, todayComplete: dates.includes(dateKey(now, connection.timeZone)), lastDay: dates.at(-1) || null, timeZone: connection.timeZone };
  }

  summary(snap) {
    return { id: snap.id, title: snap.title, createdAt: snap.createdAt, count: snap.questions.length, completed: Boolean(snap.attempt), sent: snap.deliveries.length > 0, recipientCount: snap.deliveries.length, openedCount: snap.deliveries.filter(item => item.openedAt).length };
  }

  list(user, now = new Date()) {
    const profile = this.profile(user);
    const connections = this.state.connections.filter(item => [item.from, item.to].includes(user.id) && item.status !== 'removed').map(item => {
      const other = this.student(item.from === user.id ? item.to : item.from);
      if (!other) return null;
      return { id: item.id, name: other.name, code: this.profile(other).code, status: item.status, incoming: item.to === user.id, streak: item.status === 'accepted' ? this.streak(item, now) : null };
    }).filter(Boolean);
    const own = this.state.snaps.filter(snap => snap.ownerId === user.id && !snap.deletedAt).map(snap => this.summary(snap)).reverse();
    const received = this.state.snaps.filter(snap => !snap.deletedAt && snap.ownerId !== user.id).flatMap(snap => {
      const delivery = this.activeDelivery(snap, user);
      return delivery ? [{ id: snap.id, title: snap.title, from: this.student(snap.ownerId)?.name || 'Study mate', sentAt: delivery.sentAt, openedAt: delivery.openedAt, count: snap.questions.length }] : [];
    }).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
    return { code: profile.code, connections, own, received };
  }

  request(user, code) {
    this.profile(user);
    const target = this.state.profiles.find(item => item.code === String(code || '').trim().toUpperCase());
    if (!target || !this.student(target.userId)) throw accountError('No student found with that study code');
    if (target.userId === user.id) throw accountError('Use your study mate’s code, rather than your own');
    if (this.state.connections.some(item => item.status !== 'removed' && samePair(item, user.id, target.userId))) throw accountError('You already have a connection or request with this study mate', 409);
    this.accounts.limit?.(`mate-request:${user.id}`, 20, 86400000);
    const connection = { id: randomUUID(), from: user.id, to: target.userId, status: 'pending', timeZone: user.timeZone || 'UTC', createdAt: new Date().toISOString() };
    this.state.connections.push(connection); this.save();
    return { requested: true };
  }

  accept(user, id) {
    const connection = this.connection(user, id);
    if (connection.to !== user.id || connection.status !== 'pending') throw accountError('Only the invited study mate can accept this request', 403);
    connection.status = 'accepted'; connection.acceptedAt = new Date().toISOString(); this.save();
    return { accepted: true };
  }

  removeConnection(user, id) {
    const connection = this.connection(user, id);
    connection.status = 'removed'; this.save();
    return { removed: true };
  }

  async create(user, { title, photo }, ai, progress = () => {}) {
    this.profile(user);
    const bytes = snapPhoto(photo);
    progress('Reading your study photo');
    const sourceText = String(await ai.imageToText(bytes, 'image/jpeg')).trim();
    if (sourceText.length < 60 || sourceText.includes('[complex visual skipped]')) throw accountError('Take a clearer photo with enough study text for three questions. Complex visuals are not supported yet.');
    if (sourceText.length > 100000) throw accountError('Photograph a smaller section of your notes');
    const id = randomUUID();
    const caption = String(title || 'Today’s study snap').trim().slice(0, 120) || 'Today’s study snap';
    const quiz = await generatePractice({ ai, materials: [{ id, name: caption, extractedText: sourceText }], options: { title: caption, count: 3, durationMinutes: 3, difficulty: 'easy', penalty: 0 }, progress });
    if (quiz.questions.length !== 3) throw accountError('This photo did not support three checked questions. Capture a clearer or fuller section and try again.');
    const snap = { id, ownerId: user.id, title: caption, createdAt: new Date().toISOString(), sourceText, questions: quiz.questions, attempt: null, deliveries: [] };
    const filename = path.join(this.dir, `${id}.jpg`);
    fs.writeFileSync(filename, bytes, { mode: 0o600 });
    try { this.state.snaps.push(snap); this.save(); }
    catch (error) { this.state.snaps = this.state.snaps.filter(item => item !== snap); fs.rmSync(filename, { force: true }); throw error; }
    return { snapId: id };
  }

  find(user, id, ownerOnly = false) {
    const snap = this.state.snaps.find(item => item.id === id && !item.deletedAt);
    if (!snap || (snap.ownerId !== user.id && (ownerOnly || !this.activeDelivery(snap, user)))) throw noSnap();
    return snap;
  }

  detail(user, id) {
    const snap = this.find(user, id);
    if (snap.ownerId === user.id) return {
      ...this.summary(snap), own: true, photoUrl: `/api/student/snaps/${snap.id}/photo`, sourceText: snap.sourceText, attempt: snap.attempt,
      questions: snap.attempt ? snap.questions : snap.questions.map(({ id, stem, options }) => ({ id, stem, options })),
      deliveries: snap.deliveries.map(delivery => ({ name: this.student(delivery.recipientId)?.name || 'Study mate', sentAt: delivery.sentAt, openedAt: delivery.openedAt })),
    };
    const delivery = this.activeDelivery(snap, user);
    if (!delivery.openedAt) throw accountError('Open this study snap first', 409);
    return { id: snap.id, title: snap.title, own: false, from: this.student(snap.ownerId)?.name || 'Study mate', photoUrl: `/api/student/snaps/${snap.id}/photo`, count: snap.questions.length, sentAt: delivery.sentAt, openedAt: delivery.openedAt };
  }

  submit(user, id, answers) {
    const snap = this.find(user, id, true);
    if (!snap.attempt) {
      if (!answers || typeof answers !== 'object' || Array.isArray(answers) || Object.keys(answers).length !== snap.questions.length || snap.questions.some(question => !Number.isInteger(answers[question.id]) || answers[question.id] < 0 || answers[question.id] > 3)) throw accountError('Answer all three questions before sharing your snap');
      snap.attempt = { id: randomUUID(), testId: snap.id, answers: Object.fromEntries(snap.questions.map(question => [question.id, answers[question.id]])), result: scorePractice({ questions: snap.questions, penalty: 0 }, answers), submittedAt: new Date().toISOString() };
      this.save();
    }
    return this.detail(user, id);
  }

  send(user, id, connectionIds) {
    const snap = this.find(user, id, true);
    if (!snap.attempt) throw accountError('Complete your three-question mini quiz before sharing', 409);
    if (!Array.isArray(connectionIds) || !connectionIds.length || connectionIds.length > 30 || new Set(connectionIds).size !== connectionIds.length) throw accountError('Choose between 1 and 30 study mates');
    const connections = connectionIds.map(id => this.connection(user, id, true));
    if (snap.deliveries.length) {
      if (snap.deliveries.length === connectionIds.length && snap.deliveries.every(item => connectionIds.includes(item.connectionId))) return this.detail(user, id);
      throw accountError('This snap has already been sent. Capture a new study snap to send again.', 409);
    }
    const sentAt = new Date().toISOString();
    snap.deliveries = connections.map(connection => ({ connectionId: connection.id, recipientId: connection.from === user.id ? connection.to : connection.from, sentAt, openedAt: null }));
    this.save();
    return this.detail(user, id);
  }

  open(user, id) {
    const snap = this.find(user, id);
    if (snap.ownerId === user.id) return this.detail(user, id);
    const delivery = this.activeDelivery(snap, user);
    if (!delivery.openedAt) { delivery.openedAt = new Date().toISOString(); this.save(); }
    return this.detail(user, id);
  }

  photo(user, id) {
    this.detail(user, id);
    return fs.readFileSync(path.join(this.dir, `${id}.jpg`));
  }

  remove(user, id) {
    const snap = this.find(user, id, true);
    snap.deletedAt = new Date().toISOString(); snap.questions = []; snap.sourceText = ''; snap.title = 'Deleted study snap';
    if (snap.attempt) snap.attempt.answers = {};
    this.save(); fs.rmSync(path.join(this.dir, `${id}.jpg`), { force: true });
    return { deleted: true };
  }

  completedFor(user) { return this.state.snaps.filter(snap => snap.ownerId === user.id && snap.attempt).map(snap => snap.attempt); }

  async handle(req, res, route, user, { json, readBody, auth, ai, startJob }) {
    const method = req.method;
    if (route === '/social' && method === 'GET') return json(res, 200, this.list(user));
    if (route === '/mates/request' && method === 'POST') return json(res, 201, this.request(user, (await readBody(req, 4096)).code));
    const mate = route.match(/^\/mates\/([a-f\d-]+)(?:\/(accept))?$/);
    if (mate && method === 'POST' && mate[2]) return json(res, 200, this.accept(user, mate[1]));
    if (mate && method === 'DELETE' && !mate[2]) return json(res, 200, this.removeConnection(user, mate[1]));
    if (route === '/snaps' && method === 'POST') {
      if (!auth.status().connected) throw accountError('Connect your own ChatGPT account in Settings to make a study snap');
      const body = await readBody(req, 10 * 1024 * 1024);
      snapPhoto(body.photo);
      return json(res, 202, startJob(progress => this.create(user, body, ai, progress)));
    }
    const snap = route.match(/^\/snaps\/([a-f\d-]+)(?:\/(submit|send|open|photo))?$/);
    if (snap) {
      if (!snap[2] && method === 'GET') return json(res, 200, this.detail(user, snap[1]));
      if (!snap[2] && method === 'DELETE') return json(res, 200, this.remove(user, snap[1]));
      if (snap[2] === 'submit' && method === 'POST') return json(res, 200, this.submit(user, snap[1], (await readBody(req, 8192)).answers));
      if (snap[2] === 'send' && method === 'POST') return json(res, 200, this.send(user, snap[1], (await readBody(req, 8192)).mateIds));
      if (snap[2] === 'open' && method === 'POST') return json(res, 200, this.open(user, snap[1]));
      if (snap[2] === 'photo' && method === 'GET') {
        const bytes = this.photo(user, snap[1]);
        res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': bytes.length, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" });
        return res.end(bytes);
      }
    }
    throw accountError('Endpoint not found', 404);
  }
}
