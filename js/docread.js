// 첨부 문서 → 쪽별 텍스트 (브라우저에서 추출: 원본 파일은 서버로 보내지 않고 텍스트만 전송)
// PDF(pdf.js) · DOCX · HWPX(압축 XML) · TXT/MD 지원. HWP(구 바이너리)·스캔 PDF는 안내 후 중단
const VENDOR = new URL('../vendor/', import.meta.url).href;
const PAGE_CHARS = 1800; // 쪽 구분이 없는 형식은 이 길이 안팎으로 나눠 쪽처럼 사용

export const ACCEPT = '.pdf,.docx,.hwpx,.txt,.md';

export async function readDocument(file, onProgress = () => {}) {
  const name = file.name;
  const ext = (name.split('.').pop() || '').toLowerCase();
  const title = name.replace(/\.[^.]+$/, '');
  if (ext === 'hwp') throw new Error('HWP(한글 97~2018 기본 형식)는 읽을 수 없습니다. 한글에서 PDF 또는 HWPX로 저장해 올려 주세요.');
  const buf = await file.arrayBuffer();
  let pages;
  if (ext === 'pdf') pages = await readPdf(buf, onProgress);
  else if (ext === 'docx') pages = await readZip(buf, (f) => f === 'word/document.xml', 'word/styles.xml', docxText);
  else if (ext === 'hwpx') pages = await readZip(buf, (f) => /^Contents\/section\d+\.xml$/i.test(f), 'Contents/header.xml', hwpxText);
  else if (ext === 'txt' || ext === 'md') pages = paginate(new TextDecoder('utf-8').decode(buf));
  else throw new Error('PDF, DOCX, HWPX, TXT 파일만 올릴 수 있습니다.');
  pages = pages.map(clean);
  const chars = pages.reduce((n, p) => n + p.replace(/\s/g, '').length, 0);
  if (chars < 30) throw new Error(ext === 'pdf' ? '글자를 읽을 수 없는 PDF입니다(스캔 이미지일 수 있습니다). 글자 선택이 되는 PDF로 올려 주세요.' : '문서에서 글자를 찾지 못했습니다.');
  return { title, kind: ext.toUpperCase(), pages, chars: pages.reduce((n, p) => n + p.length, 0) };
}

async function readPdf(buf, onProgress) {
  const pdfjs = await import(`${VENDOR}pdfjs/pdf.min.js`);
  pdfjs.GlobalWorkerOptions.workerSrc = `${VENDOR}pdfjs/pdf.worker.min.js`;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), cMapUrl: `${VENDOR}pdfjs/cmaps/`, cMapPacked: true, isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    // 같은 줄(y 좌표)의 글자 조각을 이어 붙이고 줄이 바뀌면 줄바꿈
    let out = '', lastY = null, lastEnd = null;
    for (const it of tc.items) {
      if (!('str' in it)) continue;
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      if (lastY !== null && Math.abs(y - lastY) > 2) out += '\n';
      else if (lastEnd !== null && x - lastEnd > 3 && !out.endsWith(' ')) out += ' ';
      out += it.str;
      lastY = y; lastEnd = x + (it.width || 0);
      if (it.hasEOL) { out += '\n'; lastY = null; lastEnd = null; }
    }
    pages.push(out);
    page.cleanup();
    onProgress(i, doc.numPages);
  }
  await (doc.destroy?.() ?? doc.cleanup?.());
  return pages;
}

// 압축 XML 문서(DOCX·HWPX): 본문 파트들 + 스타일 파트(제목·목차 스타일 판별용)를 읽어 텍스트로
async function readZip(buf, isBody, auxName, toText) {
  const { unzipSync } = await import(`${VENDOR}fflate/fflate.js`);
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => isBody(f.name) || f.name === auxName });
  const xml = (n) => {
    const d = new DOMParser().parseFromString(new TextDecoder('utf-8').decode(files[n]), 'application/xml');
    if (d.getElementsByTagName('parsererror').length) throw new Error('문서 본문을 읽지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요.');
    return d;
  };
  const names = Object.keys(files).filter(isBody).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!names.length) throw new Error('문서 본문을 찾지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요.');
  const aux = files[auxName] ? xml(auxName) : null;
  return paginate(names.map((n) => toText(xml(n), aux)).join('\f'));
}

