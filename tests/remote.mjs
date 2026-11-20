// 게임(정적 호스팅)과 API 서버가 서로 다른 주소일 때: apiRemote 로 연결되어 점수가 등록되는지 점검
import { chromium } from 'playwright';
import { serve } from '../scripts/serve.mjs';
import { createApp } from '../server/app.mjs';

const site = await serve(0);
const siteOrigin = `http://localhost:${site.address().port}`;
const api = createApp({ rules: { minRunMs: 0 }, secret: 'test', allowedOrigins: siteOrigin });
await new Promise(r => api.listen(0, r));
const apiBase = `http://127.0.0.1:${api.address().port}/api`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 640 } });
await page.route('**/js/config.js', async route => {
  const res = await route.fetch();
  await route.fulfill({ response: res, body: (await res.text()).replace("apiRemote: ''", `apiRemote: '${apiBase}'`) });
});
let failed = 0;
const check = (ok, name) => { console.log(`${ok ? '✓' : '✗'} ${name}`); if (!ok) failed++; };
try {
  await page.goto(siteOrigin + '/?debug=1');
  await page.waitForFunction(() => window.Board && window.Board.mode === 'api', null, { timeout: 15000 }).catch(() => {});
  check(await page.evaluate(() => window.Board.mode) === 'api', '다른 주소의 API 서버에 연결');
  await page.click('#btnStart');
  await page.waitForTimeout(600);
  await page.evaluate(() => { const c = window.__cat; c.G.score = 777; c.P.inv = 0; c.P.hp = 1; c.P.shield = 0;
    c.ents.push({ type: 'rock', def: { w: 50, h: 34, place: 'ground', draw() {} }, x: c.P.x - 10, y: 406, w: 50, h: 34, hp: 1, t: 0, dead: false, flash: 0 }); });
  await page.waitForSelector('#ovOver:not([hidden])', { timeout: 6000 });
  await page.fill('#nameInput', '원격 냥이');
  await page.click('#btnSubmit');
  await page.waitForSelector('#submitMsg.ok', { timeout: 5000 }).catch(() => {});
  check(/1위/.test(await page.textContent('#submitMsg')), '다른 주소에서 점수 등록');
  const lb = await (await fetch(apiBase + '/leaderboard')).json();
  check(lb.entries[0]?.name === '원격 냥이', '서버 랭킹에 저장');
} catch (e) { console.error(e); failed++; }
await browser.close(); site.close(); api.close();
console.log(failed ? `\n${failed}개 실패` : '\n모두 통과');
process.exit(failed ? 1 : 0);
