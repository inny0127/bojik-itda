// 규정·문서: 권한 범위 문서 목록/열람/등록 (권한 밖 문서는 목록에도 노출하지 않음)
import { api, esc, modal, toast, icon } from '../util.js?v=53868ba833';

const TYPE = { regulation: '규정', manual: '매뉴얼', directive: '지휘관 지시·지침', handover: '인수인계 문서', record: '업무 기록' };
const SCOPE = { common: ['군 공통', 'b-gray'], unit: ['부대', 'b-amber'], position: ['보직', 'b-brand'] };

export async function render(root, app, arg) {
  const { documents, hidden } = await api('/api/documents');
  const canWrite = app.me.active?.perms.includes('write');
  const hiddenN = Object.values(hidden).reduce((a, b) => a + b, 0);
  root.innerHTML = `
  <div class="page-head">
    <div><h1>규정·문서</h1><p>군 공통 규정, 부대 지침, 보직 문서입니다. 질문할 때 검색 대상이 됩니다.</p></div>
    <div class="actions">${canWrite ? `<button class="btn primary" id="add">${icon('plus')} 문서 등록</button>` : ''}</div>
  </div>
  <div class="card card-b row" style="margin-bottom:16px;background:#f8fafc">${icon('lock', 'width="18" height="18"')}
    <span class="small">현재 공간 <b>${esc(app.me.active?.name || '')}</b>에서 열람 가능한 문서 <b>${documents.filter((d) => d.status === 'active').length}건</b>(검색 대상 조문·절 ${documents.filter((d) => d.status === 'active').reduce((n, d) => n + d.chunks, 0).toLocaleString('ko-KR')}개).
    권한 밖 문서 ${hiddenN}건(${Object.entries(hidden).map(([k, v]) => `${k} ${v}`).join(', ') || '없음'})은 제목조차 노출되지 않으며 검색에서도 제외됩니다.</span></div>
  <div class="card"><table class="table"><thead><tr><th>문서</th><th style="width:110px">범위</th><th style="width:130px">유형</th><th style="width:120px">판·호</th><th style="width:110px">시행일</th><th style="width:70px">절</th></tr></thead><tbody>
    ${documents.map((d) => `<tr data-doc="${esc(d.id)}" style="cursor:pointer;${d.status !== 'active' ? 'opacity:.55' : ''}"><td><b>${esc(d.title)}</b>${d.status !== 'active' ? ' <span class="badge b-gray">폐지·대체됨 (검색 제외)</span>' : ''}<div class="xs muted">${esc(d.summary || '')}</div></td>
      <td><span class="badge ${SCOPE[d.scope][1]}">${SCOPE[d.scope][0]}</span><div class="xs muted">${esc(d.access)}</div></td><td class="small">${TYPE[d.doc_type] || d.doc_type}</td><td class="small">${esc(d.version || '-')}</td><td class="small">${esc(d.effective_date || '-')}</td><td class="small">${d.chunks}</td></tr>`).join('')}
  </tbody></table></div>`;
  root.querySelectorAll('[data-doc]').forEach((r) => r.onclick = () => openDoc(r.dataset.doc));
  const add = root.querySelector('#add');
  if (add) add.onclick = () => addDoc(app, () => render(root, app));
  if (arg) openDoc(arg);
}

export async function openDoc(id) {
  try {
    const d = await api(`/api/documents/${encodeURIComponent(id)}`);
    modal({
      title: esc(d.title),
      body: `<div class="row wrap small" style="margin-bottom:12px"><span class="badge ${SCOPE[d.scope][1]}">${SCOPE[d.scope][0]}</span><span class="muted">${TYPE[d.doc_type] || ''} · ${esc(d.version || '')} · ${esc(d.issuer || '')} · 시행 ${esc(d.effective_date || '-')} · 접근 근거: ${esc(d.access)}</span></div>
        ${d.chunks.map((c) => `<div style="margin-bottom:14px"><b>${esc(c.heading)}</b><p style="margin:4px 0 0;white-space:pre-line">${esc(c.text)}</p>
          ${c.facts?.length ? `<div class="xs" style="margin-top:4px;color:var(--amber)">충돌 검사 기준 항목 ${c.facts.length}건</div>` : ''}</div>`).join('')}`,
    });
  } catch (e) { toast(e.message, 'err'); }
}

function addDoc(app, done) {
  const m = modal({
    title: '문서 등록',
    body: `<div class="col" style="gap:10px">
      <div class="field"><label>제목</label><input class="input" id="dt" placeholder="예: 연대 검열 체크리스트"></div>
      <div class="grid g2"><div class="field"><label>공개 범위</label><select class="select" id="ds"><option value="position">이 보직만 (${esc(app.me.active?.name || '')})</option><option value="unit">소속 부대 전체</option></select></div>
      <div class="field"><label>유형</label><select class="select" id="dty">${Object.entries(TYPE).map(([k, v]) => `<option value="${k}" ${k === 'handover' ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
      <div class="field"><label>본문 <span class="muted xs">(빈 줄·"제N조"·"1." 단위로 절이 나뉘어 검색됩니다)</span></label><textarea class="textarea" id="dx" rows="10"></textarea></div></div>`,
    footer: '<button class="btn" data-close>취소</button><button class="btn primary" id="dgo">등록</button>',
  });
  m.el.querySelector('#dgo').onclick = async () => {
    try {
      await api('/api/documents', { body: { title: m.el.querySelector('#dt').value, scope: m.el.querySelector('#ds').value, doc_type: m.el.querySelector('#dty').value, text: m.el.querySelector('#dx').value } });
      m.close(); toast('문서를 등록했습니다', 'ok'); done();
    } catch (e) { toast(e.message, 'err'); }
  };
}
