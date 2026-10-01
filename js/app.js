// 보직잇다 SPA 셸: 인증, 라우팅, 보직 공간 전환
import { api, esc, $, icon, toast, dday } from './util.js?v=c03d6b5395';
import * as login from './views/login.js?v=c03d6b5395';
import * as dashboard from './views/dashboard.js?v=c03d6b5395';
import * as learn from './views/learn.js?v=c03d6b5395';
import * as ask from './views/ask.js?v=c03d6b5395';
import * as conflicts from './views/conflicts.js?v=c03d6b5395';
import * as graph from './views/graph.js?v=c03d6b5395';
import * as knowledge from './views/knowledge.js?v=c03d6b5395';
import * as docs from './views/docs.js?v=c03d6b5395';
import * as admin from './views/admin.js?v=c03d6b5395';
import * as system from './views/system.js?v=c03d6b5395';

const ROUTES = {
  dashboard: { view: dashboard, label: '대시보드', icon: 'home' },
  learn: { view: learn, label: '학습', icon: 'learn' },
  ask: { view: ask, label: '질문', icon: 'ask' },
  conflicts: { view: conflicts, label: '충돌', icon: 'conflict' },
  graph: { view: graph, label: '지식그래프', icon: 'graph' },
  knowledge: { view: knowledge, label: '지식 목록', icon: 'history' },
  docs: { view: docs, label: '규정·문서', icon: 'doc' },
  admin: { view: admin, label: '접근 관리', icon: 'shield' },
  system: { view: system, label: '시스템 구성', icon: 'cpu' },
};

const state = { me: null };
export const app = {
  get me() { return state.me; },
  async refreshMe() {
    state.me = await api('/api/me');
    renderChrome();
    return state.me;
  },
  go(path) { location.hash = `#/${path}`; },
};

