// 시스템 구성: 아키텍처, 인수인계 온톨로지, 충돌 규칙, 운용 모드
import { api, esc } from '../util.js?v=beb39f2588';

export async function render(root) {
  const s = await api('/api/system');
  root.innerHTML = `
  <div class="page-head">
    <div><h1>시스템 구성</h1><p>지식 DB, 온톨로지·지식그래프, 권한 기반 검색, 접근통제, LLM 연동</p></div>
    <div class="actions"><span class="chip"><span class="dot"></span>${s.llm.mode === 'llm' ? `LLM: ${esc(s.llm.model)}` : '내장 엔진'}</span></div>
  </div>

  <div class="card" style="margin-bottom:16px"><div class="card-h"><h3>처리 흐름</h3><span class="sub">학습 · 질문 · 충돌</span></div>
    <div class="card-b arch">
      <div class="arch-row" style="grid-template-columns: repeat(3, 1fr)">
        <div class="arch-box hl"><h4>학습</h4><p>자연어 입력 → 비밀번호·개인 연락처 가림 → 입력 판별(질문·잡담 제외)·업무별 구조화 → 기존 지식과 비교해 개정안·덧붙임·중복·신규 판단 → 추가 질문 답변 반영 → 충돌 사전검증 → 승인 시에만 DB 반영, 모든 단계 이력 기록. 인수인계서 등 긴 문서(PDF·DOCX·HWPX)는 브라우저에서 글자만 추출 → 제목 기준 구간 분할 → 구간별 동시 구조화 → 같은 업무 초안 합치기 → 일괄 승인(원문은 보직 문서로 저장)</p></div>
        <div class="arch-box hl"><h4>질문</h4><p>로그인 사용자 권한 범위 계산 → 권한 밖 문서·지식 검색 전 제외 → 한국어 bigram BM25 검색 → 지식그래프 이웃 확장 → 근거·출처만 LLM에 전달</p></div>
        <div class="arch-box hl"><h4>충돌</h4><p>같은 업무의 지식끼리, 상위 규정의 구조화 사실과 규칙 기반 비교(C01~C09) → AI 분석(원인·위험·재검토 질문) → 대체·조건 분리·예외 인정 결정 기록</p></div>
      </div>
      <div class="arch-arrow">↓ ↑</div>
      <div class="arch-row" style="grid-template-columns: repeat(4, 1fr)">
        <div class="arch-box"><h4>지식 데이터베이스</h4><p>군 공통 매뉴얼·규정 / 부대 지침 / 보직 인수인계 문서 (절 단위 청크 + 구조화 사실)</p></div>
        <div class="arch-box"><h4>온톨로지 · 지식그래프 (LPG)</h4><p>노드·관계에 속성(주기, 순서, 심각도, 승인자, 출처 KU)을 저장. 승인 시 자동 재구성</p></div>
        <div class="arch-box"><h4>접근통제 체계</h4><p>사단›연대›대대 계통 + 보직 단위 권한(열람·등록·승인), 권한 위임, 허용·차단 접근 기록</p></div>
        <div class="arch-box"><h4>LLM 연동</h4><p>OpenAI gpt-6-luna(공개 데모는 키를 보관한 프록시 경유). 학습·질문·충돌 분석 모두 LLM이 처리하고, 이어지는 질문은 앞 대화를 반영해 검색. LLM 미설정 시에만 내장 한국어 엔진 사용</p></div>
      </div>
    </div></div>

  <div class="grid g2" style="margin-bottom:16px">
    <div class="card"><div class="card-h"><h3>온톨로지 노드</h3><span class="sub">인수인계용 클래스</span></div>
      <table class="table"><tbody>${Object.entries(s.nodeTypes).map(([k, v]) => `<tr><td style="width:24px"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${v.color}"></span></td><td class="mono small">${k}</td><td>${v.label}</td></tr>`).join('')}</tbody></table></div>
    <div class="card"><div class="card-h"><h3>관계 (속성 포함)</h3></div>
      <table class="table"><tbody>
        <tr><td class="mono small">(Position)-[:RESPONSIBLE_FOR {cycle, deadline, approver, since}]->(Task)</td></tr>
        <tr><td class="mono small">(Task)-[:HAS_STEP {order}]->(ProcedureStep)-[:USES]->(System)</td></tr>
        <tr><td class="mono small">(Task)-[:BASED_ON {ref}]->(Rule)</td></tr>
        <tr><td class="mono small">(Task)-[:HAS_CONTEXT {type: caution|exception, severity}]->(Context)</td></tr>
        <tr><td class="mono small">(Task)-[:PRECEDES {mandatory}]->(Task)</td></tr>
        <tr><td class="mono small">(Task)-[:INVOLVES {duty}]->(Person)</td></tr>
        <tr><td class="mono small">(KnowledgeUnit)-[:DESCRIBES]->(Task) · -[:CREATED_BY]->(Person)</td></tr>
        <tr><td class="mono small">(KnowledgeUnit)-[:SUPERSEDES | CONFLICTS_WITH]->(KnowledgeUnit)</td></tr>
        <tr><td class="small muted">모든 관계에 출처 ku_id가 저장되어 "누가 언제 승인한 지식인가"를 추적합니다.</td></tr>
      </tbody></table></div>
  </div>

  <div class="grid g2" style="margin-bottom:16px">
    <div class="card"><div class="card-h"><h3>충돌 탐지 규칙</h3><span class="sub">규칙 기반 검증 + AI 분석</span></div>
      <table class="table"><tbody>${Object.entries(s.rules).map(([k, v]) => `<tr><td class="mono small" style="width:56px">${k}</td><td><b class="small">${esc(v.name)}</b><div class="xs muted">${esc(v.desc)}</div></td></tr>`).join('')}</tbody></table></div>
    <div class="card"><div class="card-h"><h3>학습 구조화 JSON Schema</h3><span class="sub">LLM 출력 형식 강제</span></div>
      <div class="card-b"><pre class="raw-box" style="max-height:420px;font-family:var(--code);font-size:12px">${esc(JSON.stringify(s.schema, null, 2))}</pre></div></div>
  </div>

  <div class="card"><div class="card-h"><h3>운용 모드</h3><span class="sub">MVP</span></div>
    <table class="table"><tbody>
      <tr><td class="small" style="width:120px"><b>AI 처리</b></td><td class="small">${s.llm.mode === 'llm'
        ? `${esc(s.llm.label || '')} ${esc(s.llm.model)} · ${s.llm.via === 'proxy' ? 'API 키를 보관한 프록시(Cloudflare Workers) 경유' : '서버에서 직접 호출'}`
        : '내장 규칙 엔진 (외부 호출 없음)'}</td></tr>
      <tr><td class="small"><b>데이터</b></td><td class="small">비식별·가상 업무 데이터</td></tr>
      <tr><td class="small"><b>권한 필터</b></td><td class="small">LLM 호출 전에 적용. 권한 밖 자료는 모델 입력에 포함되지 않음</td></tr>
      <tr><td class="small"><b>보안</b></td><td class="small">비밀번호·암구호·개인 휴대전화 번호는 저장·전송 전에 가림. API 키는 서버 환경변수 또는 프록시 비밀값에만 보관</td></tr>
      <tr><td class="small"><b>장애 대응</b></td><td class="small">일시 오류는 자동 재시도. 계속 실패하면 알림과 함께 [Luna로 다시] 제공, 내장 엔진은 사용자가 고를 때 또는 LLM 미설정 시에만 사용</td></tr>
      <tr><td class="small muted"><b>향후</b></td><td class="small muted">실증 후 내부 LLM 서버 연계, 저장 데이터 암호화, 국방망 인증·보안 체계 연계, 폐쇄망 운용</td></tr>
    </tbody></table>
  </div>`;
}
