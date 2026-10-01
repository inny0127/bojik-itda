// 질문: 권한 기반 GraphRAG 챗 + 근거·출처 + 검색 과정 시각화
import { api, esc, md, icon, toast, fmtDate } from '../util.js?v=9789aa7ca9';

const SUGGEST = {
  default: ['배차 신청 마감이 언제야?', '야간에 차량 운행하려면 누구 승인 받아야 해?', 'DTIS 운행종료 안 하면 어떻게 돼?', '유류 결산 어떻게 해?', '사고 나면 뭐부터 해야 해?', '운전병 자격 미등록 오류 뜨면?', '휴가 처리 절차 알려줘'],
};

let convo = [];
let posKey = null;

export async function render(root, app, arg) {
  if (posKey !== app.me.active?.id) { convo = []; posKey = app.me.active?.id; }
  root.innerHTML = `
  <div class="page-head">
    <div><h1>질문</h1>
    <p>${esc(app.me.active?.name || '')} 권한 범위의 지식과 규정에서 찾아 근거와 함께 답합니다.</p></div>
    <div class="actions"><button class="btn sm" id="clear">새 대화</button></div>
  </div>
  <div class="ask-grid">
    <div class="card chat">
      <div class="chat-log" id="log"></div>
      <div class="suggests" id="sugg">${SUGGEST.default.map((q) => `<button class="gchip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <form class="chat-input" id="f">
        <textarea class="textarea" id="q" rows="1" placeholder="질문을 입력하세요"></textarea>
        <button class="btn primary" id="send" style="height:42px">질문</button>
      </form>
    </div>
    <div class="side-scroll">
      <div class="card"><div class="card-h"><h3>검색 과정</h3></div><div class="card-b" id="trace"><div class="muted small">질문하면 검색 과정이 표시됩니다.</div></div></div>
      <div class="card"><div class="card-h"><h3>근거</h3><span class="sub" id="srcCount"></span></div><div class="card-b col" id="sources" style="gap:8px"><div class="muted small">답변에 사용된 근거가 표시됩니다.</div></div></div>
    </div>
  </div>`;

  const log = root.querySelector('#log');
  const q = root.querySelector('#q');
  const draw = () => {
    log.innerHTML = convo.length ? convo.map((m, i) => m.role === 'user'
      ? `<div class="msg user"><div class="av"></div><div class="bubble">${esc(m.content)}</div></div>`
      : `<div class="msg bot" data-i="${i}"><div class="av">${icon('ask')}</div><div><div class="bubble">${m.pending ? '<span class="row"><span class="spinner dark"></span> 검색 중</span>' : md(m.content)}</div>
          ${!m.pending && (m.mode === 'error' || (m.mode === 'local' && app.me.llm?.mode === 'llm')) ? `<div class="llm-fail">${m.mode === 'error' ? '답변을 받지 못했습니다.' : 'Luna 응답을 받지 못해 내장 엔진으로 답했습니다.'} <button class="btn xs" data-retry="${i}">Luna로 다시 답변</button></div>` : ''}
          ${m.pending ? '' : `<div class="msg-meta"><span>근거 ${m.sources?.length || 0}건</span><span>${m.trace?.ms ?? ''}ms</span>
          <button class="btn xs ghost" data-show="${i}">근거 보기</button>
          <button class="btn xs ghost" data-fb="${i}:up" title="도움이 됨">${icon('thumb', 'width="12" height="12"')}</button>
          <button class="btn xs ghost" data-fb="${i}:down" title="부정확함" style="transform:scaleY(-1)">${icon('thumb', 'width="12" height="12"')}</button>${m.feedback ? `<span>${m.feedback === 'up' ? '의견을 기록했습니다' : '의견을 기록했습니다. 학습에서 내용을 보완해 주세요.'}</span>` : ''}</div>`}</div></div>`).join('')
      : `<div class="empty"><p>${esc(app.me.active?.name || '')}의 승인된 지식과 열람 가능한 규정에서 답을 찾습니다.</p></div>`;
    log.scrollTop = log.scrollHeight;
    root.querySelector('#sugg').style.display = convo.length > 2 ? 'none' : '';
  };
  const showSide = (m) => {
    if (!m || m.pending) return;
    renderTrace(root.querySelector('#trace'), m.trace, m.mode);
    renderSources(root, m.sources);
  };
  const ask = async (pending, text, history) => {
    try {
      const r = await api('/api/ask', { body: { question: text, history } });
      Object.assign(pending, { pending: false, content: r.answer, sources: r.sources, trace: r.trace, mode: r.mode, id: r.id, question: text, history });
      draw(); showSide(pending);
    } catch (e) {
      Object.assign(pending, { pending: false, content: `오류: ${e.message}`, sources: [], trace: null, mode: 'error', question: text, history });
      draw();
    }
  };
  const send = async (text) => {
    text = text.trim();
    if (!text) return;
    q.value = '';
    const history = convo.filter((m) => !m.pending && m.mode !== 'error').map((m) => ({ role: m.role, content: m.content }));
    convo.push({ role: 'user', content: text });
    const pending = { role: 'bot', pending: true };
    convo.push(pending);
    draw();
    await ask(pending, text, history);
  };
  root.querySelector('#f').onsubmit = (e) => { e.preventDefault(); send(q.value); };
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(q.value); } });
  root.querySelector('#sugg').onclick = (e) => { const b = e.target.closest('[data-q]'); if (b) send(b.dataset.q); };
  root.querySelector('#clear').onclick = () => { convo = []; draw(); root.querySelector('#trace').innerHTML = '<div class="muted small">새 대화를 시작했습니다.</div>'; root.querySelector('#sources').innerHTML = ''; };
  log.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-cite]');
    if (c) {
      const i = e.target.closest('[data-i]')?.dataset.i;
      if (i != null) showSide(convo[i]);
      const el = root.querySelector(`[data-src="${c.dataset.cite}"]`);
      if (el) { root.querySelectorAll('.src.hl').forEach((x) => x.classList.remove('hl')); el.classList.add('hl'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      return;
    }
    const rt = e.target.closest('[data-retry]');
    if (rt) {
      const m = convo[rt.dataset.retry];
      if (!m?.question) return;
      Object.assign(m, { pending: true, content: '', feedback: null });
      draw();
      await ask(m, m.question, m.history || []);
      return;
    }
    const sb = e.target.closest('[data-show]');
    if (sb) showSide(convo[sb.dataset.show]);
    const fb = e.target.closest('[data-fb]');
    if (fb) {
      const [i, v] = fb.dataset.fb.split(':');
      const m = convo[i];
      try { await api(`/api/ask/${m.id}/feedback`, { body: { feedback: v } }); m.feedback = v; draw(); } catch (err) { toast(err.message, 'err'); }
    }
  });
  draw();
  const last = [...convo].reverse().find((m) => m.role === 'bot' && !m.pending);
  if (last) showSide(last);
  if (arg) { history.replaceState(null, '', '#/ask'); send(arg); }
}

function renderTrace(el, t, mode) {
  if (!t) { el.innerHTML = ''; return; }
  const ex = t.corpus.excluded;
  const exDocs = Object.values(ex).reduce((a, b) => a + b, 0);
  el.innerHTML = `<div class="pipe">
    <div class="st"><span class="num">1</span><div><div class="ttl">권한 범위</div>
      <div class="dsc">${esc(t.scope.position)}<br>${t.scope.units.map(esc).join(' › ')}</div></div></div>
    <div class="st"><span class="num">2</span><div><div class="ttl">검색 전 권한 필터</div>
      <div class="funnel"><span class="box">문서 ${t.corpus.docsTotal}</span>→<span class="box ok">열람 가능 ${t.corpus.docsAllowed}</span>${exDocs ? `<span class="box x">제외 ${exDocs}</span>` : ''}</div>
      <div class="dsc xs muted" style="margin-top:3px">${Object.entries(ex).filter(([, v]) => v).map(([k, v]) => `${k} ${v}건`).join(' · ') || '제외 없음'}</div>
      <div class="funnel"><span class="box">지식 ${t.corpus.kuTotal}</span>→<span class="box ok">이 보직 ${t.corpus.kuSearched}</span>${t.corpus.kuExcluded ? `<span class="box x">타 부대·보직 ${t.corpus.kuExcluded}</span>` : ''}</div></div></div>
    <div class="st"><span class="num">3</span><div><div class="ttl">검색</div>
      ${t.context ? `<div class="dsc xs muted" style="margin-bottom:4px">${esc(t.context)}</div>` : ''}<div class="dsc">${t.hits.length ? t.hits.slice(0, 5).map((h) => `<div class="row xs"><span class="badge ${h.kind === 'ku' ? 'b-blue' : 'b-amber'}">${h.kind === 'ku' ? '지식' : '문서'}</span><span style="flex:1">${esc(h.title)}</span><span class="mono muted">${h.score}</span></div>`).join('') : '<span class="muted">관련 근거 없음</span>'}</div></div></div>
    <div class="st"><span class="num">4</span><div><div class="ttl">연결 지식</div>
      <div class="dsc">${t.graph.length ? t.graph.map((g) => `<div class="xs" style="margin-bottom:4px"><b>${esc(g.task)}</b>와 연결된 항목 ${g.neighbors.length}개</div>`).join('') : '<span class="muted xs">없음</span>'}
      ${t.conflicts.length ? `<div class="xs" style="color:var(--red)">미해결 충돌 ${t.conflicts.length}건 (답변에 표시)</div>` : ''}</div></div></div>
    <div class="st"><span class="num">5</span><div><div class="ttl">답변 작성</div>
      <div class="dsc">${mode === 'llm' ? `LLM (검색된 근거만 사용)` : '내장 엔진'} · ${t.ms}ms</div></div></div>
  </div>`;
}

function renderSources(root, sources = []) {
  root.querySelector('#srcCount').textContent = sources.length ? `${sources.length}건` : '';
  root.querySelector('#sources').innerHTML = sources.length ? sources.map((s) => `
    <div class="src" data-src="${s.n}">
      <div class="h"><span class="n">${s.n}</span><span style="flex:1">${esc(s.title)}</span>
        ${s.kind === 'ku' ? '<span class="badge b-blue">보직 지식</span>' : `<span class="badge ${s.scope === 'common' ? 'b-gray' : s.scope === 'unit' ? 'b-amber' : 'b-brand'}">${s.scope === 'common' ? '군 공통' : s.scope === 'unit' ? '부대 지침' : '보직 문서'}</span>`}</div>
      <div class="xs muted" style="margin-top:3px">${s.kind === 'ku'
        ? `<a href="#/knowledge/${esc(s.id)}">${esc(s.id)}</a> · v${s.version} · 작성 ${esc(s.author)} · 승인 ${fmtDate(s.approved_at)}`
        : `<a href="#/docs/${esc(s.doc_id)}">${esc(s.heading || '')}</a> · ${esc(s.access)}`}</div>
      <div class="t">${esc(s.text)}</div>
    </div>`).join('') : '<div class="muted small">권한 범위 안에 관련 근거가 없어 답하지 않았습니다.</div>';
}
