import { api, esc, fmtDate, ago, dday, CYCLE, ACTION, person, icon, modal, toast } from '../util.js?v=ba02ddfac8';

const ORDER = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'seasonal', 'adhoc', 'unknown'];

export async function render(root, app) {
  const d = await api('/api/dashboard');
  const me = app.me;
  const s = d.stats;
  const holders = d.holders;
  const incoming = holders.find((h) => h.status === 'incoming');
  const current = holders.find((h) => h.status === 'current');
  const canApprove = app.me.active?.perms.includes('approve') && app.me.active?.id === app.me.user.position_id;
  const byCycle = {};
  for (const t of d.tasks) (byCycle[t.cycle] ||= []).push(t);
  const pct = (n) => (d.coverage.tasks ? Math.round((n / d.coverage.tasks) * 100) : 0);

  root.innerHTML = `
  <div class="page-head">
    <div><h1>${esc(d.position.name)}</h1></div>
    <div class="actions"><a class="btn" href="#/ask">${icon('ask')} 질문</a><a class="btn primary" href="#/learn">${icon('learn')} 지식 등록</a></div>
  </div>

  <div class="card hero-card" style="margin-bottom:16px">
    <div>
      <div class="muted small">보직자 이력</div>
      <h2 style="margin-top:2px">보직자 ${holders.filter((h) => h.status !== 'incoming').length}명 · 유효 지식 ${s.active}건</h2>
      <div class="muted small" style="margin-top:2px">개정 ${s.superseded}건 · 해결된 충돌 ${s.resolvedConflicts}건 · 질문 ${s.questions}건</div>
      ${canApprove ? `<div class="row" style="margin-top:10px">${incoming
        ? `<button class="btn sm hero-btn" id="handover">보직자 교대</button>`
        : `<button class="btn sm hero-btn" id="addIncoming">인수자 등록</button>`}</div>` : ''}
    </div>
    <div class="lineage">
      ${holders.map((h, i) => `${i ? '<span class="gen-arrow">›</span>' : ''}<div class="gen ${h.status === 'current' ? 'cur' : h.status === 'incoming' ? 'next' : ''}">
        <div class="n">${esc(h.rank)} ${esc(h.name)}</div>
        <div class="t">${h.status === 'former' ? `${fmtDate(h.tenure_start).slice(2, 7)}~${fmtDate(h.tenure_end).slice(2, 7)}` : h.status === 'current' ? `현 보직자${/(이병|일병|상병|병장)/.test(h.rank) && h.tenure_end ? ` · 전역 ${dday(h.tenure_end)}` : ''}` : `인수자 · ${fmtDate(h.tenure_start).slice(5)} 전입`}</div>
      </div>`).join('')}
    </div>
  </div>

  <div class="grid g4" style="margin-bottom:16px">
    <div class="card kpi"><div class="l">유효 지식</div><div class="v">${s.active}</div><div class="d">업무 ${d.tasks.length}개 · 초안 ${s.drafts}건</div></div>
    <div class="card kpi"><div class="l">지식그래프</div><div class="v">${s.nodes}<span class="unit"> 노드</span></div><div class="d">관계 ${s.edges}개</div></div>
    <div class="card kpi ${s.openConflicts ? 'alert' : ''}"><div class="l">미해결 충돌</div><div class="v">${s.openConflicts}</div><div class="d">${s.openConflicts ? '<a href="#/conflicts">목록 보기</a>' : '없음'}</div></div>
    <div class="card kpi"><div class="l">절차 등록률</div><div class="v">${pct(d.coverage.withSteps)}%</div><div class="d">전체 업무 중 절차가 있는 업무</div></div>
  </div>

  <div class="grid" style="grid-template-columns: 1.6fr 1fr; margin-bottom:16px">
    <div class="card">
      <div class="card-h"><h3>업무 주기</h3><div class="right"><a class="btn sm ghost" href="#/graph">그래프 보기</a></div></div>
      <div class="card-b">
        <div class="cycle-board">
          ${ORDER.filter((c) => byCycle[c]).map((c) => `<div class="cycle-col"><h4><span>${CYCLE[c]}</span><span>${byCycle[c].length}</span></h4>
            ${byCycle[c].map((t) => `<a class="task-chip ${t.conflicts ? 'conf' : ''}" href="#/ask/${encodeURIComponent(`${t.name} 어떻게 해?`)}" title="이 업무에 대해 질문하기">${esc(t.name)}
              <span class="d">${esc(t.detail || '')}${t.conflicts ? ` · <span style="color:var(--red)">충돌 ${t.conflicts}</span>` : ''}</span></a>`).join('')}
          </div>`).join('') || '<div class="empty">아직 등록된 업무가 없습니다.</div>'}
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-h"><h3>인수인계 준비도</h3><span class="sub">업무 ${d.coverage.tasks}개 기준</span></div>
      <div class="card-b">
        ${[['절차 등록', d.coverage.withSteps], ['주기 명시', d.coverage.withCycle], ['주의사항', d.coverage.withCautions], ['예외 처리', d.coverage.withExceptions]].map(([l, n]) => `
          <div class="cov-row"><span>${l}</span><div class="progress"><i style="width:${pct(n)}%"></i></div><span style="text-align:right">${pct(n)}%</span></div>`).join('')}
      </div>
    </div>
  </div>

  <div class="grid g2">
    <div class="card">
      <div class="card-h"><h3>최근 변경</h3><div class="right"><a class="btn sm ghost" href="#/knowledge">전체 보기</a></div></div>
      <div class="card-b"><div class="timeline">
        ${d.history.map((h) => {
          const a = ACTION[h.action] || [h.action, '#6b7280'];
          return `<div class="tl"><span class="dot" style="background:${a[1]}"></span><div><div class="t"><b>${esc(h.title)}</b> <span class="muted">${a[0]}</span></div><div class="m">${person(h.actor)} · ${fmtDate(h.at, true)}${h.note ? ` · ${esc(h.note)}` : ''}</div></div></div>`;
        }).join('') || '<div class="empty">이력이 없습니다</div>'}
      </div></div>
    </div>
    <div class="card">
      <div class="card-h"><h3>빠른 질문</h3></div>
      <div class="card-b">
        <form id="qq" class="row"><input class="input" name="q" placeholder="업무에 대해 질문하세요"><button class="btn primary" title="질문">${icon('send')}</button></form>
        <div class="row wrap" style="margin-top:10px">
          ${['배차 신청 마감이 언제야?', '유류 결산은 어떻게 해?', 'DTIS 운행종료 안 하면 어떻게 돼?', '사고 나면 뭐부터 해야 해?'].map((q) => `<a class="gchip" href="#/ask/${encodeURIComponent(q)}">${q}</a>`).join('')}
        </div>
        <div class="sep"></div>
        <div class="small muted" style="margin-bottom:6px">최근 질문</div>
        ${d.recentQ.map((q) => `<div class="row small" style="padding:4px 0"><span>${esc(q.question)}</span><span class="muted xs" style="margin-left:auto">${esc(q.rank || '')} ${esc(q.name || '')} · ${ago(q.at)}</span></div>`).join('') || '<div class="muted small">아직 질문이 없습니다.</div>'}
      </div>
    </div>
  </div>`;
  const ho = root.querySelector('#handover');
  if (ho) ho.onclick = () => {
    const m = modal({
      title: '보직자 교대', size: 'sm',
      body: `<div class="handover-flow"><div class="gen-box">${esc(current ? `${current.rank} ${current.name}` : '없음')}<span>현 보직자</span></div><span class="arrow">→</span><div class="gen-box next">${esc(`${incoming.rank} ${incoming.name}`)}<span>새 보직자</span></div></div>
        <ul class="small" style="margin:14px 0 0;padding-left:18px;line-height:1.8"><li>보직 계정(${esc(app.me.user.login_id || '')})과 지식 ${s.active}건은 그대로 유지됩니다.</li><li>이후 작성·승인 기록에는 새 보직자 이름이 남습니다.</li><li>이전 보직자는 보직자 이력에 남습니다.</li></ul>`,
      footer: '<button class="btn" data-close>취소</button><button class="btn primary" id="hoGo">교대</button>',
    });
    m.el.querySelector('#hoGo').onclick = async () => {
      try { await api('/api/seat/handover', { method: 'POST' }); m.close(); toast(`${incoming.rank} ${incoming.name}(으)로 보직자를 교대했습니다`, 'ok'); await app.refreshMe(); render(root, app); } catch (e) { toast(e.message, 'err'); }
    };
  };
  const ai = root.querySelector('#addIncoming');
  if (ai) ai.onclick = () => {
    const m = modal({
      title: '인수자 등록', size: 'sm',
      body: '<div class="grid" style="grid-template-columns:110px 1fr;gap:10px"><div class="field"><label>계급</label><select class="select" id="inRank">' + ['이병', '일병', '상병', '병장', '하사', '중사', '상사', '소위', '중위', '대위'].map((r) => `<option>${r}</option>`).join('') + '</select></div><div class="field"><label>성명</label><input class="input" id="inName" placeholder="홍길동"></div></div>',
      footer: '<button class="btn" data-close>취소</button><button class="btn primary" id="inGo">등록</button>',
    });
    m.el.querySelector('#inGo').onclick = async () => {
      try { await api('/api/seat/incoming', { body: { rank: m.el.querySelector('#inRank').value, name: m.el.querySelector('#inName').value } }); m.close(); toast('인수자를 등록했습니다', 'ok'); await app.refreshMe(); render(root, app); } catch (e) { toast(e.message, 'err'); }
    };
  };
  root.querySelector('#qq').onsubmit = (e) => {
    e.preventDefault();
    const q = new FormData(e.target).get('q');
    if (q) location.hash = `#/ask/${encodeURIComponent(q)}`;
  };
}
