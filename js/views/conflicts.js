// 충돌: 상충 지식 목록 · 근거 비교 · AI 분석 · 해결(대체/조건 분리/예외 인정)
import { api, esc, toast, icon, fmtDate, SEV, STATUS, badge, person, CYCLE } from '../util.js?v=9789aa7ca9';

let filter = 'open';
let selected = null;

const lunaTried = new Set();

export async function render(root, app, arg) {
  if (arg) { selected = arg; filter = 'all'; }
  const canApprove = app.me.active?.perms.includes('approve');
  root.innerHTML = `
  <div class="page-head">
    <div><h1>충돌</h1>
    <p>서로 어긋나는 지식과 규정 불일치를 검토합니다.</p></div>
    <div class="actions"><button class="btn" id="scan">${icon('refresh')} 전체 검사</button></div>
  </div>
  <div class="cf-grid">
    <div class="card">
      <div class="card-h"><div class="seg" id="seg"><button data-f="open">미해결</button><button data-f="closed">해결됨</button><button data-f="all">전체</button></div><span class="right small muted" id="cnt"></span></div>
      <div id="list"></div>
    </div>
    <div id="detail"></div>
  </div>`;

  const load = async () => {
    const list = await api('/api/conflicts');
    const shown = list.filter((c) => filter === 'all' || (filter === 'open' ? c.status === 'open' : c.status !== 'open'));
    root.querySelectorAll('#seg button').forEach((b) => b.classList.toggle('active', b.dataset.f === filter));
    root.querySelector('#cnt').textContent = `미해결 ${list.filter((c) => c.status === 'open').length} · 전체 ${list.length}`;
    root.querySelector('#list').innerHTML = shown.length ? shown.map((c) => `
      <div class="cf-item ${selected === c.id ? 'sel' : ''}" data-id="${c.id}">
        <span class="bar sev-${c.severity}"></span>
        <div><div class="t">${esc(c.title)}</div>
          <div class="m"><span>${c.rule_code} ${esc(c.rule?.name || '')}</span>${badge(STATUS[c.status])}<span>${fmtDate(c.created_at)}</span></div></div>
      </div>`).join('') : `<div class="empty">${icon('check')}<p>${filter === 'open' ? '미해결 충돌이 없습니다.' : '항목이 없습니다.'}</p></div>`;
    root.querySelectorAll('.cf-item').forEach((it) => it.onclick = () => {
      selected = it.dataset.id;
      root.querySelectorAll('.cf-item').forEach((x) => x.classList.toggle('sel', x === it));
      showDetail();
    });
    if (!selected || !list.some((c) => c.id === selected)) {
      selected = shown[0]?.id || null;
      if (selected) root.querySelector(`.cf-item[data-id="${selected}"]`)?.classList.add('sel');
    }
  };
  const showDetail = async () => {
    const el = root.querySelector('#detail');
    if (!selected) { el.innerHTML = '<div class="card card-b empty">충돌을 선택하세요.</div>'; return; }
    el.innerHTML = '<div class="card card-b"><span class="spinner dark"></span></div>';
    const c = await api(`/api/conflicts/${selected}`);
    el.innerHTML = detailHtml(c, canApprove);
    wire(el, c);
    // 내장 분석(초기 데이터, LLM 응답 실패 시 저장된 분석)만 있으면 열었을 때 Luna 분석으로 자동 교체
    if (c.ai_analysis?.engine !== 'llm' && app.me.llm?.mode === 'llm' && !lunaTried.has(c.id)) {
      lunaTried.add(c.id);
      el.querySelector('.ai-box h4 .eng')?.insertAdjacentHTML('afterend', '<span class="xs muted row" id="lunaWait" style="gap:4px"><span class="spinner dark"></span>Luna 분석 중</span>');
      try {
        const a = await api(`/api/conflicts/${c.id}/analyze`, { method: 'POST' });
        if (selected === c.id && a?.engine === 'llm') showDetail();
        else el.querySelector('#lunaWait')?.remove();
      } catch { el.querySelector('#lunaWait')?.remove(); }
    }
  };
  const wire = (el, c) => {
    const an = el.querySelector('#reAnalyze');
    if (an) an.onclick = async () => {
      an.disabled = true; an.innerHTML = '<span class="spinner dark"></span> 분석 중';
      try { await api(`/api/conflicts/${c.id}/analyze`, { method: 'POST' }); toast('분석을 갱신했습니다'); showDetail(); } catch (e) { toast(e.message, 'err'); an.disabled = false; }
    };
    el.querySelectorAll('[data-revise]').forEach((b) => b.onclick = async () => {
      try {
        const d = await api(`/api/ku/${b.dataset.revise}/revise`, { method: 'POST' });
        toast('개정 초안을 만들었습니다. 승인하면 기존 지식을 대체합니다.', 'ok');
        location.hash = `#/learn/${d.id}`;
      } catch (e) { toast(e.message, 'err'); }
    });
    const form = el.querySelector('#resolveForm');
    if (form) form.onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      try {
        const r = await api(`/api/conflicts/${c.id}/resolve`, { body: { resolution: f.get('resolution'), note: f.get('note') } });
        toast(`반영했습니다. 미해결 ${r.open}건`, 'ok');
        app.refreshMe();
        await load();
        showDetail();
      } catch (err) { toast(err.message, 'err'); }
    };
  };
  root.querySelector('#seg').onclick = (e) => { const b = e.target.closest('[data-f]'); if (b) { filter = b.dataset.f; selected = null; load().then(showDetail); } };
  root.querySelector('#scan').onclick = async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try { const r = await api('/api/conflicts/scan', { method: 'POST' }); toast(`검사했습니다. 신규 ${r.created}건, 미해결 ${r.open}건`, 'ok'); app.refreshMe(); await load(); showDetail(); } catch (err) { toast(err.message, 'err'); }
    b.disabled = false;
  };
  await load();
  showDetail();
}

