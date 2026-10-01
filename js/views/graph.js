// 지식그래프 탐색: 힘-방향 레이아웃(SVG), 유형 필터, 검색, 노드 상세·출처 추적
import { api, esc, fmtDate, icon, CYCLE } from '../util.js?v=41a5f785c8';

export async function render(root, app) {
  const g = await api('/api/graph');
  const types = g.nodeTypes;
  // 처음에는 업무·체계·규정·주의 중심으로 보여 주고(절차는 노드 상세·유형 버튼으로 펼침) 화면에 맞춰 확대
  const hidden = new Set(['KnowledgeUnit', 'Person', 'ProcedureStep']);
  const counts = {};
  g.nodes.forEach((n) => { counts[n.type] = (counts[n.type] || 0) + 1; });

  root.innerHTML = `
  <div class="page-head">
    <div><h1>지식그래프</h1>
    <p>${esc(app.me.active?.name || '')}의 업무·절차·체계·규정 관계입니다. 각 관계에 출처가 기록됩니다.</p></div>
    <div class="actions"><span class="badge b-gray">노드 ${g.nodes.length}</span><span class="badge b-gray">관계 ${g.edges.length}</span></div>
  </div>
  <div class="graph-wrap">
    <div class="card card-b col" style="gap:10px;overflow:auto">
      <div class="field"><label>노드 검색</label><input class="input" id="gq" placeholder="예: DTIS, 배차"></div>
      <div><div class="small muted" style="margin:4px 0">유형 (눌러서 표시/숨김)</div>
        ${Object.entries(types).filter(([t]) => counts[t]).map(([t, v]) => `<div class="legend-item ${hidden.has(t) ? 'off' : ''}" data-t="${t}"><span class="sw" style="background:${v.color}"></span>${v.label}<span class="c">${counts[t]}</span></div>`).join('')}
      </div>
      <div class="sep" style="margin:4px 0"></div>
      <div class="xs muted"><span style="color:var(--red)">- - -</span> 미해결 충돌</div>
    </div>
    <div class="card graph-canvas"><svg id="gsvg"></svg><div class="hint">드래그로 이동, 휠로 확대·축소 · <a href="#" id="gfit">전체 보기</a></div></div>
    <div class="card" style="overflow:auto"><div class="card-h"><h3>노드 상세</h3></div><div class="card-b" id="ginfo"><div class="muted small">노드를 선택하세요.</div></div></div>
  </div>`;

  const svg = root.querySelector('#gsvg');
  const W = svg.clientWidth || 800, H = svg.clientHeight || 600;
  const byId = new Map(g.nodes.map((n) => [n.id, { ...n, x: W / 2 + (Math.random() - 0.5) * W * 0.6, y: H / 2 + (Math.random() - 0.5) * H * 0.6, vx: 0, vy: 0 }]));
  const edges = g.edges.filter((e) => byId.has(e.src) && byId.has(e.dst));
  // Task 노드 초기 배치: 원형
  const tasks = [...byId.values()].filter((n) => n.type === 'Task');
  tasks.forEach((n, i) => { const a = (i / tasks.length) * Math.PI * 2; n.x = W / 2 + Math.cos(a) * W * 0.25; n.y = H / 2 + Math.sin(a) * H * 0.28; });
  const pos = [...byId.values()].find((n) => n.type === 'Position');
  if (pos) { pos.x = W / 2; pos.y = H / 2; }

  let view = { x: 0, y: 0, k: 1 };
  let selectedId = null;
  let query = '';
  const visible = (n) => !hidden.has(n.type);
  const LABELED = new Set(['Position', 'Unit', 'Task', 'System', 'Rule']);
  const R = (n) => (n.type === 'Position' ? 16 : n.type === 'Task' ? 12 : n.type === 'Unit' ? 11 : 7);

  svg.innerHTML = `<g id="vp"><g id="ge"></g><g id="gn"></g></g>`;
  const vp = svg.querySelector('#vp'), ge = svg.querySelector('#ge'), gn = svg.querySelector('#gn');

  function build() {
    const vis = new Set([...byId.values()].filter(visible).map((n) => n.id));
    const es = edges.filter((e) => vis.has(e.src) && vis.has(e.dst));
    ge.innerHTML = es.map((e, i) => `<line class="g-edge ${e.type === 'CONFLICTS_WITH' ? 'conf' : ''}" data-e="${i}" data-s="${esc(e.src)}" data-d="${esc(e.dst)}"/>`).join('');
    gn.innerHTML = [...byId.values()].filter(visible).map((n) => `<g class="g-node" data-id="${esc(n.id)}"><circle r="${R(n)}" fill="${types[n.type]?.color || '#999'}"/>
      <text dy="${R(n) + 12}" text-anchor="middle" class="${LABELED.has(n.type) ? '' : 'minor'}" ${n.type === 'Task' ? 'font-weight="700" font-size="12"' : ''}>${esc(n.label.length > 16 ? `${n.label.slice(0, 16)}…` : n.label)}</text></g>`).join('');
    edgeEls = [...ge.children].map((l) => [l, byId.get(l.dataset.s), byId.get(l.dataset.d)]);
    nodeEls = [...gn.children].map((el) => [el, byId.get(el.dataset.id)]);
    visNodes = nodeEls.map(([, n]) => n);
    return es;
  }
  let edgeEls = [], nodeEls = [], visNodes = [];
  let activeEdges = build();

  function tick(alpha) {
    const nodes = visNodes;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d2 = dx * dx + dy * dy || 1;
        if (d2 > 160000) continue;
        const f = (1500 / d2) * alpha;
        const d = Math.sqrt(d2);
        dx /= d; dy /= d;
        a.vx -= dx * f * 8; a.vy -= dy * f * 8; b.vx += dx * f * 8; b.vy += dy * f * 8;
      }
    }
    for (const e of activeEdges) {
      const a = byId.get(e.src), b = byId.get(e.dst);
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const target = a.type === 'Task' && b.type === 'Task' ? 190 : e.type === 'RESPONSIBLE_FOR' ? 220 : e.type === 'HAS_POSITION' ? 90 : 70;
      const f = ((d - target) / d) * 0.05 * alpha;
      a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
    }
    for (const n of nodes) {
      n.vx += (W / 2 - n.x) * 0.002 * alpha; n.vy += (H / 2 - n.y) * 0.002 * alpha;
      if (n.fixed) { n.vx = 0; n.vy = 0; continue; }
      n.x += n.vx; n.y += n.vy; n.vx *= 0.55; n.vy *= 0.55;
    }
  }
  function paint() {
    for (const [l, a, b] of edgeEls) { l.setAttribute('x1', a.x); l.setAttribute('y1', a.y); l.setAttribute('x2', b.x); l.setAttribute('y2', b.y); }
    for (const [el, n] of nodeEls) el.setAttribute('transform', `translate(${n.x},${n.y})`);
    vp.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`);
    svg.classList.toggle('zoomed', view.k > 1.5);
  }
  // 보이는 노드 전체가 화면에 들어오도록 확대·이동 (사용자가 직접 움직이기 전까지)
  let touched = false;
  function fit() {
    if (!visNodes.length) return;
    const xs = visNodes.map((n) => n.x), ys = visNodes.map((n) => n.y);
    const x0 = Math.min(...xs) - 40, x1 = Math.max(...xs) + 40, y0 = Math.min(...ys) - 30, y1 = Math.max(...ys) + 40;
    const k = Math.min(1.4, Math.max(0.3, Math.min(W / (x1 - x0), H / (y1 - y0))));
    view = { k, x: W / 2 - ((x0 + x1) / 2) * k, y: H / 2 - ((y0 + y1) / 2) * k };
  }
  let alpha = 1, raf;
  const run = () => { tick(alpha); if (!touched) fit(); paint(); alpha *= 0.96; if (alpha > 0.02) raf = requestAnimationFrame(run); };
  // 초기 배치는 화면에 그리기 전에 최대 약 0.25초만 계산하고 나머지는 짧은 애니메이션으로 마무리
  const tStart = performance.now();
  for (let i = 0; i < 160 && performance.now() - tStart < 250; i++) { tick(1); }
  alpha = 0.5;
  run();
  const reheat = (a = 0.5) => { alpha = Math.max(alpha, a); cancelAnimationFrame(raf); run(); };

  function highlight() {
    const neigh = new Set();
    if (selectedId) { neigh.add(selectedId); for (const e of activeEdges) { if (e.src === selectedId) neigh.add(e.dst); if (e.dst === selectedId) neigh.add(e.src); } }
    const q = query.trim().toLowerCase();
    gn.querySelectorAll('.g-node').forEach((el) => {
      const n = byId.get(el.dataset.id);
      const qm = q && n.label.toLowerCase().includes(q);
      el.classList.toggle('dim', (selectedId && !neigh.has(n.id)) || (q && !qm && !selectedId));
      el.classList.toggle('show-label', (selectedId && neigh.has(n.id)) || !!qm);
      el.querySelector('circle').setAttribute('stroke', n.id === selectedId || qm ? '#0f172a' : '#fff');
    });
    ge.querySelectorAll('line').forEach((l) => l.classList.toggle('dim', !!selectedId && l.dataset.s !== selectedId && l.dataset.d !== selectedId));
  }

  function info(id) {
    const n = byId.get(id);
    const out = activeEdges.filter((e) => e.src === id), inc = activeEdges.filter((e) => e.dst === id);
    const allOut = edges.filter((e) => e.src === id), allIn = edges.filter((e) => e.dst === id);
    const kus = [...new Set([...allOut, ...allIn].map((e) => e.ku_id).filter(Boolean))];
    const props = Object.entries(n.props || {}).filter(([, v]) => v !== '' && v != null);
    const lab = (k) => ({ cycle: '주기', cycle_detail: '주기 상세', deadline: '기한', approver: '결재', since: '시작', severity: '심각도', kind: '구분', order: '순서', output: '산출물', ref: '조항', summary: '요약', status: '상태', version: '버전', approved_at: '승인', task_key: '키', unit: '부대', role: '역할', condition: '조건', action: '조치', ku_id: 'KU', author_id: '작성자', user_id: '사용자', usage: '용도', name: '이름', text: '내용' }[k] || k);
    const val = (k, v) => (k === 'cycle' ? CYCLE[v] || v : k === 'approved_at' ? fmtDate(v) : typeof v === 'object' ? JSON.stringify(v) : v);
    const rel = (e, dir) => {
      const o = byId.get(dir === 'out' ? e.dst : e.src);
      const p = Object.entries(e.props || {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${lab(k)}: ${val(k, v)}`).join(', ');
      return `<div class="xs" style="padding:4px 0;border-bottom:1px solid var(--line)"><span class="muted">${esc(g.edgeTypes[e.type] || e.type)}</span> <a href="#" data-go="${esc(o.id)}">${esc(o.label)}</a>${p ? `<div class="muted">${esc(p)}</div>` : ''}${e.ku_id ? `<div class="muted">출처 <a href="#/knowledge/${esc(e.ku_id)}">${esc(e.ku_id)}</a></div>` : ''}</div>`;
    };
    root.querySelector('#ginfo').innerHTML = `
      <div class="row"><span class="sw" style="width:12px;height:12px;border-radius:50%;background:${types[n.type]?.color}"></span><span class="badge b-gray">${types[n.type]?.label}</span></div>
      <h3 style="margin:8px 0 10px;font-size:16px">${esc(n.label)}</h3>
      ${props.length ? `<dl class="kv">${props.map(([k, v]) => `<dt>${lab(k)}</dt><dd>${esc(val(k, v))}</dd>`).join('')}</dl>` : ''}
      ${n.type === 'Task' ? `<a class="btn sm" style="margin-top:10px" href="#/ask/${encodeURIComponent(`${n.label} 어떻게 해?`)}">${icon('ask')} 이 업무 질문</a>` : ''}
      ${n.type === 'KnowledgeUnit' ? `<a class="btn sm" style="margin-top:10px" href="#/knowledge/${esc(n.props.ku_id)}">지식 이력 보기</a>` : ''}
      <div class="sep"></div>
      <div class="small"><b>관계 ${allOut.length + allIn.length}</b>${allOut.length + allIn.length > out.length + inc.length ? ` <span class="muted xs">(표시 ${out.length + inc.length} · 숨긴 유형 제외)</span>` : ''}</div>
      ${out.map((e) => rel(e, 'out')).join('')}${inc.map((e) => rel(e, 'in')).join('')}
      ${kus.length ? `<div class="sep"></div><div class="small"><b>출처 지식단위</b></div><div class="row wrap" style="margin-top:6px">${kus.map((k) => `<a class="badge b-blue" href="#/knowledge/${esc(k)}">${esc(k)}</a>`).join('')}</div>` : ''}`;
    root.querySelectorAll('[data-go]').forEach((a) => a.onclick = (ev) => { ev.preventDefault(); const t = byId.get(a.dataset.go); if (t && !visible(t)) { hidden.delete(t.type); root.querySelector(`.legend-item[data-t="${t.type}"]`)?.classList.remove('off'); activeEdges = build(); reheat(0.3); } select(a.dataset.go, true); });
  }
  function select(id, center = false) {
    selectedId = id;
    if (id) info(id);
    highlight();
    if (center && id) { const n = byId.get(id); view.x = W / 2 - n.x * view.k; view.y = H / 2 - n.y * view.k; paint(); }
  }

  // 상호작용
  let drag = null, pan = null;
  const pt = (e) => { const r = svg.getBoundingClientRect(); return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k }; };
  svg.addEventListener('mousedown', (e) => {
    const nodeEl = e.target.closest('.g-node');
    if (nodeEl) { drag = { id: nodeEl.dataset.id, moved: false }; byId.get(drag.id).fixed = true; }
    else pan = { x: e.clientX - view.x, y: e.clientY - view.y, moved: false };
  });
  const onMove = (e) => {
    if (drag || pan) touched = true;
    if (drag) { const p = pt(e); const n = byId.get(drag.id); n.x = p.x; n.y = p.y; drag.moved = true; paint(); }
    else if (pan) { view.x = e.clientX - pan.x; view.y = e.clientY - pan.y; pan.moved = true; paint(); }
  };
  const onUp = () => {
    if (drag) { if (!drag.moved) { byId.get(drag.id).fixed = false; select(drag.id); } else reheat(0.15); drag = null; }
    else if (pan) { if (!pan.moved) select(null); pan = null; }
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    touched = true;
    const r = svg.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const k2 = Math.min(3, Math.max(0.3, view.k * (e.deltaY < 0 ? 1.1 : 0.9)));
    view.x = mx - ((mx - view.x) * k2) / view.k; view.y = my - ((my - view.y) * k2) / view.k; view.k = k2;
    paint();
  }, { passive: false });
  root.querySelectorAll('.legend-item').forEach((el) => el.onclick = () => {
    const t = el.dataset.t;
    if (hidden.has(t)) hidden.delete(t); else hidden.add(t);
    el.classList.toggle('off', hidden.has(t));
    activeEdges = build(); touched = false; reheat(0.4); highlight();
  });
  root.querySelector('#gfit').onclick = (e) => { e.preventDefault(); touched = false; fit(); paint(); };
  root.querySelector('#gq').oninput = (e) => {
    query = e.target.value; selectedId = null; highlight();
    const q = query.trim().toLowerCase();
    const hit = q && [...byId.values()].find((n) => visible(n) && n.label.toLowerCase().includes(q));
    if (hit) { info(hit.id); }
  };
  const firstTask = tasks[0];
  if (firstTask) setTimeout(() => { if (root.querySelector('#ginfo')) info(firstTask.id); }, 50); // 이미 다른 화면으로 이동했으면 생략

  return () => { cancelAnimationFrame(raf); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
}