function parseHash() {
  const [route, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  return { route: route || 'dashboard', arg: rest.join('/') ? decodeURIComponent(rest.join('/')) : null };
}

function shell() {
  const root = $('#app');
  root.innerHTML = `
  <div class="shell">
    <aside class="sidebar">
      <div class="brand"><div class="brand-name">보직잇다</div></div>
      <nav class="nav" id="nav"></nav>
      <button class="nav-more" id="navMore" type="button" aria-label="메뉴 더보기">${icon('list')}<span>더보기</span></button>
      <div class="nav-foot" id="navfoot"></div>
    </aside>
    <div class="main">
      <header class="topbar">
        <div class="m-brand">보직잇다</div>
        <div class="pos-switch"><label for="posSel">보직</label><select id="posSel"></select></div>
        <span id="llmChip"></span>
        <div class="spacer"></div>
        <div class="userbox" id="userbox"></div>
        <button class="btn ghost sm" id="logout" title="로그아웃">${icon('logout')}</button>
      </header>
      <main class="content" id="view"></main>
    </div>
    <div class="m-sheet-bg" id="mSheetBg"></div>
    <div class="m-sheet" id="mSheet"></div>
  </div>`;
  $('#logout').onclick = async () => { await api('/api/logout', { method: 'POST' }); state.me = null; location.hash = '#/login'; };
  // 휴대폰: 아래 탭 막대의 '더보기'로 나머지 메뉴·보직 정보를 엶 (데스크톱에서는 이 요소들이 보이지 않음)
  $('#navMore').onclick = () => $('.shell').classList.toggle('m-open');
  $('#mSheetBg').onclick = closeSheet;
  $('#mSheet').onclick = (e) => { if (e.target.closest('a')) closeSheet(); };
  $('#posSel').onchange = async (e) => {
    try {
      await api('/api/me/position', { body: { positionId: e.target.value } });
      await app.refreshMe();
      toast(`'${e.target.selectedOptions[0].textContent}' 지식 공간으로 전환했습니다`);
      route();
    } catch (err) { toast(err.message, 'err'); }
  };
}

const closeSheet = () => $('.shell')?.classList.remove('m-open');

function renderChrome() {
  const me = state.me;
  if (!me || !$('#nav')) return;
  const { route: cur } = parseHash();
  const isAdmin = me.user.role === 'admin';
  const items = Object.entries(ROUTES).filter(([k]) => (isAdmin ? ['admin', 'system'].includes(k) : k !== 'admin'));
  // 휴대폰 아래 탭 막대에는 앞 4개 메뉴만, 나머지는 '더보기'에 (m-sec)
  const ORDER = ['dashboard', 'learn', 'ask', 'conflicts', 'graph', 'knowledge', 'docs', 'admin', 'system'];
  const secondary = ORDER.filter((k) => items.some(([x]) => x === k)).slice(4);
  const link = ([k, r]) => {
    const count = k === 'conflicts' && me.openConflicts ? `<span class="count">${me.openConflicts}</span>` : k === 'learn' && me.drafts ? `<span class="count soft">${me.drafts}</span>` : '';
    return `<a href="#/${k}" class="${[cur === k ? 'active' : '', secondary.includes(k) ? 'm-sec' : ''].filter(Boolean).join(' ')}">${icon(r.icon)}<span>${r.label}</span>${count}</a>`;
  };
  const section = (label, keys) => {
    const list = items.filter(([k]) => keys.includes(k));
    if (!list.length) return '';
    return (label ? `<div class="nav-sec">${label}</div>` : '') + list.map(link).join('');
  };
  $('#nav').innerHTML = section('', ['dashboard']) + section('업무', ['learn', 'ask', 'conflicts']) + section('지식', ['graph', 'knowledge', 'docs']) + section('관리', ['admin', 'system']);
  $('#navMore').classList.toggle('none', !secondary.length);
  $('#navMore').classList.toggle('on', secondary.includes(cur));
  $('#navfoot').innerHTML = (me.active
    ? `<b>${esc(me.active.name)}</b><br>${esc((me.active.units || []).slice().reverse().join(' › '))}<br>권한: ${me.active.perms.map((p) => ({ read: '열람', write: '등록', approve: '승인' }[p])).join(', ')}`
    : '업무 지식 열람 권한 없음') + '<div style="margin-top:8px">시연용 가상 데이터</div>';
  const sel = $('#posSel');
  sel.innerHTML = me.positions.length
    ? me.positions.map((p) => `<option value="${p.id}" ${me.active?.id === p.id ? 'selected' : ''}>${esc(p.name)}${p.id !== me.user.position_id ? ' (위임 권한)' : ''}</option>`).join('')
    : '<option>접근 가능한 보직 없음</option>';
  sel.disabled = me.positions.length <= 1;
  $('#llmChip').innerHTML = me.llm.mode === 'llm'
    ? `<span class="chip" title="${esc(me.llm.model)}"><span class="dot"></span>LLM 연결됨</span>`
    : '<span class="chip" title="외부 API 없이 내장 엔진으로 동작합니다"><span class="dot"></span>내장 엔진</span>';
  const u = me.user;
  const h = u.holder;
  const conscript = h && /(이병|일병|상병|병장)/.test(h.rank);
  $('#userbox').innerHTML = `<div><div class="nm">${esc(u.seat_name)}</div><div class="rl">${h ? `${esc(h.rank)} ${esc(h.name)}${conscript && h.tenure_end ? ` (전역 ${dday(h.tenure_end)})` : ''}` : '보직자 없음'}${u.incoming ? ` · 인수 예정 ${esc(u.incoming.rank)} ${esc(u.incoming.name)}` : ''}</div></div>`;
  $('#mSheet').innerHTML = `${secondary.length ? `<div class="m-links">${items.filter(([k]) => secondary.includes(k)).map(([k, r]) => `<a href="#/${k}" class="${cur === k ? 'active' : ''}">${icon(r.icon)}<span>${r.label}</span></a>`).join('')}</div>` : ''}
    <div class="m-info">${$('#userbox').innerHTML}
      ${me.active ? `<div class="xs muted">${esc((me.active.units || []).slice().reverse().join(' › '))}<br>권한: ${me.active.perms.map((p) => ({ read: '열람', write: '등록', approve: '승인' }[p])).join(', ')}</div>` : ''}
      <div class="xs muted" style="margin-top:6px">시연용 가상 데이터</div></div>`;
}

let currentCleanup = null;
async function route() {
  const { route: r, arg } = parseHash();
  document.querySelectorAll('.modal-bg').forEach((m) => m.remove());
  if (currentCleanup) { try { currentCleanup(); } catch { /* noop */ } currentCleanup = null; }
  closeSheet();
  if (r === 'login') {
    state.me = null;
    login.render($('#app'), app);
    return;
  }
  if (!state.me) {
    try { await app.refreshMe(); } catch { location.hash = '#/login'; return; }
  }
  if (!$('#nav')) { shell(); renderChrome(); }
  let def = ROUTES[r];
  if (!def || (state.me.user.role === 'admin' && !['admin', 'system'].includes(r))) {
    location.hash = state.me.user.role === 'admin' ? '#/admin' : '#/dashboard';
    return;
  }
  renderChrome();
  // 화면마다 새 컨테이너: 이전 화면의 늦게 끝난 비동기 작업(데이터 불러오기·폴링)이 새 화면을 덮어쓰지 않고
  // 화면에서 떨어진 이전 컨테이너에만 반영되도록 함
  const main = $('#view');
  const view = document.createElement('div');
  view.className = 'view-root';
  main.replaceChildren(view);
  view.innerHTML = '<div class="row muted"><span class="spinner dark"></span> 불러오는 중…</div>';
  main.scrollTop = 0;
  if (window.scrollY) window.scrollTo(0, 0); // 휴대폰은 화면 전체가 스크롤됨
  try {
    const cleanup = (await def.view.render(view, app, arg)) || null;
    if (view.isConnected) currentCleanup = cleanup;
    else if (cleanup) { try { cleanup(); } catch { /* noop */ } } // 그사이 다른 화면으로 이동했으면 바로 정리
  } catch (e) {
    view.innerHTML = `<div class="card card-b"><b>화면을 불러오지 못했습니다.</b><p class="muted">${esc(e.message)}</p></div>`;
  }
}

window.addEventListener('hashchange', () => {
  if (parseHash().route !== 'login' && !$('#nav') && state.me) shell();
  route();
});
if (!location.hash) location.hash = '#/dashboard';
route();
