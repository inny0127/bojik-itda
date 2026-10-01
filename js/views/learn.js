// 학습: 자연어 입력 → AI 구조화 제안 → 사용자 수정 → 충돌 사전검증 → 승인/거부
import { api, esc, toast, modal, icon, fmtDate, ago, CYCLE, SEV, STATUS, badge, person } from '../util.js?v=607d489f1e';
import { readDocument, ACCEPT } from '../docread.js?v=607d489f1e';
import { openDoc } from './docs.js?v=607d489f1e';

const SAMPLE = { url: 'samples/handover-sample-v8.pdf', name: '수송계원_인수인계서_v8_예시.pdf' };

const EXAMPLES = [
  {
    label: '예시 1',
    text: '주간 정비는 매주 목요일 오후 2시에 해요. 먼저 정비반장한테 정비 대상 차량 목록을 받고, 운전병들한테 차량별 점검표를 나눠줍니다. 점검이 끝나면 장비정비정보체계에 결과를 입력하고 수송관에게 결재를 받습니다. 부품 교체가 필요하면 수리부속 청구를 바로 올려요. 만약 비가 오는 경우에는 차고 안에서 실내 점검 항목만 합니다. 점검표는 반드시 운전병 서명까지 받아야 해요.',
  },
  {
    label: '예시 2',
    text: '월간 차량 운행 현황 보고는 매월 말일에 해요. 먼저 DTIS에서 월간 운행실적을 조회하고, 차량별 주행거리와 운행 횟수를 엑셀로 정리합니다. 그다음 수송관님께 결재를 받고 국방망 메일로 연대 수송관에게 보고합니다. 보고는 다음 달 2일까지 끝내야 합니다. DTIS 운행종료 누락 건이 있으면 운전병 운행일지로 확인해서 소급 입력하세요. 보고 전에 월간 유류 결산 수치랑 주행거리가 맞는지 꼭 확인하세요.',
  },
];
const GUIDES = [
  ['업무명·주기', '업무명·주기: 이 업무는 ___이고, (매일/매주 _요일/매월 _일/분기/발생 시)에 합니다.'],
  ['순서', '순서: 먼저 ___하고, 그다음 ___한 뒤, 마지막으로 ___합니다.'],
  ['사용 체계', '체계: ___(DTIS/DELIIS/인사정보체계 등)의 [메뉴]에서 ___을 입력합니다.'],
  ['결재·보고', '결재·보고: ___에게 결재를 받고 ___까지 보고합니다.'],
  ['주의사항', '주의: 반드시 ___해야 합니다.'],
  ['예외 상황', '예외: ___(담당자 부재/체계 장애 등)인 경우에는 ___합니다.'],
];

const S = { draft: null, conflicts: [], tasks: [], sameTask: [], dirty: false, supersedes: '', batch: [], notice: null };

export async function render(root, app, arg) {
  const canWrite = app.me.active?.perms.includes('write');
  const canApprove = app.me.active?.perms.includes('approve');
  S.draft = null; S.conflicts = []; S.dirty = false; S.supersedes = ''; S.batch = []; S.notice = null;
  root.innerHTML = `
  <div class="page-head">
    <div><h1>학습</h1>
    <p>업무 방법을 입력하면 업무·주기·절차·주의사항으로 정리됩니다. 승인한 내용만 저장됩니다.</p></div>
  </div>
  <div class="stepper" style="margin-bottom:14px" id="stepper"></div>
  <div class="learn-grid">
    <div class="col" style="gap:16px">
      <div class="card">
        <div class="card-h"><h3>문서로 한꺼번에 학습</h3><span class="sub">인수인계서·업무 노트·지침</span></div>
        <div class="card-b col" style="gap:10px">
          <label class="drop ${canWrite ? '' : 'off'}" id="impDrop">
            <input type="file" id="impFile" accept="${ACCEPT}" hidden ${canWrite ? '' : 'disabled'}>
            ${icon('doc', 'width="22" height="22"')}
            <b class="small">파일을 끌어다 놓거나 눌러서 선택</b>
            <span class="xs muted">PDF · DOCX · HWPX · TXT — 한글(HWP)은 PDF로 저장해 올리세요</span>
          </label>
          <div class="row wrap"><button class="btn sm" id="impSample" ${canWrite ? '' : 'disabled'}>${icon('doc')} 예시 인수인계서(가상)로 해 보기</button></div>
          <div id="impStatus"></div>
        </div>
      </div>
      <div class="card">
        <div class="card-h"><h3>업무 내용</h3></div>
        <div class="card-b col" style="gap:10px">
          ${canWrite ? '' : '<div class="precheck bad small">이 보직에 대한 등록 권한이 없습니다.</div>'}
          <textarea class="textarea" id="rawText" rows="11" placeholder="후임에게 설명하듯 적으세요." ${canWrite ? '' : 'disabled'}></textarea>
          <div>
            <div class="small muted" style="margin-bottom:6px">항목 추가</div>
            <div class="guide-chips">${GUIDES.map(([l], i) => `<button class="gchip" data-guide="${i}">${l}</button>`).join('')}</div>
          </div>
          <div class="row wrap">
            ${EXAMPLES.map((e, i) => `<button class="btn sm" data-ex="${i}">${e.label}</button>`).join('')}
          </div>
          <div class="row">
            <span class="muted xs" id="charCount">0자</span>
            <button class="btn primary" id="btnPropose" style="margin-left:auto" ${canWrite ? '' : 'disabled'}>${icon('spark')} AI 구조화</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-h"><h3>초안·반려</h3></div>
        <div id="drafts" class="card-b" style="padding:6px 8px"></div>
      </div>
    </div>
    <div id="editor"></div>
  </div>`;

  const ta = root.querySelector('#rawText');
  const count = () => { root.querySelector('#charCount').textContent = `${ta.value.length}자`; };
  ta.oninput = count;
  root.querySelectorAll('[data-guide]').forEach((b) => b.onclick = () => {
    ta.value = (ta.value.trim() ? `${ta.value.trim()}\n` : '') + GUIDES[b.dataset.guide][1];
    ta.focus(); count();
  });
  root.querySelectorAll('[data-ex]').forEach((b) => b.onclick = () => { ta.value = EXAMPLES[b.dataset.ex].text; count(); });
  root.querySelector('#btnPropose').onclick = () => proposeNow(root, app);

  setupImport(root, app);

  renderStepper(root);
  renderEditor(root, app, { canWrite, canApprove });
  loadDrafts(root, app, { canWrite, canApprove });
  if (arg) await loadDraft(root, app, arg, { canWrite, canApprove });
}

function renderStepper(root) {
  const st = !S.draft ? 0 : S.draft.status === 'draft' ? 2 : 4;
  const steps = ['입력', '구조화', '검토', '승인'];
  root.querySelector('#stepper').innerHTML = steps.map((l, i) => `${i ? '<span>/</span>' : ''}<span class="s ${i < st ? 'done' : i === st || (st === 2 && i === 2) ? 'on' : ''}">${i + 1} ${l}</span>`).join('');
}

