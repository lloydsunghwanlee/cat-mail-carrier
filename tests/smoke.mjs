// 배포 전 자동 점검: 페이지가 뜨고, 게임이 시작되고, 3개 스테이지·레벨업·먹기·피격·배달 완료가 오류 없이 돈다.
import { chromium } from 'playwright';
import { serve } from '../scripts/serve.mjs';

const server = await serve(0);
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 640 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text()); });

let failed = 0;
const check = (ok, name) => { console.log(`${ok ? '✓' : '✗'} ${name}`); if (!ok) failed++; };
const ev = (f, a) => page.evaluate(f, a);

try {
  await page.goto(base + '?debug=1');
  await page.waitForTimeout(500);
  check(await page.isVisible('#btnStart'), '타이틀 화면 표시');
  check(/^v\d/.test(await page.textContent('#verLabel')), '버전 표시');
  await page.click('#btnStart');
  await page.waitForTimeout(800);
  check(await ev(() => window.__cat.G.state === 'play'), '게임 시작');
  await ev(() => window.__cat.eat('buldak'));
  await page.waitForTimeout(300);
  check(await ev(() => window.__cat.P.buldak > 0), '불닭볶음면 먹기 → 불닭 모드');
  await ev(() => { window.__cat.P.buldak = 0; window.__cat.eat('cookie'); });
  check(await ev(() => window.__cat.P.shield > 0), '두쫀쿠 먹기 → 보호막');
  await ev(() => { window.__cat.G.xp = 999; });
  await page.waitForTimeout(200);
  check(await page.isVisible('#ovLevel'), '레벨업 선택 화면');
  await ev(() => { window.__cat.G.pendingLv = 1; });
  await page.click('#up0');
  await page.waitForTimeout(100);
  check(await ev(() => window.__cat.G.state === 'play'), '능력 선택 후 재개');
  for (let s = 0; s < 3; s++) {
    await ev(s => { const c = window.__cat; if (c.G.stage !== s) c.startStage(s); c.P.inv = 99; c.P.shield = 99; c.G.dist = 1e6; }, s);
    await page.waitForFunction(() => window.__cat.G.state === 'clear', null, { timeout: 15000 }).catch(() => {});
    check(await page.isVisible('#ovClear'), `${s + 1}장 배달 완료`);
  }
  await ev(() => { const c = window.__cat; c.startStage(0); c.P.inv = 0; c.P.hp = 1; c.P.shield = 0;
    c.ents.push({ type: 'rock', def: { w: 50, h: 34, place: 'ground', draw() {} }, x: c.P.x - 10, y: 406, w: 50, h: 34, hp: 1, t: 0, dead: false, flash: 0 }); });
  await page.waitForFunction(() => window.__cat.G.state === 'over', null, { timeout: 5000 }).catch(() => {});
  check(await page.isVisible('#ovOver'), '피격 → 게임 오버 화면');
  check(await ev(() => window.Ops.save.get().best > 0), '최고 점수 저장');
  check(errors.length === 0, '자바스크립트 오류 없음' + (errors.length ? ': ' + errors.join(' | ') : ''));
} catch (e) {
  console.error(e); failed++;
} finally {
  await browser.close();
  server.close();
}
console.log(failed ? `\n${failed}개 실패` : '\n모두 통과');
process.exit(failed ? 1 : 0);
