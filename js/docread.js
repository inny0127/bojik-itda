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
  else if (ext === 'docx') pages = paginate(await readZipXml(buf, (f) => f === 'word/document.xml', docxText));
  else if (ext === 'hwpx') pages = paginate(await readZipXml(buf, (f) => /^Contents\/section\d+\.xml$/i.test(f), hwpxText));
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

async function readZipXml(buf, pick, toText) {
  const { unzipSync } = await import(`${VENDOR}fflate/fflate.js`);
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => pick(f.name) });
  const names = Object.keys(files).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!names.length) throw new Error('문서 본문을 찾지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요.');
  return names.map((n) => toText(new DOMParser().parseFromString(new TextDecoder('utf-8').decode(files[n]), 'application/xml'))).join('\f');
}

const byLocal = (root, name) => [...root.getElementsByTagName('*')].filter((e) => e.localName === name);

// DOCX: 문단(w:p)마다 한 줄, 표는 칸을 ' | '로 이어 한 줄, 쪽 나눔은 \f
function docxText(xml) {
  const body = byLocal(xml, 'body')[0] || xml.documentElement;
  const out = [];
  const para = (p) => {
    let s = '';
    for (const e of p.getElementsByTagName('*')) {
      if (e.localName === 't') s += e.textContent;
      else if (e.localName === 'tab') s += ' ';
      else if (e.localName === 'br' && e.getAttribute('w:type') === 'page') s += '\f';
    }
    return s;
  };
  for (const el of body.children) {
    if (el.localName === 'p') out.push(para(el));
    else if (el.localName === 'tbl') {
      for (const tr of byLocal(el, 'tr')) out.push(byLocal(tr, 'tc').map((tc) => byLocal(tc, 'p').map(para).join(' ').trim()).join(' | '));
    }
  }
  return out.join('\n');
}

// HWPX: 문단(hp:p)의 글자(hp:t)를 한 줄로
function hwpxText(xml) {
  return byLocal(xml, 'p').filter((p) => !byLocal(p, 'p').length).map((p) => byLocal(p, 't').map((t) => t.textContent).join('')).join('\n');
}

// 쪽 구분(\f)이 없으면 문단 경계에서 PAGE_CHARS 안팎으로 나눔
function paginate(text) {
  const raw = String(text).replace(/\r\n?/g, '\n');
  if (raw.includes('\f')) return raw.split('\f');
  const pages = [];
  let cur = '';
  for (const para of raw.split(/\n(?=\s*\n)|\n/)) {
    if (cur.length + para.length > PAGE_CHARS && cur.length > PAGE_CHARS * 0.5) { pages.push(cur); cur = ''; }
    cur += `${para}\n`;
  }
  if (cur.trim()) pages.push(cur);
  return pages;
}

const clean = (p) => p.replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