async function proposeNow(root, app, { local = false, replaceDraft = null, text: given = null } = {}) {
  const ta = root.querySelector('#rawText');
  const btn = root.querySelector('#btnPropose');
  const text = (given ?? ta.value).trim();
  if (text.length < 4) return toast('업무 내용을 입력해 주세요', 'err');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 처리 중';
  root.querySelector('#editor').innerHTML = `<div class="card card-b"><div class="row"><span class="spinner dark"></span><span id="phase">구조화하는 중입니다.</span></div>
    <div class="col" style="margin-top:16px">${[80, 60, 90, 70, 50].map((w) => `<div class="skeleton" style="width:${w}%"></div>`).join('')}</div></div>`;
  const phase = setTimeout(() => { const el = root.querySelector('#phase'); if (el) el.textContent = '기존 지식과 비교하는 중입니다.'; }, 4000);
  try {
    const r = await api('/api/learn/propose', { body: { text, local, replaceDraft } });
    S.tasks = r.tasks || S.tasks;
    S.notice = r.notice || null;
    S.batch = (r.kus || []).map((k) => ({ id: k.id, title: k.title, rev: Boolean(k.supersedes) }));
    if (!r.ku) {
      S.draft = null;
      renderNotice(root, app, r);
      return;
    }
    setDraft(r.ku, r.conflicts);
    await loadSameTask();
    renderEditor(root, app);
    loadDrafts(root, app);
    app.refreshMe();
    const n = S.batch.length;
    toast(n > 1 ? `업무 ${n}건으로 나눠 정리했습니다. 하나씩 확인한 뒤 승인하세요.` : r.ku.supersedes ? '기존 지식을 고친 개정안을 만들었습니다. 바뀐 점을 확인하세요.' : '구조화했습니다. 내용을 확인한 뒤 승인하세요.', 'ok');
  } catch (e) {
    toast(e.message, 'err');
    renderEditor(root, app);
  } finally {
    clearTimeout(phase);
    btn.disabled = false;
    btn.innerHTML = `${icon('spark')} AI 구조화`;
  }
}

// 초안을 만들지 않은 입력(질문·잡담·중복 등) 안내
function renderNotice(root, app, r) {
  renderStepper(root);
  const n = r.notice || {};
  const TITLE = { question: '질문으로 보입니다', duplicate: '이미 등록된 내용입니다', not_task: '업무 지식을 찾지 못했습니다', insufficient: '내용이 조금 더 필요합니다', llm_failed: 'Luna 응답을 받지 못했습니다' };
  const text = n.text || root.querySelector('#rawText').value.trim();
  root.querySelector('#editor').innerHTML = `<div class="card"><div class="card-h"><h3>${TITLE[n.intent] || '안내'}</h3></div><div class="card-b">
    ${warnBox(r.warnings)}
    <p style="margin-top:0">${esc(n.message || '')}</p>
    ${(r.skipped || []).length ? `<div class="col" style="gap:4px;margin-bottom:12px">${r.skipped.map((k) => `<a href="#/knowledge/${esc(k.id)}">${esc(k.title)} (${esc(k.id)})</a>`).join('')}</div>` : ''}
    <div class="row wrap">
      ${n.intent === 'question' ? `<a class="btn primary" href="#/ask/${encodeURIComponent(text)}">질문 화면에서 답 찾기</a>` : ''}
      ${n.intent === 'not_task' || n.intent === 'insufficient' ? '<span class="small muted">왼쪽의 [항목 추가]나 [예시]를 참고해 적어 보세요.</span>' : ''}
      ${n.intent === 'llm_failed' ? '<button class="btn primary" id="retryLuna">Luna로 다시 시도</button><button class="btn" id="useLocal">내장 엔진으로 정리</button>' : ''}
    </div>
  </div></div>`;
  const rl = root.querySelector('#retryLuna');
  if (rl) rl.onclick = () => proposeNow(root, app, { text });
  const ul = root.querySelector('#useLocal');
  if (ul) ul.onclick = () => proposeNow(root, app, { text, local: true });
}

const warnBox = (ws) => ((ws || []).length ? `<div class="warn-banner">${ws.map((w) => `<div>${esc(w)}</div>`).join('')}</div>` : '');

function setDraft(ku, conflicts) {
  S.draft = ku;
  S.prechecking = false;
  S.conflicts = conflicts || [];
  S.dirty = false;
  S.supersedes = ku.supersedes || '';
}

async function loadSameTask() {
  if (!S.draft) return;
  const all = await api('/api/knowledge');
  S.sameTask = all.filter((k) => k.status === 'active' && k.task_key === S.draft.task_key && k.id !== S.draft.id);
  if (!S.tasks.length) {
    const m = new Map();
    for (const k of all) if (k.status === 'active') m.set(k.task_key, { name: k.structure.task.name });
    S.tasks = [...m.values()];
  }
}

async function loadDraft(root, app, id) {
  if (!S.batch.some((b) => b.id === id)) { S.batch = []; S.notice = null; }
  try {
    const ku = await api(`/api/ku/${encodeURIComponent(id)}`);
    // 초안은 바로 보여 주고, 충돌 사전검증(같은 업무 지식이 있으면 AI 의미 검사 포함)은 뒤에서 채움
    setDraft(ku, []);
    S.prechecking = ku.status === 'draft';
    root.querySelector('#rawText').value = ku.raw_text || '';
    await loadSameTask();
    renderEditor(root, app);
    if (S.prechecking) {
      const pre = await api(`/api/ku/${encodeURIComponent(id)}/precheck`, { method: 'POST' }).then((r) => r.conflicts).catch(() => []);
      if (S.draft?.id !== id) return; // 그사이 다른 초안을 열었으면 무시
      S.conflicts = pre;
      S.prechecking = false;
      renderPrecheck(root);
    }
  } catch (e) { toast(e.message, 'err'); }
}

async function loadDrafts(root, app) {
  const list = await api('/api/learn/drafts');
  const el = root.querySelector('#drafts');
  el.innerHTML = list.length ? list.map((k) => `
    <div class="row" style="padding:8px;border-radius:8px;cursor:pointer" data-open="${k.id}">
      ${badge(STATUS[k.status])}<b class="small">${esc(k.title)}</b>
      <span class="muted xs" style="margin-left:auto">${esc(k.author_rank)} ${esc(k.author_name)} · ${ago(k.updated_at)}</span>
    </div>`).join('') : '<div class="muted small" style="padding:10px">초안이 없습니다.</div>';
  el.querySelectorAll('[data-open]').forEach((r) => {
    r.onmouseenter = () => { r.style.background = 'var(--panel-2)'; };
    r.onmouseleave = () => { r.style.background = ''; };
    r.onclick = () => loadDraft(root, app, r.dataset.open);
  });
}