function kuCard(k, side, field, value) {
  if (!k) return '';
  const s = k.structure;
  return `<div class="kucard ${side}">
    <div class="row"><b>${side === 'a' ? 'A' : 'B'} · ${esc(k.id)}</b>${badge(STATUS[k.status])}<span class="muted xs" style="margin-left:auto">v${k.version}</span></div>
    <div class="xs muted" style="margin-top:2px">작성 ${person(k.author)} · 승인 ${fmtDate(k.approved_at)}</div>
    <div class="hl">${esc(field)}: ${esc(value)}</div>
    <div class="small"><b>${esc(s.task.name)}</b> · ${esc(s.task.cycle_detail || CYCLE[s.task.cycle_type] || '')}${s.task.deadline ? ` · ${esc(s.task.deadline)}` : ''}${s.task.approver ? ` · 결재 ${esc(s.task.approver)}` : ''}</div>
    ${s.steps?.length ? `<ul>${s.steps.slice(0, 5).map((x) => `<li>${esc(x.action)}</li>`).join('')}</ul>` : ''}
    ${s.cautions?.length ? `<ul style="color:#9a3412">${s.cautions.map((x) => `<li>${esc(x.text)}</li>`).join('')}</ul>` : ''}
    ${k.raw_text ? `<details style="margin-top:6px"><summary class="xs muted" style="cursor:pointer">원문</summary><div class="raw-box" style="margin-top:6px">${esc(k.raw_text)}</div></details>` : ''}
    ${k.status === 'active' ? `<button class="btn xs" style="margin-top:8px" data-revise="${esc(k.id)}">개정</button>` : ''}
  </div>`;
}

