// 공통 유틸: API, DOM, 마크다운, 포맷
export async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: opts.body ? { 'content-type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  let data = null;
  try { data = await res.json(); } catch { /* 빈 응답 */ }
  if (res.status === 401 && !path.includes('/login')) {
    location.hash = '#/login';
    throw new Error('로그인이 필요합니다');
  }
  if (!res.ok) throw new Error(data?.error || `요청 실패 (${res.status})`);
  return data;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), kind === 'err' ? 5000 : 3200);
}

export function modal({ title, body, footer = '', size = '' }) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${size}"><div class="modal-h"><h3>${title}</h3><button class="btn ghost sm" data-close style="margin-left:auto">${icon('x')}</button></div>
    <div class="modal-b">${body}</div>${footer ? `<div class="modal-f">${footer}</div>` : ''}</div>`;
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(bg);
  return { el: bg, close };
}

export function fmtDate(s, withTime = false) {
  if (!s) return '-';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}${withTime ? ` ${p(d.getHours())}:${p(d.getMinutes())}` : ''}`;
}
export function ago(s) {
  const diff = (Date.now() - new Date(s).getTime()) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}일 전`;
  return fmtDate(s);
}
export function dday(s) {
  if (!s) return '';
  const d = Math.ceil((new Date(s) - new Date(new Date().toDateString())) / 86400000);
  return d >= 0 ? `D-${d}` : `D+${-d}`;
}

export const CYCLE = { daily: '매일', weekly: '매주', biweekly: '격주', monthly: '매월', quarterly: '분기', semiannual: '반기', annual: '연간', seasonal: '계절', adhoc: '수시', unknown: '미상' };
export const SEV = { high: ['높음', 'b-red'], medium: ['보통', 'b-amber'], low: ['낮음', 'b-gray'] };
export const STATUS = { active: ['유효', 'b-green'], superseded: ['대체됨', 'b-gray'], draft: ['초안', 'b-blue'], rejected: ['반려', 'b-red'], open: ['미해결', 'b-red'], resolved: ['해결', 'b-green'], dismissed: ['충돌 아님', 'b-gray'] };
export const STATUS_HOLDER = { current: '현 보직자', incoming: '인수자', former: '역대 보직자' };
export const ACTION = { proposed: ['AI 구조화', '#2457c5'], edited: ['수정', '#5b4bb7'], approved: ['승인', '#217346'], rejected: ['반려', '#c02a2a'], superseded: ['대체됨', '#6b7280'], conflict_resolved: ['충돌 처리', '#9a5b0b'] };
export const badge = (pair) => `<span class="badge ${pair[1]}">${pair[0]}</span>`;
export const person = (u) => (u ? `${esc(u.rank || '')} ${esc(u.name)}` : '-');

/** 경량 마크다운 (굵게, 코드, 목록, 인용, 문단) + 인용번호 [n] → 칩 */
export function md(src = '') {
  const lines = String(src).replace(/\r/g, '').split('\n');
  let html = '';
  let list = null;
  const inline = (t) => esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[(\d{1,2})\](?!\()/g, '<span class="cite" data-cite="$1">$1</span>');
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  let quote = [];
  const flushQuote = () => { if (quote.length) { html += `<blockquote>${quote.map(inline).join('<br>')}</blockquote>`; quote = []; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^>\s?/.test(line)) { close(); quote.push(line.replace(/^>\s?/, '')); continue; }
    flushQuote();
    let m;
    if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)$/))) {
      if (list !== 'ol') { close(); html += `<ol start="${m[1]}">`; list = 'ol'; }
      html += `<li>${inline(m[2])}</li>`;
    } else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
      if (list !== 'ul') { close(); html += '<ul>'; list = 'ul'; }
      html += `<li>${inline(m[1])}</li>`;
    } else if ((m = line.match(/^#{1,4}\s+(.*)$/))) {
      close(); html += `<p><b>${inline(m[1])}</b></p>`;
    } else if (!line.trim()) {
      close();
    } else {
      close(); html += `<p>${inline(line)}</p>`;
    }
  }
  flushQuote(); close();
  return html;
}

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  learn: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  ask: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  conflict: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  graph: '<circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M7.2 7.2 10.5 16M16.8 7.2 13.5 16M7.5 6h9"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  thumb: '<path d="M7 10v12M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.4 22H7V10l4-8a3 3 0 0 1 3 3.9z"/>',
};
export const icon = (name, attrs = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${attrs}>${ICONS[name] || ''}</svg>`;