// ---------- 편집기 ----------
function renderEditor(root, app) {
  renderStepper(root);
  const el = root.querySelector('#editor');
  const canWrite = app.me.active?.perms.includes('write');
  const canApprove = app.me.active?.perms.includes('approve');
  if (!S.draft) {
    el.innerHTML = `<div class="card"><div class="card-h"><h3>구조화 결과</h3></div><div class="card-b">
      <div class="empty"><p>업무 내용을 입력하고 [AI 구조화]를 누르면<br>업무명, 주기, 절차, 사용 체계, 주의사항, 예외 상황이 여기에 채워집니다.</p></div>
      </div></div>`;
    return;
  }
  const k = S.draft;
  const s = k.structure;
  const editable = k.status === 'draft' && canWrite;
  const dis = editable ? '' : 'disabled';
  const confDot = (c) => `<span class="conf-dot" title="추출 확신도 ${Math.round((c ?? 1) * 100)}%" style="background:${(c ?? 1) >= 0.8 ? '#16a34a' : (c ?? 1) >= 0.6 ? '#f59e0b' : '#dc2626'}"></span>`;
  const taskOpts = S.tasks.map((t) => `<option value="${esc(t.name)}">`).join('');
  // 문서 일괄 학습 결과에서 연 초안이면 결과 목록으로 돌아가는 버튼
  const fromImport = IMP.job && IMP.job.items.some((it) => it.id === k.id);
  el.innerHTML = `
  ${fromImport ? `<div class="imp-back"><button class="btn sm" id="impBack">← 문서 일괄 학습 결과로</button><span class="xs muted">${esc(IMP.job.title)} · 초안 ${IMP.job.items.filter((it) => it.status === 'draft').length}건 남음</span></div>` : ''}
  <div class="card">
    <div class="card-h">
      <h3>구조화 결과</h3>
      ${badge(STATUS[k.status])}
      <span class="xs muted">${esc(k.id)} · v${k.version}</span>
      <div class="right">${k.confidence != null ? `<span class="small muted">추출 신뢰도 ${Math.round(k.confidence * 100)}%</span>` : ''}</div>
    </div>
    <div class="card-b">
      ${batchBar(k)}
      ${editable && k.extractor === 'local' && app.me.llm?.mode === 'llm' ? `<div class="warn-banner row" style="gap:10px"><span>내장 엔진으로 정리한 초안입니다.</span><button class="btn xs" id="reLuna" style="margin-left:auto">Luna로 다시 정리</button></div>` : ''}
      ${revBanner(k)}
      ${warnBox(s.meta?.warnings)}
      ${editable ? `<div class="followup" style="margin-bottom:12px">
        ${s.followups?.length ? `<div class="row"><b>추가로 확인할 내용</b><span class="xs muted">아는 것만 적고 [답변 반영]을 누르세요.</span></div>
        <ul class="fu-list small">${s.followups.map((q, i) => `<li data-fu="${i}"><div>${esc(q)}</div><input class="input fu-a" data-fa="${i}" placeholder="답변 (모르면 비워 두세요)"></li>`).join('')}</ul>` : '<div class="row"><b>덧붙일 내용</b></div>'}
        <textarea class="textarea" id="fuNote" rows="2" placeholder="그 밖에 덧붙일 내용이 있으면 적어 주세요 (예: 결재는 국방망 메일로도 받음)"></textarea>
        <div class="row" style="margin-top:8px"><button class="btn sm" id="btnRefine">${s.followups?.length ? '답변 반영' : '내용 반영'}</button><span class="xs muted" id="refineMsg"></span></div>
      </div>` : ''}

      <div class="onto-sec"><div class="h">업무 ${confDot(s.task.confidence)}</div><div class="b">
        <div class="task-grid">
          <div class="field" style="grid-column: span 2"><label>업무명</label><input class="input" data-f="task.name" value="${esc(s.task.name)}" list="taskList" ${dis}><datalist id="taskList">${taskOpts}</datalist></div>
          <div class="field"><label>주기 유형</label><select class="select" data-f="task.cycle_type" ${dis}>${Object.entries(CYCLE).map(([v, l]) => `<option value="${v}" ${s.task.cycle_type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label>주기 상세</label><input class="input" data-f="task.cycle_detail" value="${esc(s.task.cycle_detail)}" placeholder="예: 매주 수요일 14:00" ${dis}></div>
          <div class="field"><label>기한·마감</label><input class="input" data-f="task.deadline" value="${esc(s.task.deadline)}" placeholder="예: 익월 3일까지" ${dis}></div>
          <div class="field"><label>결재·승인권자</label><input class="input" data-f="task.approver" value="${esc(s.task.approver)}" placeholder="예: 수송관" ${dis}></div>
          <div class="field" style="grid-column: span 3"><label>요약</label><input class="input" data-f="task.summary" value="${esc(s.task.summary)}" ${dis}></div>
        </div>
      </div></div>

      ${listSec('steps', '절차 단계', ':ProcedureStep · HAS_STEP{order}', s.steps, editable, (x, i) => `<div class="item-row steps-row"><span class="ord">${i + 1}</span>
        <input class="input" data-l="steps" data-i="${i}" data-k="action" value="${esc(x.action)}" placeholder="행동" ${dis}>
        <input class="input" data-l="steps" data-i="${i}" data-k="system" value="${esc(x.system)}" placeholder="사용 체계" ${dis}>
        <input class="input" data-l="steps" data-i="${i}" data-k="output" value="${esc(x.output)}" placeholder="산출물·서식" ${dis}>
        ${editable ? `<span class="row" style="gap:2px">${confDot(x.confidence)}<button class="btn xs ghost" data-mv="steps:${i}:-1">${icon('up', 'width="13" height="13"')}</button><button class="btn xs ghost" data-mv="steps:${i}:1">${icon('down', 'width="13" height="13"')}</button><button class="btn xs ghost" data-del="steps:${i}">${icon('trash', 'width="13" height="13"')}</button></span>` : '<span></span>'}</div>`)}

      <div class="onto-grid">
        ${listSec('cautions', '주의사항', ':Context{caution}', s.cautions, editable, (x, i) => `<div class="item-row caution-row">
          <input class="input" data-l="cautions" data-i="${i}" data-k="text" value="${esc(x.text)}" ${dis}>
          <select class="select" data-l="cautions" data-i="${i}" data-k="severity" ${dis}>${Object.entries(SEV).map(([v, [l]]) => `<option value="${v}" ${x.severity === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          ${delBtn('cautions', i, editable)}</div>`)}
        ${listSec('exceptions', '예외상황', ':Context{exception}', s.exceptions, editable, (x, i) => `<div class="item-row exc-row">
          <input class="input" data-l="exceptions" data-i="${i}" data-k="condition" value="${esc(x.condition)}" placeholder="조건" ${dis}>
          <input class="input" data-l="exceptions" data-i="${i}" data-k="action" value="${esc(x.action)}" placeholder="조치" ${dis}>
          ${delBtn('exceptions', i, editable)}</div>`)}
        ${listSec('systems', '사용 체계', ':System · USES', s.systems, editable, (x, i) => `<div class="item-row two-row">
          <input class="input" data-l="systems" data-i="${i}" data-k="name" value="${esc(x.name)}" placeholder="체계명" ${dis}>
          <input class="input" data-l="systems" data-i="${i}" data-k="usage" value="${esc(x.usage)}" placeholder="용도" ${dis}>
          ${delBtn('systems', i, editable)}</div>`)}
        ${listSec('rules', '근거 규정·지시', ':Rule · BASED_ON', s.rules, editable, (x, i) => `<div class="item-row two-row">
          <input class="input" data-l="rules" data-i="${i}" data-k="title" value="${esc(x.title)}" placeholder="규정명" ${dis}>
          <input class="input" data-l="rules" data-i="${i}" data-k="ref" value="${esc(x.ref)}" placeholder="조항" ${dis}>
          ${delBtn('rules', i, editable)}</div>`)}
        ${listSec('persons', '관련 담당자', ':Person · INVOLVES', s.persons, editable, (x, i) => `<div class="item-row two-row">
          <input class="input" data-l="persons" data-i="${i}" data-k="role" value="${esc(x.role)}" placeholder="역할" ${dis}>
          <input class="input" data-l="persons" data-i="${i}" data-k="duty" value="${esc(x.duty)}" placeholder="관여 내용" ${dis}>
          ${delBtn('persons', i, editable)}</div>`)}
        ${listSec('relations', '선후행 업무', ':Task · PRECEDES', s.relations, editable, (x, i) => `<div class="item-row rel-row">
          <select class="select" data-l="relations" data-i="${i}" data-k="type" ${dis}><option value="PRECEDES" ${x.type === 'PRECEDES' ? 'selected' : ''}>이 업무 → 다음</option><option value="FOLLOWS" ${x.type === 'FOLLOWS' ? 'selected' : ''}>이전 → 이 업무</option></select>
          <input class="input" data-l="relations" data-i="${i}" data-k="task" value="${esc(x.task)}" list="taskList" placeholder="업무명" ${dis}>
          ${delBtn('relations', i, editable)}</div>`)}
      </div>
    </div>
  </div>

  <div class="grid g2" style="margin-top:16px">
    <div class="card"><div class="card-h"><h3>그래프 미리보기</h3></div>
      <div class="card-b"><svg class="mini-graph" id="miniGraph" viewBox="0 0 560 300"></svg></div></div>
    <div class="card"><div class="card-h"><h3>충돌 검사</h3>
      <div class="right">${editable ? `<button class="btn sm" id="btnRecheck">다시 검사</button>` : ''}</div></div>
      <div class="card-b" id="precheck"></div></div>
  </div>

  ${k.status === 'draft' ? `
  <div class="card" style="margin-top:16px"><div class="card-h"><h3>승인</h3></div>
    <div class="card-b">
      ${S.sameTask.length ? `<div class="field" style="margin-bottom:10px"><label>같은 업무의 기존 지식 ${S.sameTask.length}건</label>
        <select class="select" id="supSel" ${dis}>
          <option value="">기존 지식과 함께 유지</option>
          ${S.sameTask.map((o) => `<option value="${o.id}" ${S.supersedes === o.id ? 'selected' : ''}>${esc(o.id)}(${esc(o.author_rank)} ${esc(o.author_name)}, ${fmtDate(o.approved_at)})을 이 내용으로 대체</option>`).join('')}
        </select></div>` : ''}
      <div class="field" style="margin-bottom:12px"><label>승인 메모</label><input class="input" id="apNote" placeholder="선택 사항" ${dis}></div>
      <div class="row">
        <button class="btn danger" id="btnReject" ${editable ? '' : 'disabled'}>반려</button>
        <button class="btn" id="btnSave" ${editable ? '' : 'disabled'}>임시 저장</button>
        <button class="btn primary" id="btnApprove" style="margin-left:auto" ${editable && canApprove ? '' : 'disabled'}>승인</button>
      </div>
    </div></div>` : `<div class="card card-b" style="margin-top:16px"><div class="row">${badge(STATUS[k.status])}<span>${k.status === 'active' ? '승인되어 반영된 지식입니다' : k.status === 'rejected' ? '반려되어 반영되지 않았습니다' : '다른 지식으로 대체되었습니다'}.</span>
      <a class="btn sm" style="margin-left:auto" href="#/knowledge/${k.id}">이력 보기</a></div></div>`}`;

  wireEditor(root, app);
  renderPrecheck(root);
  drawMini(root);
}

// 한 번의 입력으로 만든 초안들 (업무별)
function batchBar(k) {
  if (S.batch.length < 2 || !S.batch.some((b) => b.id === k.id)) return S.notice?.intent === 'partial' ? `<div class="small muted" style="margin-bottom:10px">${esc(S.notice.message)}</div>` : '';
  return `<div class="batch-bar"><span class="small muted">이번 입력으로 만든 초안 ${S.batch.length}건</span>
    ${S.batch.map((b) => `<button class="gchip ${b.id === k.id ? 'on' : ''}" data-batch="${esc(b.id)}">${esc(b.title)}${b.rev ? ' · 개정' : ''}</button>`).join('')}
    ${S.notice?.intent === 'partial' ? `<div class="xs muted" style="flex-basis:100%">${esc(S.notice.message)}</div>` : ''}</div>`;
}

// 기존 지식을 고친 개정안: 무엇이 바뀌는지
function revBanner(k) {
  const r = k.revision;
  if (!r || k.status !== 'draft') return '';
  const line = (c) => (c.from && c.to ? `${esc(c.field)}: ${esc(c.from)} → <b>${esc(c.to)}</b>` : c.to ? `${esc(c.field)} 추가: <b>${esc(c.to)}</b>` : `${esc(c.field)} 삭제: <s>${esc(c.from)}</s>`);
  const list = r.changes.filter((c) => !['담당', '요약'].includes(c.field));
  return `<div class="rev-banner"><b>기존 지식 개정안</b> · <a href="#/knowledge/${esc(r.base_id)}">${esc(r.base_id)} v${r.base_version}</a>${r.base_author ? ` (${esc(r.base_author.rank)} ${esc(r.base_author.name)} 작성)` : ''}을 고친 초안입니다. 승인하면 기존 지식을 대체하고 이력에 남습니다.
    ${list.length ? `<ul>${list.slice(0, 8).map((c) => `<li>${line(c)}</li>`).join('')}${list.length > 8 ? `<li class="muted">외 ${list.length - 8}건</li>` : ''}</ul>` : ''}</div>`;
}

const delBtn = (l, i, editable) => (editable ? `<button class="btn xs ghost" data-del="${l}:${i}">${icon('trash', 'width="13" height="13"')}</button>` : '<span></span>');
function listSec(key, title, tag, arr, editable, row) {
  return `<div class="onto-sec"><div class="h">${title} <span class="muted xs">${arr.length}</span>
    ${editable ? `<button class="btn xs right" data-add="${key}">추가</button>` : ''}</div>
    <div class="b">${arr.map(row).join('') || '<div class="muted small">없음</div>'}</div></div>`;
}

const BLANK = {
  steps: { action: '', system: '', output: '', confidence: 1 }, cautions: { text: '', severity: 'medium' }, exceptions: { condition: '', action: '' },
  systems: { name: '', usage: '' }, rules: { title: '', ref: '' }, persons: { role: '', duty: '' }, relations: { type: 'PRECEDES', task: '' },
};

function wireEditor(root, app) {
  const el = root.querySelector('#editor');
  const s = S.draft.structure;
  let t;
  const touched = () => { S.dirty = true; clearTimeout(t); t = setTimeout(() => drawMini(root), 150); };
  el.querySelector('#impBack')?.addEventListener('click', async () => {
    if (S.dirty && !confirm('저장하지 않은 수정 내용이 있습니다. 결과 목록으로 돌아갈까요?')) return;
    try { IMP.job = await api(`/api/learn/import/${IMP.job.id}`); } catch { /* 이전 목록 표시 */ }
    S.draft = null; S.dirty = false;
    renderStepper(root);
    renderImportPanel(root, app);
    root.querySelector('#impPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  el.querySelectorAll('[data-f]').forEach((inp) => inp.addEventListener('input', () => {
    const [a, b] = inp.dataset.f.split('.');
    s[a][b] = inp.value; touched();
  }));
  el.querySelectorAll('[data-l]').forEach((inp) => inp.addEventListener('input', () => {
    s[inp.dataset.l][inp.dataset.i][inp.dataset.k] = inp.value;
    if (inp.dataset.l === 'steps') s.steps[inp.dataset.i].confidence = 1;
    touched();
  }));
  el.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => { s[b.dataset.add].push({ ...BLANK[b.dataset.add] }); S.dirty = true; renderEditor(root, app); });
  el.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { const [l, i] = b.dataset.del.split(':'); s[l].splice(+i, 1); S.dirty = true; renderEditor(root, app); });
  el.querySelectorAll('[data-mv]').forEach((b) => b.onclick = () => {
    const [l, i, d] = b.dataset.mv.split(':');
    const j = +i + +d;
    if (j < 0 || j >= s[l].length) return;
    [s[l][i], s[l][j]] = [s[l][j], s[l][i]];
    s[l].forEach((x, n) => { x.order = n + 1; });
    S.dirty = true; renderEditor(root, app);
  });
  el.querySelectorAll('[data-batch]').forEach((b) => b.onclick = () => { if (b.dataset.batch !== S.draft.id) loadDraft(root, app, b.dataset.batch); });
  const rel = el.querySelector('#reLuna');
  if (rel) rel.onclick = () => proposeNow(root, app, { text: S.draft.raw_text || root.querySelector('#rawText').value, replaceDraft: S.draft.id });
  const refine = el.querySelector('#btnRefine');
  if (refine) refine.onclick = async () => {
    const answers = [...el.querySelectorAll('[data-fa]')].map((inp) => ({ q: s.followups[inp.dataset.fa], a: inp.value.trim() })).filter((x) => x.a);
    const note = el.querySelector('#fuNote').value.trim();
    if (!answers.length && !note) return toast('답변이나 덧붙일 내용을 입력해 주세요', 'err');
    refine.disabled = true;
    refine.innerHTML = '<span class="spinner dark"></span> 반영 중';
    try {
      const r = await api(`/api/ku/${S.draft.id}/refine`, { body: { structure: s, answers, note } });
      const sup0 = S.supersedes;
      setDraft(r.ku, r.conflicts);
      S.supersedes = sup0;
      renderEditor(root, app);
      toast('답변을 초안에 반영했습니다', 'ok');
    } catch (e) {
      toast(e.message, 'err');
      refine.disabled = false;
      refine.innerHTML = s.followups?.length ? '답변 반영' : '내용 반영';
    }
  };
  const sup = el.querySelector('#supSel');
  if (sup) sup.onchange = () => { S.supersedes = sup.value; };

  const save = async (quiet) => {
    const r = await api(`/api/ku/${S.draft.id}`, { method: 'PUT', body: { structure: s } });
    const sup0 = S.supersedes;
    setDraft(r.ku, r.conflicts);
    S.supersedes = sup0;
    if (!quiet) toast('저장했습니다', 'ok');
    renderEditor(root, app);
  };
  const recheck = el.querySelector('#btnRecheck');
  if (recheck) recheck.onclick = async () => { recheck.disabled = true; try { await save(true); toast('다시 검사했습니다'); } catch (e) { toast(e.message, 'err'); } };
  const bs = el.querySelector('#btnSave');
  if (bs) bs.onclick = () => save(false).catch((e) => toast(e.message, 'err'));
  const br = el.querySelector('#btnReject');
  if (br) br.onclick = () => {
    const m = modal({
      title: '초안 반려', size: 'sm',
      body: '<p class="muted" style="margin-top:0">반려한 초안은 저장되지 않고 사유만 이력에 남습니다.</p><textarea class="textarea" id="rjNote" rows="3" placeholder="반려 사유"></textarea>',
      footer: '<button class="btn" data-close>취소</button><button class="btn danger" id="rjGo">반려</button>',
    });
    m.el.querySelector('#rjGo').onclick = async () => {
      try {
        const ku = await api(`/api/ku/${S.draft.id}/reject`, { body: { note: m.el.querySelector('#rjNote').value } });
        m.close(); setDraft(ku, []); renderEditor(root, app); loadDrafts(root, app); app.refreshMe();
        toast('초안을 반려했습니다');
      } catch (e) { toast(e.message, 'err'); }
    };
  };
  const ba = el.querySelector('#btnApprove');
  if (ba) ba.onclick = async () => {
    ba.disabled = true;
    ba.innerHTML = '<span class="spinner"></span> 처리 중';
    try {
      const r = await api(`/api/ku/${S.draft.id}/approve`, { body: { structure: s, supersedes: S.supersedes || null, note: el.querySelector('#apNote')?.value || '' } });
      setDraft(r.ku, []);
      renderEditor(root, app);
      loadDrafts(root, app);
      app.refreshMe();
      const all = r.newConflicts || [];
      const nc = all.filter((c) => !c.inherited);
      const carried = all.filter((c) => c.inherited);
      const next = S.batch.find((b) => b.id !== r.ku.id && !b.done);
      const cur = S.batch.find((b) => b.id === r.ku.id);
      if (cur) cur.done = true;
      const m2 = modal({
        title: '승인했습니다',
        size: 'sm',
        body: `<div class="precheck ok" style="margin-bottom:12px"><b>${esc(r.ku.title)}</b> 지식을 지식그래프에 반영했습니다.<div class="small" style="margin-top:4px">출처(${esc(r.ku.id)})와 승인자가 함께 기록됩니다.</div></div>
          ${nc.length ? `<div class="precheck bad"><b>충돌 ${nc.length}건이 등록되었습니다</b><ul class="small" style="margin:6px 0 0;padding-left:18px">${nc.map((c) => `<li>${esc(c.title)}</li>`).join('')}</ul><div class="small" style="margin-top:6px">충돌 화면에서 검토해 주세요.</div></div>` : '<p class="muted small">새로 발견된 충돌은 없습니다.</p>'}
          ${carried.length ? `<p class="small muted">개정 전 지식에 있던 충돌 ${carried.length}건은 새 버전으로 이어졌습니다.</p>` : ''}
          ${next ? `<p class="small" style="margin-bottom:0">같은 입력에서 만든 초안이 더 있습니다: <b>${esc(next.title)}</b></p>` : ''}`,
        footer: `<a class="btn" href="#/graph" data-close>지식그래프</a>${next ? '<button class="btn" id="nextDraft">다음 초안</button>' : ''}${nc.length ? '<a class="btn primary" href="#/conflicts" data-close>충돌 검토</a>' : `<a class="btn primary" href="#/ask/${encodeURIComponent(`${r.ku.title} 어떻게 해?`)}" data-close>질문하기</a>`}`,
      });
      const nb = m2.el.querySelector('#nextDraft');
      if (nb) nb.onclick = () => { m2.close(); loadDraft(root, app, next.id); };
    } catch (e) {
      toast(e.message, 'err');
      ba.disabled = false;
      ba.innerHTML = '승인';
    }
  };
}

function renderPrecheck(root) {
  const el = root.querySelector('#precheck');
  if (!el) return;
  if (S.draft.status !== 'draft') { el.innerHTML = '<div class="muted small">승인 전 초안만 검사합니다.</div>'; return; }
  if (S.prechecking) { el.innerHTML = '<div class="row small muted"><span class="spinner dark"></span>같은 업무의 기존 지식·규정과 비교하는 중입니다.</div>'; return; }
  const cs = S.conflicts.filter((c) => !c.inherited);
  const old = S.conflicts.filter((c) => c.inherited);
  const oldNote = old.length ? `<div class="small muted" style="margin-top:8px">개정 전 지식에 이미 있던 충돌 ${old.length}건(${old.map((c) => esc(c.rule_code)).join(', ')})은 그대로 남습니다. 충돌 화면에서 처리하세요.</div>` : '';
  el.innerHTML = cs.length
    ? `<div class="precheck bad"><b style="color:var(--red)">기존 지식 또는 규정과 다른 내용 ${cs.length}건</b>
      <div class="small muted" style="margin:2px 0 8px">내용을 고치거나 기존 지식을 대체하도록 선택하세요. 그대로 승인하면 충돌로 등록됩니다.</div>
      ${cs.map((c) => `<div style="margin-bottom:10px"><div class="row small"><span class="badge ${SEV[c.severity][1]}">${c.rule_code}</span><b>${esc(c.title)}</b></div>
        <div class="small" style="margin-top:3px">${esc(c.description)}</div>
        <div class="ev-pair"><div class="ev a"><div class="k">${c.ku_a === S.draft.id ? '이번 입력' : `기존 지식 ${esc(c.ku_a || '')}`}</div>${esc(c.evidence?.a || '')}</div>
        <div class="ev ${c.doc_chunk ? 'doc' : 'b'}"><div class="k">${c.doc_chunk ? '상위 규정·지침' : c.ku_b === S.draft.id || c.ku_b === 'candidate' ? '이번 입력' : '비교 대상'}</div>${esc(c.evidence?.b || '')}</div></div></div>`).join('')}${oldNote}</div>`
    : `<div class="precheck ok"><b>충돌 없음</b><div class="small">같은 업무의 기존 지식과 열람 가능한 규정에 어긋나는 내용이 없습니다.</div></div>${oldNote}`;
}

// 방사형 미니 지식그래프
function drawMini(root) {
  const svg = root.querySelector('#miniGraph');
  if (!svg || !S.draft) return;
  const s = S.draft.structure;
  const W = 560, H = 300, cx = W / 2, cy = H / 2;
  const nodes = [];
  const add = (label, color, type) => nodes.push({ label, color, type });
  (s.steps || []).forEach((x) => add(`${x.order}. ${x.action}`, '#5b4bb7', '절차'));
  (s.systems || []).forEach((x) => add(x.name, '#0e7490', '체계'));
  (s.rules || []).forEach((x) => add(x.title, '#9a5b0b', '근거'));
  (s.cautions || []).forEach((x) => add(x.text, '#c02a2a', '주의'));
  (s.exceptions || []).forEach((x) => add(x.condition, '#be4b6b', '예외'));
  (s.persons || []).forEach((x) => add(x.role, '#217346', '담당'));
  if (s.task.approver) add(`${s.task.approver}(결재)`, '#217346', '담당');
  (s.relations || []).forEach((x) => add(x.task, '#2457c5', x.type === 'FOLLOWS' ? '선행' : '후행'));
  const n = nodes.length || 1;
  const trunc = (t, m = 14) => (t.length > m ? `${t.slice(0, m)}…` : t);
  let out = '';
  nodes.forEach((nd, i) => {
    const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
    const rx = 215, ry = 112;
    nd.x = cx + Math.cos(ang) * rx; nd.y = cy + Math.sin(ang) * ry;
    out += `<line x1="${cx}" y1="${cy}" x2="${nd.x}" y2="${nd.y}" stroke="#cbd5e1" stroke-width="1.2"/>`;
    out += `<text x="${(cx + nd.x) / 2}" y="${(cy + nd.y) / 2 - 3}" font-size="8" fill="#94a3b8" text-anchor="middle">${esc(nd.type)}</text>`;
  });
  nodes.forEach((nd) => {
    out += `<circle cx="${nd.x}" cy="${nd.y}" r="6" fill="${nd.color}" stroke="#fff" stroke-width="2"/>`;
    out += `<text x="${nd.x}" y="${nd.y + (nd.y < cy ? -10 : 17)}" font-size="10" text-anchor="middle" fill="#1e293b" style="paint-order:stroke;stroke:#fff;stroke-width:3px">${esc(trunc(nd.label))}</text>`;
  });
  out += `<circle cx="${cx}" cy="${cy}" r="30" fill="#1f5f4f" stroke="#fff" stroke-width="3"/><text x="${cx}" y="${cy + 4}" font-size="11" font-weight="700" text-anchor="middle" fill="#fff">${esc(trunc(s.task.name || '업무', 8))}</text>`;
  out += `<text x="${cx}" y="${cy + 46}" font-size="10" text-anchor="middle" fill="#475569">${esc(CYCLE[s.task.cycle_type] || '')} ${esc(trunc(s.task.cycle_detail || '', 16))}</text>`;
  svg.innerHTML = out;
}

// ---------- 문서 일괄 학습 ----------
// 파일은 브라우저에서 글자만 뽑아 쪽별로 보내고, 서버가 구간별로 구조화한 초안을 묶어 돌려줌
const IMP = { job: null, file: null, timer: null };

function setupImport(root, app) {
  const drop = root.querySelector('#impDrop');
  const input = root.querySelector('#impFile');
  input.onchange = () => input.files[0] && pickFile(root, app, input.files[0]);
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f && !input.disabled) pickFile(root, app, f); };
  root.querySelector('#impSample').onclick = async () => {
    try {
      const r = await fetch(SAMPLE.url);
      if (!r.ok) throw new Error('예시 파일을 불러오지 못했습니다');
      pickFile(root, app, new File([await r.blob()], SAMPLE.name, { type: 'application/pdf' }));
    } catch (e) { toast(e.message, 'err'); }
  };
  // 진행 중이거나 최근에 끝난 가져오기가 있으면 이어서 표시
  api('/api/learn/import').then((job) => {
    if (!job || !root.isConnected) return;
    IMP.job = job;
    renderImportStatus(root, app);
    if (job.status === 'running') poll(root, app);
    // 다른 화면에 다녀왔을 때 확인할 초안이 남아 있으면 결과 목록을 다시 보여 줌
    if (!S.draft && (job.status === 'running' || job.items.some((it) => it.status === 'draft'))) renderImportPanel(root, app);
  }).catch(() => {});
}