function detailHtml(c, canApprove) {
  const ev = c.evidence || {};
  const a = c.ai_analysis;
  const docMode = !c.kuB;
  const opts = docMode
    ? [['follow_doc', '규정 우선: A 대체', '규정·지침이 맞습니다. 보직 지식 A를 대체합니다.'], ['keep_ku', '예외로 유지', '지휘관 지시 등 근거가 있어 A를 유지합니다. 근거를 기록하세요.'], ['dismiss', '충돌 아님', '실제로는 어긋나지 않습니다. 사유를 기록하세요.']]
    : [['keep_b', 'B 유지, A 대체', 'B가 현행 방식입니다.'], ['keep_a', 'A 유지, B 대체', 'A가 현행 방식입니다.'], ['both_valid', '둘 다 유지', '적용 조건이 다릅니다. 조건을 기록하세요.'], ['dismiss', '충돌 아님', '실제로는 어긋나지 않습니다.']];
  return `
  <div class="card">
    <div class="card-h"><span class="badge ${SEV[c.severity][1]}">${SEV[c.severity][0]}</span><h3>${esc(c.title)}</h3><div class="right">${badge(STATUS[c.status])}</div></div>
    <div class="card-b">
      <div class="row wrap small" style="margin-bottom:10px"><span>${c.rule_code} ${esc(c.rule?.name || '')}</span><span class="muted">${esc(c.rule?.desc || '')}</span><span class="muted" style="margin-left:auto">${fmtDate(c.created_at, true)}</span></div>
      <p style="margin:0 0 14px">${esc(c.description)}</p>
      <div class="versus">
        ${c.kuA ? kuCard(c.kuA, 'a', ev.field || '', ev.a || '') : ''}
        <div class="vs-mid">비교</div>
        ${c.kuB ? kuCard(c.kuB, 'b', ev.field || '', ev.b || '') : c.chunk ? `<div class="kucard doc"><div class="row"><b>상위 문서</b><span class="badge b-amber">${esc(c.chunk.version || '')}</span></div>
          <div class="xs muted" style="margin-top:2px">「${esc(c.chunk.title)}」 · ${esc(c.chunk.issuer || '')}</div>
          <div class="hl">${esc(ev.field || '')}: ${esc(ev.b || '')}</div><div class="small"><b>${esc(c.chunk.heading)}</b><br>${esc(c.chunk.text)}</div>
          <a class="btn xs" style="margin-top:8px" href="#/docs/${esc(c.chunk.doc_id)}">문서 열기</a></div>`
          : `<div class="kucard doc"><b>근거</b><div class="hl">${esc(ev.field || '')}: ${esc(ev.b || '')}</div></div>`}
      </div>
    </div>
  </div>

  <div class="ai-box" style="margin-top:16px">
    <h4>AI 분석 <span class="eng xs muted" style="font-weight:500">${a ? (a.engine === 'llm' ? 'gpt-6-luna' : '내장 분석') : ''}</span>
      <button class="btn xs" id="reAnalyze" style="margin-left:auto">다시 분석</button></h4>
    ${a ? `<dl><dt>요약</dt><dd>${esc(a.summary)}</dd><dt>충돌 원인</dt><dd>${esc(a.why)}</dd><dt>승계 위험</dt><dd>${esc(a.risk)}</dd><dt>권고</dt><dd>${esc(a.suggestion)}</dd>
      <dt>재검토 질문</dt><dd><ol style="margin:0;padding-left:18px">${(a.questions || []).map((q) => `<li>${esc(q)}</li>`).join('')}</ol></dd></dl>` : '<p class="muted small">분석 결과가 없습니다.</p>'}
  </div>

  <div class="card" style="margin-top:16px">
    <div class="card-h"><h3>처리</h3><span class="sub">결정은 양쪽 지식의 이력에 남습니다</span></div>
    <div class="card-b">
    ${c.status === 'open' ? (canApprove ? `
      <form id="resolveForm" class="col" style="gap:10px">
        <div class="resolve-opts">${opts.map(([v, l, d], i) => `<label class="ropt"><input type="radio" name="resolution" value="${v}" ${i === 0 ? 'checked' : ''}><div><b>${l}</b><span>${d}</span></div></label>`).join('')}</div>
        <div class="field"><label>근거</label><textarea class="textarea" name="note" rows="2" placeholder="판단 근거를 적어 주세요"></textarea></div>
        <div class="row"><span class="muted xs">카드의 [개정]으로 새 버전을 승인해도 이 충돌이 종결됩니다.</span><button class="btn primary" style="margin-left:auto">반영</button></div>
      </form>` : '<div class="muted">승인 권한이 있는 보직만 처리할 수 있습니다.</div>')
    : `<div class="precheck ok"><b>${c.status === 'dismissed' ? '충돌 아님으로 처리' : '해결됨'}</b>${c.resolution_note ? `: ${esc(c.resolution_note)}` : ''}<div class="xs" style="margin-top:4px">${person(c.resolver)} · ${fmtDate(c.resolved_at, true)}</div></div>`}
    </div>
  </div>`;
}
