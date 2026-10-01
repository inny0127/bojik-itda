// 지식 목록·이력: 업무별 지식단위(여러 세대), 버전·대체 관계, 생성·수정·승인 이력 추적
import { api, esc, modal, fmtDate, CYCLE, STATUS, ACTION, SEV, badge, person, icon, toast } from '../util.js?v=beb39f2588';

let tab = 'list';

export async function render(root, app, arg) {
  const [kus, hist] = await Promise.all([api('/api/knowledge'), api('/api/history')]);
  const groups = new Map();
  for (const k of kus) {
    const key = k.task_key;
    if (!groups.has(key)) groups.set(key, { name: k.structure.task?.name || k.title, list: [] });
    groups.get(key).list.push(k);
  }
  const order = { active: 0, draft: 1, superseded: 2, rejected: 3 };
  root.innerHTML = `
  <div class="page-head">
    <div><h1>지식 목록</h1><p>역대 보직자가 등록한 지식과 변경 이력입니다.</p></div>
    <div class="actions"><div class="seg" id="tabs"><button data-t="list">업무별 지식</button><button data-t="hist">변경 이력 (${hist.length})</button></div></div>
  </div>
  <div id="body"></div>`;

  const draw = () => {
    root.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.t === tab));
    const body = root.querySelector('#body');
    if (tab === 'list') {
      body.innerHTML = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko')).map((g) => {
        const act = g.list.filter((k) => k.status === 'active');
        const cyc = act[0]?.structure.task;
        return `<div class="card ku-task"><div class="h"><h3>${esc(g.name)}</h3>
          ${cyc ? `<span class="badge b-blue">${esc(cyc.cycle_detail || CYCLE[cyc.cycle_type] || '')}</span>` : ''}
          <span class="muted small">유효 ${act.length} · 전체 ${g.list.length}</span>
          ${g.list.some((k) => k.openConflicts) ? '<span class="badge b-red">충돌</span>' : ''}</div>
          ${g.list.sort((a, b) => order[a.status] - order[b.status] || (b.approved_at || b.created_at || '').localeCompare(a.approved_at || a.created_at || '')).map((k) => `
          <div class="ku-line ${k.status}" data-ku="${esc(k.id)}">
            <span>${badge(STATUS[k.status])} <span class="mono xs muted">v${k.version}</span></span>
            <span><b>${esc(k.structure.task?.summary || k.title)}</b><span class="muted xs"> · ${esc(k.id)}${k.supersedes ? ` · ${esc(k.supersedes)} 대체` : ''}</span>${k.openConflicts ? ` <span class="badge b-red">충돌 ${k.openConflicts}</span>` : ''}</span>
            <span class="small">${esc(k.author_rank || '')} ${esc(k.author_name || '')}</span>
            <span class="small muted">${k.approved_at ? `승인 ${fmtDate(k.approved_at)}` : `작성 ${fmtDate(k.created_at)}`}</span>
            <span class="small muted">절차 ${k.structure.steps?.length || 0} · 주의 ${k.structure.cautions?.length || 0} · 예외 ${k.structure.exceptions?.length || 0}</span>
          </div>`).join('')}</div>`;
      }).join('') || '<div class="card empty">지식이 없습니다.</div>';
    } else {
      body.innerHTML = `<div class="card"><table class="table"><thead><tr><th style="width:150px">일시</th><th style="width:120px">행위</th><th>지식</th><th style="width:130px">수행자</th><th>내용</th></tr></thead><tbody>
        ${hist.map((h) => { const a = ACTION[h.action] || [h.action, '#64748b']; return `<tr data-ku="${esc(h.ku_id)}" style="cursor:pointer"><td class="small">${fmtDate(h.at, true)}</td><td><span class="badge" style="background:${a[1]}1a;color:${a[1]}">${a[0]}</span></td>
          <td><b class="small">${esc(h.title)}</b><div class="xs muted mono">${esc(h.ku_id)} v${h.version}</div></td><td class="small">${person(h.actor)}</td>
          <td class="small">${esc(h.note || '')}${h.diff?.length ? `<div class="diff">${h.diff.slice(0, 3).map((d) => `${esc(d.field)}: ${d.from ? `<span class="from">${esc(d.from)}</span> ` : ''}${d.to ? `<span class="to">${esc(d.to)}</span>` : ''}`).join('<br>')}${h.diff.length > 3 ? `<br>외 ${h.diff.length - 3}건` : ''}</div>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div>`;
    }
    body.querySelectorAll('[data-ku]').forEach((el) => el.onclick = () => openKU(el.dataset.ku, app));
  };
  root.querySelector('#tabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; draw(); } };
  draw();
  if (arg) openKU(arg, app);
}