async function pickFile(root, app, file) {
  const st = root.querySelector('#impStatus');
  st.innerHTML = `<div class="row small"><span class="spinner dark"></span><span id="impRead">${esc(file.name)} 읽는 중</span></div>`;
  try {
    const doc = await readDocument(file, (i, n) => { const el = root.querySelector('#impRead'); if (el) el.textContent = `${file.name} 읽는 중 (${i}/${n}쪽)`; });
    IMP.file = doc;
    st.innerHTML = `<div class="imp-file">
      <div><b class="small">${esc(doc.title)}</b><div class="xs muted">${doc.kind} · ${doc.pages.length}쪽 · ${doc.chars.toLocaleString('ko-KR')}자</div></div>
      <button class="btn primary sm" id="impGo">${icon('spark')} 학습 시작</button></div>
      <div class="xs muted" style="margin-top:6px">구간별로 업무를 찾아 초안을 만들고 기존 지식과 비교합니다. 원문은 이 보직 문서로 저장되어 바로 질문에 쓰입니다. 비밀번호·개인 휴대전화 번호는 자동으로 가려집니다.</div>`;
    st.querySelector('#impGo').onclick = () => startImport(root, app);
  } catch (e) {
    st.innerHTML = `<div class="precheck bad small">${esc(e.message)}</div>`;
  }
  root.querySelector('#impFile').value = '';
}

