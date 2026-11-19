/* 랭킹: 쓸 수 있는 저장소를 골라 같은 모양으로 감쌉니다.
   1) 게임 API 서버 (server/)            → 모든 플레이어 공용 랭킹
   2) claude.ai 공유 페이지의 db 기능    → 그 페이지를 보는 로그인 사용자 공용 랭킹
   3) 둘 다 없으면 이 기기 안의 내 기록   */
(function(){
  'use strict';
  const C = window.CAT_CONFIG || {};
  const LOCAL_KEY = 'catpost_local_board';
  let mode = 'local', api = '', db = null, uid = null, run = null;
  const listeners = [];
  const ready = (async () => {
    // 1) API
    const cands = C.apiBase === 'auto' ? ['api'] : C.apiBase ? [C.apiBase.replace(/\/$/, '')] : [];
    for (const base of cands) {
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 2500);
        const r = await fetch(base + '/health', { signal: ctl.signal, cache: 'no-store' }); clearTimeout(t);
        const j = r.ok && /json/.test(r.headers.get('content-type') || '') ? await r.json() : null;
        if (j && j.ok) { mode = 'api'; api = base; Ops.useApi(base); return mode; }
      } catch (e) {}
    }
    // 2) claude.ai 공유 페이지 db
    try {
      if (window.claude && window.claude.use) {
        const d = await Promise.race([window.claude.use('db'), new Promise(r => setTimeout(() => r(null), 6000))]);
        if (d) {
          const u = await window.claude.use('user');
          uid = u ? await u.id() : null;
          if (uid) { db = d; mode = 'db'; return mode; }
        }
      }
    } catch (e) {}
    return mode;
  })().then(m => { listeners.forEach(f => f(m)); return m; });

  async function call(method, path, body){
    const r = await fetch(api + path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error && j.error.message || '서버에 연결하지 못했어요.'), { code: j.error && j.error.code });
    return j;
  }
  function localList(){ try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch (e) { return []; } }

  window.Board = {
    ready, get mode(){ return mode; },
    onReady(f){ listeners.push(f); },
    get label(){ return mode === 'api' ? '전체 랭킹' : mode === 'db' ? '이 페이지 랭킹' : '이 기기 기록'; },
    async startRun(){ run = null; await ready; if (mode === 'api') { try { run = await call('POST', '/runs'); } catch (e) { run = null; } } },
    async submit(e){
      await ready;
      const rec = { name: e.name, score: Math.floor(e.score), stage: e.stage, level: e.level, letters: e.letters, cleared: !!e.cleared };
      if (mode === 'api') {
        if (!run) throw new Error('이 판은 서버에 연결되기 전에 시작돼서 등록할 수 없어요.');
        const r = await call('POST', '/scores', Object.assign({ runId: run.runId, token: run.token, v: Ops.version }, rec));
        run = null; return { rank: r.rank, name: r.name, id: r.id };
      }
      if (mode === 'db') {
        const ref = db.doc('scores/' + uid);
        const cur = await ref.get().catch(() => null);
        const prev = cur && cur.exists ? cur.data() : null;
        if (!prev || !(prev.score >= rec.score)) await ref.set(Object.assign({ at: Date.now() }, rec));
        const top = await this.top(50);
        const i = top.findIndex(x => x.mine);
        return { rank: i >= 0 ? i + 1 : null, name: rec.name, kept: prev && prev.score >= rec.score ? prev.score : null };
      }
      const list = localList(); list.push(Object.assign({ at: Date.now() }, rec));
      list.sort((a, b) => b.score - a.score);
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, 20))); } catch (err) {}
      return { rank: list.indexOf(list.find(x => x.score === rec.score && x.name === rec.name)) + 1, name: rec.name };
    },
    async top(limit = 10, period = 'all'){
      await ready;
      if (mode === 'api') return (await call('GET', `/leaderboard?limit=${limit}&period=${period}`)).entries;
      if (mode === 'db') {
        const snap = await db.collection('scores').orderBy('score', 'desc').limit(limit).get();
        return snap.docs.map((d, i) => Object.assign({ rank: i + 1, mine: d.id === uid }, d.data()));
      }
      return localList().slice(0, limit).map((x, i) => Object.assign({ rank: i + 1 }, x));
    },
  };
})();
