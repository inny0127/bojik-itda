// 지식그래프 탐색: 방사형 배치(SVG), 유형 필터, 검색, 노드 상세·출처 추적
// 물리 시뮬레이션 없이 한 번에 좌표를 계산(O(노드+관계))해 바로 그림 — 업무는 바깥 원, 업무 전용 항목(절차·주의 등)은 그 바깥, 여러 업무가 함께 쓰는 체계·규정은 안쪽 원
import { api, esc, fmtDate, icon, CYCLE } from '../util.js?v=607d489f1e';

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
  const byId = new Map(g.nodes.map((n) => [n.id, { ...n, x: 0, y: 0 }]));
  const edges = g.edges.filter((e) => byId.has(e.src) && byId.has(e.dst));
  const adj = new Map([...byId.keys()].map((id) => [id, []]));
  for (const e of edges) { adj.get(e.src).push(e.dst); adj.get(e.dst).push(e.src); }
  const tasks = [...byId.values()].filter((n) => n.type === 'Task');
  // 주기별로 묶어 원 위에 배치 (매일 → 매주 → … → 수시)
  const ORDER = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'seasonal', 'adhoc', 'unknown'];
  const cycleOf = new Map(edges.filter((e) => e.type === 'RESPONSIBLE_FOR').map((e) => [e.dst, e.props?.cycle || 'unknown']));
  tasks.sort((a, b) => ORDER.indexOf(cycleOf.get(a.id) || 'unknown') - ORDER.indexOf(cycleOf.get(b.id) || 'unknown') || a.label.localeCompare(b.label, 'ko'));
  const taskIdx = new Map(tasks.map((t, i) => [t.id, i]));
  // 각 노드가 속한 업무(직접 연결 또는 지식단위·절차를 거쳐 연결)
  const anchors = new Map();
  for (const n of byId.values()) {
    if (n.type === 'Task' || n.type === 'Position' || n.type === 'Unit') continue;
    const set = new Set();
    for (const m of adj.get(n.id)) {
      if (taskIdx.has(m)) set.add(m);
      else if (['KnowledgeUnit', 'ProcedureStep'].includes(byId.get(m).type)) for (const k of adj.get(m)) if (taskIdx.has(k)) set.add(k);
    }
    anchors.set(n.id, [...set]);
  }

  let view = { x: 0, y: 0, k: 1 };
  let selectedId = null;
  let query = '';
  const visible = (n) => !hidden.has(n.type);
  const LABELED = new Set(['Position', 'Unit', 'Task', 'System', 'Rule']);
  const R = (n) => (n.type === 'Position' ? 16 : n.type === 'Task' ? 9 : n.type === 'Unit' ? 11 : 6);
  let ringR = 300;

  function layout() {
    const N = Math.max(tasks.length, 1);
    ringR = Math.max(220, (N * 37) / (2 * Math.PI));
    const ang = (i) => (2 * Math.PI * i) / N - Math.PI / 2;
    for (const n of byId.values()) {
      if (n.type === 'Position') { n.x = 0; n.y = 0; }
      if (n.type === 'Unit') { n.x = 0; n.y = -70; }
    }
    tasks.forEach((t, i) => { t.a = ang(i); t.x = Math.cos(t.a) * ringR; t.y = Math.sin(t.a) * ringR; });
    const slot = (2 * Math.PI) / N;
    const own = new Map(tasks.map((t) => [t.id, []]));
    const shared = [];
    for (const n of byId.values()) {
      if (!anchors.has(n.id) || !visible(n)) continue;
      const an = anchors.get(n.id);
      if (an.length === 1) own.get(an[0]).push(n);
      else shared.push(n);
    }
    // 업무 전용 항목: 업무 바깥쪽에 2열로
    for (const t of tasks) {
      own.get(t.id).forEach((n, j) => {
        const r = ringR + 46 + 30 * Math.floor(j / 2);
        const a = t.a + ((j % 2) - 0.5) * slot * 0.42;
        n.x = Math.cos(a) * r; n.y = Math.sin(a) * r;
      });
    }
    // 공유 항목: 연결된 업무들의 평균 방향, 안쪽 원 위에서 겹치지 않게 간격 유지(넘치면 더 안쪽 원)
    for (const n of shared) {
      const an = anchors.get(n.id);
      let sx = 0, sy = 0;
      for (const id of an) { sx += Math.cos(byId.get(id).a); sy += Math.sin(byId.get(id).a); }
      n.a = an.length ? Math.atan2(sy, sx) : 0;
    }
    shared.sort((p, q) => p.a - q.a);
    const rings = [ringR * 0.58, ringR * 0.4, ringR * 0.24];
    const gap = 34;
    const used = rings.map(() => []);
    for (const n of shared) {
      let placed = false;
      for (let k = 0; k < rings.length && !placed; k++) {
        const min = gap / rings[k];
        let a = n.a;
        for (let step = 0; step < 40; step++) {
          const clash = used[k].some((b) => Math.abs(((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) < min);
          if (!clash) { used[k].push(a); n.x = Math.cos(a) * rings[k]; n.y = Math.sin(a) * rings[k]; placed = true; break; }
          a += (step % 2 ? -1 : 1) * min * Math.ceil((step + 1) / 2);
        }
      }
      if (!placed) { n.x = Math.cos(n.a) * rings[2]; n.y = Math.sin(n.a) * rings[2]; }
    }
  }

  svg.innerHTML = `<g id="vp"><g id="ge"></g><g id="gn"></g></g>`;
  const vp = svg.querySelector('#vp'), ge = svg.querySelector('#ge'), gn = svg.querySelector('#gn');
  let edgeEls = [], nodeEls = [], visNodes = [];
  const edgesOf = new Map();

  // 업무 이름은 바퀴살 방향으로 안쪽을 향해 써서 이웃 업무와 겹치지 않게
  const labelAttrs = (n) => {
    if (n.type !== 'Task') return `dy="${R(n) + 12}" text-anchor="middle"`;
    const deg = (n.a * 180) / Math.PI;
    const right = Math.cos(n.a) >= 0;
    return right ? `transform="rotate(${deg})" x="${-(R(n) + 5)}" dy="4" text-anchor="end"` : `transform="rotate(${deg + 180})" x="${R(n) + 5}" dy="4" text-anchor="start"`;
  };
  function build() {
    layout();
    const vis = new Set([...byId.values()].filter(visible).map((n) => n.id));
    const es = edges.filter((e) => vis.has(e.src) && vis.has(e.dst));
    ge.innerHTML = es.map((e, i) => `<line class="g-edge ${e.type === 'CONFLICTS_WITH' ? 'conf' : ''}" data-e="${i}" data-s="${esc(e.src)}" data-d="${esc(e.dst)}"/>`).join('');
    gn.innerHTML = [...byId.values()].filter(visible).map((n) => `<g class="g-node" data-id="${esc(n.id)}"><circle r="${R(n)}" fill="${types[n.type]?.color || '#999'}"/>
      <text ${labelAttrs(n)} class="${LABELED.has(n.type) ? '' : 'minor'}" ${n.type === 'Task' ? 'font-weight="700" font-size="13"' : ''}>${esc(n.label.length > (n.type === 'Task' ? 12 : 16) ? `${n.label.slice(0, n.type === 'Task' ? 12 : 16)}…` : n.label)}</text></g>`).join('');
    edgeEls = [...ge.children].map((l) => [l, byId.get(l.dataset.s), byId.get(l.dataset.d)]);
    nodeEls = [...gn.children].map((el) => [el, byId.get(el.dataset.id)]);
    visNodes = nodeEls.map(([, n]) => n);
    edgesOf.clear();
    for (const x of edgeEls) for (const n of [x[1], x[2]]) { if (!edgesOf.has(n.id)) edgesOf.set(n.id, []); edgesOf.get(n.id).push(x); }
    for (const [el, n] of nodeEls) el.setAttribute('transform', `translate(${n.x},${n.y})`);
    for (const x of edgeEls) drawEdge(x);
    return es;
  }
  const drawEdge = ([l, a, b]) => { l.setAttribute('x1', a.x); l.setAttribute('y1', a.y); l.setAttribute('x2', b.x); l.setAttribute('y2', b.y); };
  let activeEdges = build();

  // 보이는 노드 전체가 화면에 들어오도록 확대·이동
  function fit() {
    if (!visNodes.length) return;
    const xs = visNodes.map((n) => n.x), ys = visNodes.map((n) => n.y);
    const x0 = Math.min(...xs) - 30, x1 = Math.max(...xs) + 30, y0 = Math.min(...ys) - 30, y1 = Math.max(...ys) + 30;
    const k = Math.min(1.4, Math.max(0.2, Math.min(W / (x1 - x0), H / (y1 - y0))));
    view = { k, x: W / 2 - ((x0 + x1) / 2) * k, y: H / 2 - ((y0 + y1) / 2) * k };
  }
  function paint() {
    vp.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`);
    svg.classList.toggle('zoomed', view.k > 1.3);
  }
  fit();
  paint();

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
    root.querySelectorAll('[data-go]').forEach((a) => a.onclick = (ev) => { ev.preventDefault(); const t = byId.get(a.dataset.go); if (t && !visible(t)) { hidden.delete(t.type); root.querySelector(`.legend-item[data-t="${t.type}"]`)?.classList.remove('off'); activeEdges = build(); highlight(); } select(a.dataset.go, true); });
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
    if (nodeEl) drag = { id: nodeEl.dataset.id, moved: false };
    else pan = { x: e.clientX - view.x, y: e.clientY - view.y, moved: false };
  });
  const onMove = (e) => {
    if (drag) {
      const p = pt(e); const n = byId.get(drag.id); n.x = p.x; n.y = p.y; drag.moved = true;
      nodeEls.find(([, m]) => m === n)?.[0].setAttribute('transform', `translate(${n.x},${n.y})`);
      for (const x of edgesOf.get(n.id) || []) drawEdge(x);
    }
    else if (pan) { view.x = e.clientX - pan.x; view.y = e.clientY - pan.y; pan.moved = true; paint(); }
  };
  const onUp = () => {
    if (drag) { if (!drag.moved) select(drag.id); drag = null; }
    else if (pan) { if (!pan.moved) select(null); pan = null; }
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
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
    activeEdges = build(); fit(); paint(); highlight();
  });
  root.querySelector('#gfit').onclick = (e) => { e.preventDefault(); fit(); paint(); };
  root.querySelector('#gq').oninput = (e) => {
    query = e.target.value; selectedId = null; highlight();
    const q = query.trim().toLowerCase();
    const hit = q && [...byId.values()].find((n) => visible(n) && n.label.toLowerCase().includes(q));
    if (hit) { info(hit.id); }
  };
  const firstTask = tasks[0];
  if (firstTask) setTimeout(() => { if (root.querySelector('#ginfo')) info(firstTask.id); }, 50); // 이미 다른 화면으로 이동했으면 생략

  return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
}
