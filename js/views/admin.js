// 접근통제·감사: 부대/보직/사용자 권한 구조, 권한 위임, 접근 기록 (체계관리자 전용 — 업무 지식 열람 불가)
import { api, esc, toast, fmtDate, icon } from '../util.js?v=53868ba833';

const ACT = { handover: '보직자 교대', holder_incoming: '인수자 등록', login: '로그인', switch_position: '보직 공간 전환', ask: '질문(검색)', learn_propose: '학습 제안', learn_approve: '지식 승인', conflict_resolve: '충돌 해결', doc_read: '문서 열람', doc_create: '문서 등록', grant: '권한 부여', revoke: '권한 회수', admin: '관리 기능' };

export async function render(root, app) {
  if (app.me.user.role !== 'admin') {
    root.innerHTML = '<div class="card card-b empty">체계관리자만 접근할 수 있습니다.</div>';
    return;
  }
  const d = await api('/api/admin/overview');
  const denied = d.logs.filter((l) => !l.allowed).length;
  root.innerHTML = `
  <div class="page-head">
    <div><h1>접근 관리</h1><p>보직 계정과 권한 위임을 관리합니다. 체계관리자는 보직 업무 지식을 열람할 수 없습니다.</p></div>
    <div class="actions"><button class="btn danger" id="reset">${icon('refresh')} 시연 데이터 초기화</button></div>
  </div>
  <div class="grid g4" style="margin-bottom:16px">
    <div class="card kpi"><div class="l">부대</div><div class="v">${d.units.length}</div><div class="d">사단 › 연대 › 대대 계통</div></div>
    <div class="card kpi"><div class="l">보직 계정</div><div class="v">${d.positions.length}</div><div class="d">사람이 아닌 보직(자리)에 발급 · 보직 하나당 하나의 AI</div></div>
    <div class="card kpi"><div class="l">보직자 이력</div><div class="v">${d.holders.length}</div><div class="d">현 보직자 ${d.holders.filter((u) => u.status === 'current').length} · 인수자 ${d.holders.filter((u) => u.status === 'incoming').length} · 역대 ${d.holders.filter((u) => u.status === 'former').length}</div></div>
    <div class="card kpi ${denied ? 'alert' : ''}"><div class="l">접근 차단 기록</div><div class="v">${denied}</div><div class="d">최근 ${d.logs.length}건 중</div></div>
  </div>
  <div class="grid g2" style="margin-bottom:16px">
    <div class="card"><div class="card-h"><h3>보직 계정</h3></div>
      <table class="table"><thead><tr><th>보직</th><th>계정 ID</th><th>현 보직자</th><th>유효 지식</th></tr></thead><tbody>
      ${d.positions.map((p) => `<tr><td><b>${esc(p.name)}</b><div class="xs muted">${esc(p.unit_name)}</div></td><td class="small">${esc(p.login_id || '-')}</td><td class="small">${esc(p.holder || '공석')}</td><td>${p.kus}</td></tr>`).join('')}</tbody></table></div>
    <div class="card"><div class="card-h"><h3>권한 위임</h3><span class="sub">기본 권한은 자기 보직에 한정</span></div>
      <table class="table"><thead><tr><th>위임받는 보직</th><th>대상 보직</th><th>권한</th><th></th></tr></thead><tbody>
      ${d.grants.map((g) => `<tr><td class="small">${esc(g.grantee)}</td><td class="small">${esc(g.position || g.scope_id)}</td><td><span class="badge b-blue">${{ read: '열람', write: '등록', approve: '승인' }[g.permission]}</span></td><td><button class="btn xs danger" data-revoke="${g.id}">회수</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted small">위임 없음</td></tr>'}
      </tbody></table>
      <form class="card-b row wrap" id="gform" style="border-top:1px solid var(--line)">
        <select class="select" name="grantee" style="flex:1;min-width:160px">${d.positions.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
        <select class="select" name="position_id" style="flex:1;min-width:160px">${d.positions.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
        <select class="select" name="permission" style="width:90px"><option value="read">열람</option><option value="write">등록</option><option value="approve">승인</option></select>
        <button class="btn primary">부여</button>
      </form></div>
  </div>
  <div class="card" style="margin-bottom:16px"><div class="card-h"><h3>보직자 이력</h3></div>
    <table class="table"><thead><tr><th>보직</th><th>보직자</th><th>상태</th><th>재직 기간</th></tr></thead><tbody>
    ${d.holders.map((u) => `<tr><td class="small">${esc(u.position || '-')}</td><td><b>${esc(u.rank)} ${esc(u.name)}</b></td><td>${{ current: '<span class="badge b-green">현 보직자</span>', incoming: '<span class="badge b-blue">인수자</span>', former: '<span class="badge b-gray">역대 보직자</span>' }[u.status]}</td><td class="small">${fmtDate(u.tenure_start)} ~ ${u.tenure_end && u.status === 'former' ? fmtDate(u.tenure_end) : ''}</td></tr>`).join('')}
    </tbody></table></div>
  <div class="card"><div class="card-h"><h3>접근 기록</h3></div>
    <div style="max-height:420px;overflow:auto"><table class="table"><thead><tr><th style="width:150px">일시</th><th style="width:200px">보직 계정 (당시 보직자)</th><th style="width:120px">행위</th><th>대상</th><th style="width:80px">결과</th><th>상세</th></tr></thead><tbody>
    ${d.logs.map((l) => `<tr><td class="small">${fmtDate(l.at, true)}</td><td class="small">${esc(l.seat || '-')}${l.name ? `<div class="muted">${esc(l.rank)} ${esc(l.name)}</div>` : ''}</td><td class="small">${ACT[l.action] || esc(l.action)}</td><td class="small">${esc(l.target || '')}</td><td>${l.allowed ? '<span class="badge b-green">허용</span>' : '<span class="badge b-red">차단</span>'}</td><td class="small">${esc(l.detail || '')}</td></tr>`).join('')}
    </tbody></table></div></div>`;

  root.querySelector('#gform').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/api/admin/grants', { body: Object.fromEntries(new FormData(e.target)) }); toast('권한을 부여했습니다', 'ok'); render(root, app); } catch (err) { toast(err.message, 'err'); }
  };
  root.querySelectorAll('[data-revoke]').forEach((b) => b.onclick = async () => {
    try { await api(`/api/admin/grants/${b.dataset.revoke}`, { method: 'DELETE' }); toast('권한을 회수했습니다'); render(root, app); } catch (err) { toast(err.message, 'err'); }
  });
  root.querySelector('#reset').onclick = async () => {
    if (!confirm('모든 데이터를 시연 초기 상태로 되돌립니다. 계속할까요?')) return;
    await api('/api/admin/reset-demo', { method: 'POST' });
    location.hash = '#/login';
    location.reload();
  };
}