const byLocal = (root, name) => [...root.getElementsByTagName('*')].filter((e) => e.localName === name);
const kids = (el, name) => (el ? [...el.children].filter((c) => c.localName === name) : []);
// 이미 제목 모양(번호·기호)으로 시작하는 줄은 그대로, 아니면 제목 문단 앞에 '■ '를 붙여 구간 나누기에 쓰게 함
const HEADING_LIKE = /^(?:\d{1,2}(?:\.\d{1,2}){0,3}[.)]?\s|[IVX]{1,4}\.\s|[가-하][.)]\s|제\s?\d+\s?[편장절관조]|[■□▶▷◆◇●◎○※▣]|#{1,4}\s|【|\[)/;
const asHeading = (s) => (s.trim() && !HEADING_LIKE.test(s.trim()) ? `■ ${s.trim()}` : s);
const cellLine = (lines) => lines.filter((x) => x !== '\f').join(' ').replace(/\s+/g, ' ').trim();

// DOCX 스타일: 제목(개요 수준이 있는 스타일, 상속 포함)과 목차 스타일
function docxStyles(doc) {
  const map = new Map();
  for (const s of doc ? byLocal(doc, 'style') : []) {
    const id = s.getAttribute('w:styleId');
    const lvl = kids(kids(s, 'pPr')[0], 'outlineLvl')[0]?.getAttribute('w:val');
    map.set(id, { name: (kids(s, 'name')[0]?.getAttribute('w:val') || '').toLowerCase(), lvl: lvl ?? null, base: kids(s, 'basedOn')[0]?.getAttribute('w:val') });
  }
  const level = (id, depth = 0) => {
    const s = map.get(id);
    if (!s || depth > 10) return null;
    if (s.lvl != null) return Number(s.lvl);
    if (/^(heading\s?\d|title)$/.test(s.name)) return 0;
    return s.base ? level(s.base, depth + 1) : null;
  };
  return { level, toc: (id) => /^(toc\s?\d|toc heading)$/.test(map.get(id)?.name || '') };
}

// DOCX: 문단마다 한 줄(문단 안 줄바꿈 유지), 표는 행마다 칸을 ' | '로 이어 한 줄, 글상자 글은 따로 줄로
// 쪽 나눔(\f): 쪽 나누기와 Word가 저장한 쪽 경계. 목차·삭제 표시된 글자·필드 명령·호환용 대체본(mc:Fallback)은 뺌
const SKIP_W = new Set(['pPr', 'rPr', 'sectPr', 'sdtPr', 'sdtEndPr', 'Fallback', 'delText', 'instrText', 'del', 'moveFrom', 'footnoteReference', 'endnoteReference', 'commentReference']);
function docxText(doc, stylesDoc) {
  const st = docxStyles(stylesDoc);
  const out = [];
  const inline = (node, extra) => {
    let s = '';
    for (const c of node.children) {
      const n = c.localName;
      if (n === 't') s += c.textContent;
      else if (n === 'tab' || n === 'ptab') s += ' ';
      else if (n === 'br') s += c.getAttribute('w:type') === 'page' ? '\f' : '\n';
      else if (n === 'cr') s += '\n';
      else if (n === 'lastRenderedPageBreak') s += '\f';
      else if (n === 'noBreakHyphen') s += '-';
      else if (n === 'txbxContent') blocks(c, extra);
      else if (!SKIP_W.has(n)) s += inline(c, extra);
    }
    return s;
  };
  const para = (p, dst) => {
    const pPr = kids(p, 'pPr')[0];
    const sid = kids(pPr, 'pStyle')[0]?.getAttribute('w:val');
    if (sid && st.toc(sid)) return;
    const own = kids(pPr, 'outlineLvl')[0]?.getAttribute('w:val');
    const lvl = own != null ? Number(own) : st.level(sid);
    const extra = [];
    const s = inline(p, extra);
    dst.push(lvl != null && lvl < 9 ? asHeading(s) : s, ...extra);
  };
  const table = (tbl, dst) => {
    for (const tr of kids(tbl, 'tr')) {
      const cells = kids(tr, 'tc').map((tc) => { const o = []; blocks(tc, o); return cellLine(o); });
      if (cells.some(Boolean)) dst.push(cells.join(' | '));
    }
  };
  const blocks = (node, dst) => {
    for (const el of node.children) {
      const n = el.localName;
      if (n === 'p') para(el, dst);
      else if (n === 'tbl') table(el, dst);
      else if (n === 'sdt') {
        const gallery = byLocal(kids(el, 'sdtPr')[0] || el, 'docPartGallery')[0]?.getAttribute('w:val') || '';
        if (!/table of contents/i.test(gallery)) blocks(kids(el, 'sdtContent')[0] || el, dst);
      } else if (['customXml', 'AlternateContent', 'Choice', 'ins', 'moveTo', 'smartTag'].includes(n)) blocks(el, dst);
    }
  };
  blocks(kids(doc.documentElement, 'body')[0] || doc.documentElement, out);
  return out.join('\n');
}