export async function openKU(id, app) {
  let k;
  try { k = await api(`/api/ku/${encodeURIComponent(id)}`); } catch (e) { toast(e.message, 'err'); return; }
  const s = k.structure;
  const canWrite = app.me.active?.perms.includes('write');
  const m = modal({
    title: `${esc(s.task?.name || k.title)} <span class="mono xs muted">${esc(k.id)} · v${k.version}</span> ${badge(STATUS[k.status])}`,
    body: `<div class="grid" style="grid-template-columns: 1.3fr 1fr">
      <div class="struct-view">
        <dl class="kv"><dt>요약</dt><dd>${esc(s.task?.summary || '')}</dd><dt>주기</dt><dd>${esc(s.task?.cycle_detail || CYCLE[s.task?.cycle_type] || '')} <span class="badge b-blue">${CYCLE[s.task?.cycle_type] || ''}</span></dd>
          <dt>기한</dt><dd>${esc(s.task?.deadline || '-')}</dd><dt>담당</dt><dd>${esc(s.task?.owner || '-')}</dd><dt>결재</dt><dd>${esc(s.task?.approver || '-')}</dd>
          <dt>작성</dt><dd>${person(k.author)} · ${fmtDate(k.created_at, true)}</dd><dt>승인</dt><dd>${k.approver ? `${person(k.approver)} · ${fmtDate(k.approved_at, true)}` : '-'}</dd>
          ${k.supersedes ? `<dt>대체 대상</dt><dd><a href="#/knowledge/${esc(k.supersedes)}" data-close>${esc(k.supersedes)}</a></dd>` : ''}
          ${k.superseded_by ? `<dt>대체됨</dt><dd><a href="#/knowledge/${esc(k.superseded_by.id)}" data-close>${esc(k.superseded_by.id)}</a> (v${k.superseded_by.version})</dd>` : ''}</dl>
        ${s.steps?.length ? `<h5>절차</h5><ol>${s.steps.map((x) => `<li>${esc(x.action)}${x.system ? ` <code>${esc(x.system)}</code>` : ''}${x.output ? ` → ${esc(x.output)}` : ''}</li>`).join('')}</ol>` : ''}
        ${s.cautions?.length ? `<h5>주의사항</h5><ul>${s.cautions.map((x) => `<li>${badge(SEV[x.severity])} ${esc(x.text)}</li>`).join('')}</ul>` : ''}
        ${s.exceptions?.length ? `<h5>예외상황</h5><ul>${s.exceptions.map((x) => `<li><b>${esc(x.condition)}</b> → ${esc(x.action)}</li>`).join('')}</ul>` : ''}
        ${s.systems?.length ? `<h5>사용 체계</h5><ul>${s.systems.map((x) => `<li>${esc(x.name)}${x.usage ? `: ${esc(x.usage)}` : ''}</li>`).join('')}</ul>` : ''}
        ${s.rules?.length ? `<h5>근거</h5><ul>${s.rules.map((x) => `<li>${esc(x.title)} ${esc(x.ref)}</li>`).join('')}</ul>` : ''}
        ${s.relations?.length ? `<h5>선후행</h5><ul>${s.relations.map((x) => `<li>${x.type === 'FOLLOWS' ? `${esc(x.task)} → 이 업무` : `이 업무 → ${esc(x.task)}`}</li>`).join('')}</ul>` : ''}
        ${k.raw_text ? `<h5>원문 입력 (자연어)</h5><div class="raw-box">${esc(k.raw_text)}</div>` : ''}
      </div>
      <div>
        <h5 style="font-size:12px;color:var(--muted);margin:0 0 8px">이력 (출처·변경 추적)</h5>
        <div class="timeline">${k.history.map((h) => { const a = ACTION[h.action] || [h.action, '#64748b']; return `<div class="tl"><span class="dot" style="background:${a[1]}"></span><div><div class="t"><b>${a[0]}</b></div><div class="m">${person(h.actor)} · ${fmtDate(h.at, true)}</div>${h.note ? `<div class="small">${esc(h.note)}</div>` : ''}
          ${h.diff?.length ? `<div class="diff">${h.diff.map((d) => `${esc(d.field)}: ${d.from ? `<span class="from">${esc(d.from)}</span> ` : ''}${d.to ? `<span class="to">${esc(d.to)}</span>` : ''}`).join('<br>')}</div>` : ''}</div></div>`; }).join('')}</div>
        ${k.conflicts?.length ? `<h5 style="font-size:12px;color:var(--muted);margin:12px 0 6px">관련 충돌</h5>${k.conflicts.map((c) => `<a class="row small" style="padding:3px 0" href="#/conflicts/${esc(c.id)}" data-close>${badge(STATUS[c.status])} ${esc(c.title)}</a>`).join('')}` : ''}
      </div></div>`,
    footer: `${k.status === 'active' && canWrite ? `<button class="btn" id="kuRevise">${icon('learn')} 개정본 작성</button>` : ''}${k.status === 'draft' ? `<a class="btn primary" href="#/learn/${esc(k.id)}" data-close>학습 화면에서 편집</a>` : ''}<button class="btn" data-close>닫기</button>`,
  });
  const rv = m.el.querySelector('#kuRevise');
  if (rv) rv.onclick = async () => {
    try { const d = await api(`/api/ku/${k.id}/revise`, { method: 'POST' }); m.close(); location.hash = `#/learn/${d.id}`; } catch (e) { toast(e.message, 'err'); }
  };
}
