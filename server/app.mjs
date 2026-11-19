// 고양이 우편배달부 API + 정적 파일 서버 (의존성 없음)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.mjs';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const PUBLIC = ['index.html', 'sw.js', 'manifest.webmanifest', 'robots.txt', 'css', 'js', 'icons'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8' };
const DAY = 86400000;

// 점수 검증 기준 (게임 밸런스를 바꾸면 같이 조정)
export const RULES = {
  maxStage: 3,
  minRunMs: 5000,            // 5초 미만 판은 받지 않음
  maxRunMs: 3 * 3600 * 1000, // 3시간 지난 토큰은 만료
  pointsPerSec: 90,          // 1초에 벌 수 있는 최대 점수 (여유 있게)
  bonusAllowance: 9000,      // 배달·체력 보너스 여유분
  nameMax: 12,
};
const BANNED = ['시발', '씨발', '병신', '좆', 'fuck', 'shit'];

export function cleanName(raw) {
  let s = String(raw ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  s = [...s].slice(0, RULES.nameMax).join('');
  if (!s) return null;
  const low = s.toLowerCase().replace(/\s/g, '');
  if (BANNED.some(w => low.includes(w))) return null;
  return s;
}

export function createApp(opts = {}) {
  const R = { ...RULES, ...opts.rules };
  const version = opts.version || process.env.APP_VERSION || '1.0.0';
  const secret = opts.secret || process.env.RUN_SECRET || randomUUID();
  const adminKey = opts.adminKey ?? process.env.ADMIN_KEY ?? '';
  const origins = (opts.allowedOrigins ?? process.env.ALLOWED_ORIGINS ?? '*').split(',').map(s => s.trim()).filter(Boolean);
  const now = opts.now || (() => Date.now());
  const store = openDb(opts.dataDir ?? process.env.DATA_DIR);
  const { q } = store;

  // ---- 요청 제한 (IP별, 메모리) ----
  const buckets = new Map();
  function limited(ip, key, perMin) {
    const k = ip + '|' + key, t = now(), b = buckets.get(k) || { n: 0, reset: t + 60000 };
    if (t > b.reset) { b.n = 0; b.reset = t + 60000; }
    b.n++; buckets.set(k, b);
    return b.n > perMin;
  }
  const sweeper = setInterval(() => {
    const t = now();
    for (const [k, b] of buckets) if (t > b.reset) buckets.delete(k);
    q.pruneRuns.run(t - 2 * DAY); q.pruneEvents.run(t - 90 * DAY); q.pruneErrors.run(t - 30 * DAY);
  }, 10 * 60000);
  sweeper.unref();

  const sign = (id, at) => createHmac('sha256', secret).update(id + '.' + at).digest('base64url');
  const sameSig = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

  function cors(req, res) {
    const o = req.headers.origin;
    if (!o) return;
    if (origins.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
    else if (origins.includes(o)) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin'); }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  function json(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }
  const fail = (res, status, code, message) => json(res, status, { error: { code, message } });

  async function readBody(req) {
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > 8192) throw Object.assign(new Error('too large'), { status: 413 }); chunks.push(c); }
    if (!size) return {};
    try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8')); return v && typeof v === 'object' ? v : {}; }
    catch { throw Object.assign(new Error('bad json'), { status: 400 }); }
  }
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  const since = p => p === 'day' ? now() - DAY : p === 'week' ? now() - 7 * DAY : 0;

  const routes = {
    'GET /api/health': () => ({ ok: true, version, time: new Date(now()).toISOString(), scores: q.scoreCount.get().n }),

    'POST /api/runs': (req, body, ip) => {
      if (limited(ip, 'runs', 30)) return [429, 'rate_limited', '잠시 후 다시 시도해 주세요.'];
      const id = randomUUID(), at = now();
      q.insertRun.run(id, at, ip);
      return { runId: id, token: sign(id, at) };
    },

    'POST /api/scores': (req, b, ip) => {
      if (limited(ip, 'scores', 10)) return [429, 'rate_limited', '잠시 후 다시 시도해 주세요.'];
      const name = cleanName(b.name);
      if (!name) return [400, 'bad_name', `이름은 1~${R.nameMax}자로, 욕설 없이 적어 주세요.`];
      if (!int(b.score, 0, 10_000_000) || !int(b.stage, 1, R.maxStage) || !int(b.level ?? 1, 1, 999) || !int(b.letters ?? 0, 0, 100000))
        return [400, 'bad_input', '점수 정보가 올바르지 않아요.'];
      const run = typeof b.runId === 'string' ? q.getRun.get(b.runId) : null;
      if (!run || !sameSig(b.token, sign(run.id, run.started_at))) return [403, 'bad_run', '이 판은 등록할 수 없어요. 새 게임에서 다시 시도해 주세요.'];
      if (run.used) return [409, 'already_submitted', '이미 등록한 판이에요.'];
      const elapsed = now() - run.started_at;
      if (elapsed < R.minRunMs || elapsed > R.maxRunMs) return [403, 'bad_run', '이 판은 등록할 수 없어요.'];
      if (b.score > (elapsed / 1000) * R.pointsPerSec + R.bonusAllowance * b.stage) return [422, 'implausible', '점수를 확인할 수 없어요.'];
      if (!q.useRun.run(run.id).changes) return [409, 'already_submitted', '이미 등록한 판이에요.'];
      const at = now();
      const r = q.insertScore.run(run.id, name, b.score, b.stage, b.level ?? 1, b.letters ?? 0, b.cleared ? 1 : 0, String(b.v || version).slice(0, 20), at);
      return { id: Number(r.lastInsertRowid), name, rank: q.rankOf.get(b.score, 0).rank, weekRank: q.rankOf.get(b.score, since('week')).rank };
    },

    'GET /api/leaderboard': (req, b, ip, url) => {
      const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '10', 10) || 10));
      const period = ['all', 'week', 'day'].includes(url.searchParams.get('period')) ? url.searchParams.get('period') : 'all';
      const rows = q.top.all(since(period), limit);
      return { period, entries: rows.map((r, i) => ({ rank: i + 1, id: r.id, name: r.name, score: r.score, stage: r.stage, level: r.level, cleared: !!r.cleared, at: new Date(r.created_at).toISOString() })) };
    },

    'POST /api/events': (req, b, ip) => {
      if (limited(ip, 'events', 60)) return { ok: true, dropped: true };
      const name = String(b.name || '').slice(0, 40);
      if (!/^[a-z_]{2,40}$/.test(name)) return [400, 'bad_input', 'event name'];
      q.insertEvent.run(name, JSON.stringify(b.data || {}).slice(0, 1000), String(b.session || '').slice(0, 20), String(b.v || '').slice(0, 20), now());
      return { ok: true };
    },

    'POST /api/errors': (req, b, ip) => {
      if (limited(ip, 'errors', 20)) return { ok: true, dropped: true };
      const s = (v, n) => String(v ?? '').slice(0, n);
      q.insertError.run(s(b.kind, 20), s(b.msg, 300), s(b.stack, 1200), s(b.ua, 160), s(b.url, 200), s(b.session, 20), s(b.v, 20), now());
      return { ok: true };
    },

    'GET /api/admin/stats': (req) => {
      if (!adminKey || !sameSig(req.headers['x-admin-key'] || '', adminKey)) return [401, 'unauthorized', '관리자 키가 필요해요.'];
      const t = now() - 7 * DAY;
      return { since: new Date(t).toISOString(), events: q.eventCounts.all(t), errors7d: q.errorCount.get(t).n, recentErrors: q.recentErrors.all(), scores: q.scoreCount.get().n };
    },

    'POST /api/admin/hide-score': (req, b) => {
      if (!adminKey || !sameSig(req.headers['x-admin-key'] || '', adminKey)) return [401, 'unauthorized', '관리자 키가 필요해요.'];
      if (!int(b.id, 1, Number.MAX_SAFE_INTEGER)) return [400, 'bad_input', 'id'];
      return { ok: q.hide.run(b.hidden === false ? 0 : 1, b.id).changes === 1 };
    },
  };

  async function serveStatic(req, res, path) {
    if (path === '/') path = '/index.html';
    const rel = normalize(path).replace(/^[/\\]+/, '');
    const top = rel.split(/[/\\]/)[0];
    if (!PUBLIC.includes(top) || rel.includes('..')) return fail(res, 404, 'not_found', 'Not found');
    const file = join(ROOT, rel);
    if (!file.startsWith(ROOT + sep)) return fail(res, 404, 'not_found', 'Not found');
    try {
      const body = await readFile(file);
      const cache = top === 'icons' ? 'public, max-age=604800' : 'no-cache';
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': cache,
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Content-Security-Policy': "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https:; script-src 'self'" });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { fail(res, 404, 'not_found', 'Not found'); }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const ip = (opts.trustProxy ?? process.env.TRUST_PROXY === '1') ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress : req.socket.remoteAddress;
    try {
      if (url.pathname.startsWith('/api/')) {
        cors(req, res);
        if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
        const h = routes[req.method + ' ' + url.pathname];
        if (!h) return fail(res, 404, 'not_found', '없는 API예요.');
        const body = req.method === 'POST' ? await readBody(req) : {};
        const out = h(req, body, ip, url);
        if (Array.isArray(out)) return fail(res, out[0], out[1], out[2]);
        return json(res, 200, out);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'method', 'Method not allowed');
      return await serveStatic(req, res, decodeURIComponent(url.pathname));
    } catch (e) {
      if (e.status) return fail(res, e.status, 'bad_request', e.message);
      console.error(e);
      return fail(res, 500, 'server_error', '서버 오류가 났어요.');
    }
  });
  server.on('close', () => { clearInterval(sweeper); store.close(); });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 8080;
  if (!process.env.RUN_SECRET) console.warn('RUN_SECRET 이 없어 임시 값을 씁니다. 운영에서는 꼭 설정하세요.');
  createApp().listen(port, () => console.log(`고양이 우편배달부 서버: http://localhost:${port}`));
}
