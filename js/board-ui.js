/* 랭킹 화면과 점수 등록 폼 */
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const box = $('submitBox'), input = $('nameInput'), msg = $('submitMsg'), btn = $('btnSubmit');
  const fmt = n => Math.floor(n).toLocaleString('ko-KR');
  let pending = null, period = 'all';

  function runStart(){ pending = null; Board.startRun(); }
  function runEnd(where, result){
    box.hidden = true;
    if (!where || result.score < 1) return;
    pending = result;
    $(where === 'over' ? 'overSubmitSlot' : 'clearSubmitSlot').appendChild(box);
    input.value = Ops.save.get().name || '';
    msg.textContent = Board.mode === 'local' ? '서버에 연결되지 않아 이 기기에만 기록돼요.' : '';
    msg.className = 'submitmsg'; btn.disabled = false; input.disabled = false; box.hidden = false;
  }
  box.addEventListener('submit', async e => {
    e.preventDefault();
    if (!pending || btn.disabled) return;
    const name = input.value.replace(/\s+/g, ' ').trim();
    if (!name) { msg.textContent = '이름을 적어 주세요.'; msg.className = 'submitmsg err'; input.focus(); return; }
    btn.disabled = true; msg.className = 'submitmsg'; msg.textContent = '등록하는 중…';
    try {
      const r = await Board.submit(Object.assign({ name }, pending));
      Ops.save.set({ name: r.name || name });
      pending = null; input.disabled = true;
      msg.className = 'submitmsg ok';
      msg.textContent = r.kept ? `등록된 내 최고 기록 ${fmt(r.kept)}점이 더 높아서 그대로 뒀어요.` : r.rank ? `${Board.label} ${r.rank}위로 등록됐어요!` : '등록됐어요!';
    } catch (err) {
      btn.disabled = false; msg.className = 'submitmsg err'; msg.textContent = err.message || '등록하지 못했어요. 다시 시도해 주세요.';
    }
  });

  async function load(){
    const list = $('boardList'), m = $('boardMsg');
    list.innerHTML = ''; m.textContent = '불러오는 중…';
    await Board.ready;
    $('boardTitle').textContent = Board.label;
    $('boardTabs').hidden = Board.mode !== 'api';
    try {
      const rows = await Board.top(10, period);
      m.textContent = rows.length ? '' : '아직 기록이 없어요. 첫 번째 배달부가 되어 보세요!';
      for (const r of rows) {
        const li = document.createElement('li'); if (r.mine) li.className = 'mine';
        const a = document.createElement('span'); a.className = 'rk'; a.textContent = r.rank;
        const b = document.createElement('span'); b.className = 'nm'; b.textContent = r.name;
        const c = document.createElement('span'); c.className = 'st'; c.textContent = r.cleared ? '완주' : `${r.stage}장`;
        const d = document.createElement('span'); d.className = 'sc'; d.textContent = fmt(r.score);
        li.append(a, b, c, d); list.appendChild(li);
      }
    } catch (err) { m.textContent = '랭킹을 불러오지 못했어요.'; }
  }
  $('btnBoard').onclick = () => { CatGame.showOv('ovBoard'); load(); };
  $('btnBoardClose').onclick = () => CatGame.showOv('ovTitle');
  $('boardTabs').addEventListener('click', e => {
    const t = e.target.closest('.tab'); if (!t) return;
    period = t.dataset.period;
    for (const x of $('boardTabs').children) x.classList.toggle('on', x === t);
    load();
  });
  window.BoardUI = { runStart, runEnd };
})();