// HWPX: 문단(hp:p)마다 한 줄(탭·줄바꿈 요소 포함), 표는 행마다 칸을 ' | '로, 글상자 글은 따로 줄로, 각주는 '(주)'로
// 개요(제목) 문단은 '■ '로 표시, 쪽 나누기 문단 앞은 \f. 머리말·꼬리말·차례(목차) 문단은 뺌
const SKIP_H = new Set(['header', 'footer', 'secPr', 'linesegarray', 'pageNum', 'colPr', 'pageHiding', 'newNum', 'script']);
function hwpxText(sec, head) {
  const outline = new Set(), toc = new Set();
  for (const pp of head ? byLocal(head, 'paraPr') : []) {
    if (byLocal(pp, 'heading')[0]?.getAttribute('type') === 'OUTLINE') outline.add(pp.getAttribute('id'));
  }
  for (const s of head ? byLocal(head, 'style') : []) {
    if (/^(차례|목차)/.test(s.getAttribute('name') || '') || /^TOC/i.test(s.getAttribute('engName') || '')) toc.add(s.getAttribute('id'));
  }
  const tText = (t) => {
    let s = '';
    for (const c of t.childNodes) {
      if (c.nodeType === 3) s += c.data;
      else if (c.nodeType === 1) {
        const n = c.localName;
        if (n === 'tab' || n === 'nbSpace' || n === 'fwSpace') s += ' ';
        else if (n === 'lineBreak') s += '\n';
        else if (n === 'hyphen') s += '-';
      }
    }
    return s;
  };
  const para = (p, dst) => {
    if (toc.has(p.getAttribute('styleIDRef'))) return;
    if (p.getAttribute('pageBreak') === '1' && dst.length) dst.push('\f');
    const lines = [], notes = [];
    let cur = '';
    const flush = () => { if (cur.trim()) lines.push(cur); cur = ''; };
    const visit = (node) => {
      for (const c of node.children) {
        const n = c.localName;
        if (n === 't') cur += tText(c);
        else if (n === 'tbl') { flush(); table(c, lines); }
        else if (n === 'footNote' || n === 'endNote') { const o = []; for (const sl of byLocal(c, 'subList')) blocks(sl, o); notes.push(...o.filter((x) => x !== '\f' && x.trim()).map((x) => `(주) ${x}`)); }
        else if (n === 'subList') { flush(); blocks(c, lines); }
        else if (!SKIP_H.has(n)) visit(c);
      }
    };
    visit(p);
    flush();
    if (lines.length && outline.has(p.getAttribute('paraPrIDRef'))) lines[0] = asHeading(lines[0]);
    dst.push(...lines, ...notes);
  };
  const table = (tbl, dst) => {
    for (const tr of kids(tbl, 'tr')) {
      const cells = kids(tr, 'tc').map((tc) => { const o = []; for (const sl of kids(tc, 'subList')) blocks(sl, o); return cellLine(o); });
      if (cells.some(Boolean)) dst.push(cells.join(' | '));
    }
  };
  const blocks = (node, dst) => { for (const el of node.children) if (el.localName === 'p') para(el, dst); };
  const out = [];
  blocks(sec.documentElement, out);
  return out.join('\n');
}

// 쪽 구분(\f)으로 나누고, 쪽 구분이 없거나 한 쪽이 너무 길면 문단 경계에서 PAGE_CHARS 안팎으로 나눔
function paginate(text) {
  const raw = String(text).replace(/\r\n?/g, '\n').replace(/\f[\s\f]*\f/g, '\f').replace(/^[\s\f]+|[\s\f]+$/g, '');
  return raw.split('\f').flatMap((p) => (p.length > PAGE_CHARS * 1.5 ? byLength(p) : [p]));
}

function byLength(raw) {
  const pages = [];
  let cur = '';
  for (const para of raw.split(/\n(?=\s*\n)|\n/)) {
    if (cur.length + para.length > PAGE_CHARS && cur.length > PAGE_CHARS * 0.5) { pages.push(cur); cur = ''; }
    cur += `${para}\n`;
  }
  if (cur.trim()) pages.push(cur);
  return pages;
}

// 글자마다 띄어진 줄(자간을 넓힌 PDF 본문, '인 수 인 계 서'처럼 띄운 제목)은 붙임 — 한 글자 한글이 대부분인 줄만
const unspace = (line) => {
  const toks = line.trim().split(' ');
  const ratio = (re) => toks.filter((t) => re.test(t)).length / toks.length;
  return toks.length >= 6 && ratio(/^.$/u) >= 0.9 && ratio(/^[가-힣]$/) >= 0.5 ? line.replace(/ /g, '') : line;
};
const clean = (p) => p.replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').split('\n').map(unspace).join('\n').replace(/\n{3,}/g, '\n\n').trim();
