import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, cleanName } from '../server/app.mjs';

let clock = 1_800_000_000_000;
const server = createApp({ now: () => clock, secret: 's', adminKey: 'admin-key', allowedOrigins: 'https://game.example' });
await new Promise(r => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
test.after(() => server.close());

const call = async (method, path, body, headers = {}) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
};
const play = async (seconds, score, extra = {}) => {
  const run = (await call('POST', '/api/runs')).body;
  clock += seconds * 1000;
  return call('POST', '/api/scores', { ...run, name: '냥이', score, stage: 1, level: 3, letters: 20, ...extra });
};

test('health', async () => {
  const r = await call('GET', '/api/health');
  assert.equal(r.status, 200); assert.equal(r.body.ok, true);
});

test('점수 등록과 랭킹', async () => {
  const a = await play(60, 3000);
  assert.equal(a.status, 200); assert.equal(a.body.rank, 1);
  const b = await play(60, 5000, { name: '  치즈 <b>  ' });
  assert.equal(b.body.rank, 1); assert.equal(b.body.name, '치즈 b');
  const lb = (await call('GET', '/api/leaderboard?limit=5')).body;
  assert.deepEqual(lb.entries.map(e => e.score), [5000, 3000]);
  assert.equal(lb.entries[0].rank, 1);
});

test('같은 판은 한 번만 등록', async () => {
  const run = (await call('POST', '/api/runs')).body; clock += 60000;
  const body = { ...run, name: '냥', score: 100, stage: 1 };
  assert.equal((await call('POST', '/api/scores', body)).status, 200);
  assert.equal((await call('POST', '/api/scores', body)).status, 409);
});

test('조작된 점수 거부', async () => {
  assert.equal((await play(60, 9_000_000)).status, 422, '시간에 비해 너무 높은 점수');
  assert.equal((await play(1, 10)).status, 403, '너무 짧은 판');
  const run = (await call('POST', '/api/runs')).body; clock += 60000;
  assert.equal((await call('POST', '/api/scores', { ...run, token: 'x', name: '냥', score: 10, stage: 1 })).status, 403, '위조 토큰');
  assert.equal((await call('POST', '/api/scores', { runId: 'nope', token: 'x', name: '냥', score: 10, stage: 1 })).status, 403);
  assert.equal((await play(60, 100, { stage: 9 })).status, 400);
  assert.equal((await play(60, -5)).status, 400);
  assert.equal((await play(60, 100, { name: '   ' })).status, 400);
});

test('이름 정리', () => {
  assert.equal(cleanName('<script>'), 'script');
  assert.equal(cleanName('가'.repeat(30)).length, 12);
  assert.equal(cleanName('씨발'), null);
  assert.equal(cleanName(''), null);
});

test('통계·오류 수집과 관리자 조회', async () => {
  await call('POST', '/api/events', { name: 'game_over', data: { stage: 2 }, session: 'abc', v: '1.1.0' });
  await call('POST', '/api/errors', { kind: 'error', msg: 'boom', v: '1.1.0' });
  assert.equal((await call('POST', '/api/events', { name: 'Bad Name!' })).status, 400);
  assert.equal((await call('GET', '/api/admin/stats')).status, 401);
  const s = await call('GET', '/api/admin/stats', null, { 'X-Admin-Key': 'admin-key' });
  assert.equal(s.status, 200);
  assert.ok(s.body.events.some(e => e.name === 'game_over' && e.stage === 2 && e.n === 1));
  assert.equal(s.body.errors7d, 1);
});

test('관리자: 점수 숨기기', async () => {
  const top = (await call('GET', '/api/leaderboard')).body.entries[0];
  const r = await call('POST', '/api/admin/hide-score', { id: top.id }, { 'X-Admin-Key': 'admin-key' });
  assert.equal(r.body.ok, true);
  assert.notEqual((await call('GET', '/api/leaderboard')).body.entries[0].id, top.id);
});

test('CORS 와 요청 제한, 정적 파일 보호', async () => {
  const ok = await fetch(base + '/api/health', { headers: { Origin: 'https://game.example' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://game.example');
  const no = await fetch(base + '/api/health', { headers: { Origin: 'https://evil.example' } });
  assert.equal(no.headers.get('access-control-allow-origin'), null);
  assert.equal((await fetch(base + '/server/app.mjs')).status, 404);
  assert.equal((await fetch(base + '/package.json')).status, 404);
  assert.equal((await fetch(base + '/')).status, 200);
  let last; for (let i = 0; i < 35; i++) last = await call('POST', '/api/runs');
  assert.equal(last.status, 429);
});