async function startImport(root, app) {
  const doc = IMP.file;
  if (!doc) return;
  const btn = root.querySelector('#impGo');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 시작 중'; }
  try {
    IMP.job = await api('/api/learn/import', { body: { title: doc.title, pages: doc.pages } });
    IMP.file = null;
    renderImportStatus(root, app);
    renderImportPanel(root, app);
    root.querySelector('#impPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    poll(root, app);
  } catch (e) {
    toast(e.message, 'err');
    if (btn) { btn.disabled = false; btn.innerHTML = `${icon('spark')} 학습 시작`; }
  }
}

function poll(root, app) {
  clearTimeout(IMP.timer);
  IMP.timer = setTimeout(async () => {
    if (!root.isConnected || !IMP.job) return;
    try {
      const job = await api(`/api/learn/import/${IMP.job.id}`);
      const wasRunning = IMP.job.status === 'running';
      IMP.job = job;
      renderImportStatus(root, app);
      if (root.querySelector('#impPanel')) renderImportPanel(root, app);
      if (job.status === 'running') return poll(root, app);
      if (wasRunning) {
        await api(`/api/learn/import/${job.id}/sync`, { method: 'POST' }); // 공개 데모: 결과를 브라우저 DB에 저장
        loadDrafts(root, app);
        app.refreshMe?.();
        toast(`문서에서 초안 ${job.items.length}건을 만들었습니다. 확인 후 승인하세요.`, 'ok');
      }
    } catch (e) { toast(e.message, 'err'); }
  }, 1500);
}

// 왼쪽 카드: 진행 요약 + 결과 보기
function renderImportStatus(root, app) {
  const j = IMP.job;
  const st = root.querySelector('#impStatus');
  if (!st || !j || IMP.file) return;
  const pct = j.total ? Math.round((j.done / j.total) * 100) : 0;
  st.innerHTML = `<div class="imp-file">
    <div style="flex:1;min-width:0"><b class="small">${esc(j.title)}</b>
      <div class="xs muted">${j.pages}쪽 · 구간 ${j.done}/${j.total} · 초안 ${j.items.length}건${j.status === 'running' ? ' · 처리 중' : ' · 완료'}</div>
      <div class="progress" style="margin-top:6px"><i style="width:${pct}%"></i></div></div>
    <button class="btn sm" id="impShow">결과 보기</button></div>`;
  st.querySelector('#impShow').onclick = () => { renderImportPanel(root, app); root.querySelector('#impPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
}

// 오른쪽: 가져오기 결과 (초안 목록·일괄 승인)
function renderImportPanel(root, app) {
  const j = IMP.job;
  if (!j) return;
  const canApprove = app.me.active?.perms.includes('approve');
  const ed = root.querySelector('#editor');
  const prevSel = new Set([...ed.querySelectorAll('[data-pick]')].filter((c) => !c.checked).map((c) => c.dataset.pick));
  IMP.touched = new Set([...ed.querySelectorAll('[data-pick]')].filter((c) => c.checked).map((c) => c.dataset.pick));
  const drafts = j.items.filter((it) => it.status === 'draft');
  const nNew = j.items.filter((it) => it.kind === 'new').length, nRev = j.items.filter((it) => it.kind === 'revision').length;
  const nDiff = j.items.filter((it) => it.kind === 'differs').length;
  // 절차·주의사항 없이 되묻는 질문만 남은 초안은 내용을 채운 뒤 승인하도록 일괄 승인에서 기본으로 뺌
  const thin = (it) => it.status === 'draft' && !it.steps && !it.cautions && it.followups > 0;
  const nThin = j.items.filter(thin).length;
  const KIND = { new: ['신규', 'b-blue'], revision: ['개정', 'b-amber'], differs: ['내용 다름', 'b-red'] };
  const pct = j.total ? Math.round((j.done / j.total) * 100) : 0;
  const running = j.status === 'running';
  ed.innerHTML = `<div class="card" id="impPanel">
    <div class="card-h"><h3>문서 일괄 학습</h3><span class="sub">${esc(j.title)} · ${j.pages}쪽 · ${j.engine === 'llm' ? 'gpt-6-luna' : '내장 엔진'}</span>
      ${j.docId ? `<button class="btn sm" style="margin-left:auto" id="impDoc">${icon('doc')} 원문 보기</button>` : ''}</div>
    <div class="card-b col" style="gap:12px">
      <div>
        <div class="row small">${running ? '<span class="spinner dark"></span>' : icon('check', 'width="16" height="16" style="color:var(--green);flex:none"')}<b>${running ? `구간 ${j.done}/${j.total} 분석 중` : `분석 완료 — 구간 ${j.total}개`}</b>
          <span class="muted xs" style="margin-left:auto">${running ? '구간마다 업무를 찾아 기존 지식과 비교하고 있습니다' : ''}</span></div>
        <div class="progress" style="margin-top:8px"><i style="width:${pct}%"></i></div>
      </div>
      <div class="imp-stats">
        <div><b>${nNew}</b><span>새 업무 초안</span></div>
        <div><b>${nRev}</b><span>기존 지식 개정안</span></div>
        <div><b>${nDiff}</b><span>기존과 내용 다름</span></div>
        <div><b>${j.skipped.length}</b><span>이미 있는 내용</span></div>
      </div>
      ${j.failed && !running ? `<div class="precheck bad small row">응답을 받지 못한 구간 ${j.failed}개<button class="btn sm" id="impRetry" style="margin-left:auto">${icon('refresh')} 다시 시도</button></div>` : ''}
      ${j.items.length ? `<div class="imp-list">${j.items.map((it) => `
        <div class="imp-item ${it.status !== 'draft' ? 'done' : ''}">
          ${it.status === 'draft' ? `<input type="checkbox" data-pick="${esc(it.id)}" ${prevSel.has(it.id) || ((it.kind === 'differs' || thin(it)) && !IMP.touched?.has(it.id)) ? '' : 'checked'}>` : `<span class="badge ${it.status === 'active' ? 'b-green' : 'b-gray'}">${it.status === 'active' ? '승인됨' : STATUS[it.status]?.[0] || it.status}</span>`}
          <span class="badge ${KIND[it.kind][1]}">${it.kind === 'revision' ? `개정 v${it.version}` : KIND[it.kind][0]}</span>${thin(it) ? '<span class="badge b-gray">보완 필요</span>' : ''}
          <a href="#" data-view="${esc(it.id)}" class="small"><b>${esc(it.title)}</b></a>
          <span class="xs muted imp-meta">${it.cycle ? `${esc(it.cycle)} · ` : ''}절차 ${it.steps} · 주의 ${it.cautions}${it.followups ? ` · 질문 ${it.followups}` : ''} · ${esc(it.pages)}</span>
        </div>`).join('')}</div>` : `<div class="muted small">${running ? '찾은 업무가 여기에 차례로 표시됩니다.' : '새로 만들 초안이 없습니다.'}</div>`}
      ${j.skipped.length ? `<details class="small"><summary class="muted">이미 등록된 내용과 같아 건너뜀 ${j.skipped.length}건</summary><div class="xs muted" style="margin-top:6px">${j.skipped.map((k) => `${esc(k.title)} (${esc(k.pages)})`).join(' · ')}</div></details>` : ''}
      ${nDiff ? `<div class="xs muted">'내용 다름'은 같은 업무의 기존 지식과 다른 내용이 적혀 있는 초안입니다. 제목을 눌러 비교한 뒤 기존 지식을 대체할지 정하세요(일괄 승인에서는 기본으로 빠져 있습니다).</div>` : ''}
      ${nThin ? `<div class="xs muted">'보완 필요'는 절차·주의사항 없이 확인할 질문만 남은 초안입니다. 제목을 눌러 내용을 채운 뒤 승인하세요(일괄 승인에서는 기본으로 빠져 있습니다).</div>` : ''}
      ${j.merged ? `<div class="xs muted">여러 구간에서 나온 같은 업무 초안 ${j.merged}건을 하나로 합쳤습니다.</div>` : ''}
      ${drafts.length && !running ? `<div class="row">
        <span class="xs muted">제목을 누르면 초안을 하나씩 확인·수정할 수 있습니다.</span>
        <button class="btn primary" id="impApprove" style="margin-left:auto" ${canApprove ? '' : 'disabled title="승인 권한이 없습니다"'}>${icon('check')} 선택한 초안 승인</button></div>` : ''}
    </div></div>`;
  ed.querySelectorAll('[data-view]').forEach((a) => a.onclick = (e) => { e.preventDefault(); loadDraft(root, app, a.dataset.view); });
  ed.querySelector('#impDoc')?.addEventListener('click', () => openDoc(j.docId)); // 학습 화면을 떠나지 않고 팝업으로
  ed.querySelector('#impRetry')?.addEventListener('click', async () => {
    try { IMP.job = await api(`/api/learn/import/${j.id}/retry`, { method: 'POST' }); renderImportPanel(root, app); poll(root, app); } catch (e) { toast(e.message, 'err'); }
  });
  ed.querySelector('#impApprove')?.addEventListener('click', async (e) => {
    const ids = [...ed.querySelectorAll('[data-pick]')].filter((c) => c.checked).map((c) => c.dataset.pick);
    if (!ids.length) return toast('승인할 초안을 선택해 주세요', 'err');
    e.target.disabled = true;
    e.target.innerHTML = '<span class="spinner"></span> 승인 중';
    try {
      const r = await api('/api/learn/approve-many', { body: { ids, note: `문서 일괄 학습(${j.title}) 일괄 승인` } });
      const fresh = r.newConflicts.filter((c) => !c.inherited).length, kept = r.newConflicts.length - fresh;
      toast(`${r.approved.length}건을 지식 DB에 반영했습니다.${fresh ? ` 새 충돌 ${fresh}건은 충돌 화면에서 확인하세요.` : ''}${kept ? ` 개정 전 지식에 있던 충돌 ${kept}건은 새 버전으로 이어집니다.` : ''}`, 'ok');
      IMP.job = await api(`/api/learn/import/${j.id}`);
      renderImportPanel(root, app);
      renderImportStatus(root, app);
      loadDrafts(root, app);
      app.refreshMe?.();
    } catch (err) { toast(err.message, 'err'); e.target.disabled = false; }
  });
}
