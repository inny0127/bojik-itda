import{a as i}from"./chunk-US6JEMIZ.js";var c=()=>{},N=()=>!1,_=T=>String(T).replace(/\/[^/]*$/,"")||"/",n=(...T)=>T.join("/").replace(/\/+/g,"/"),p=n,s=T=>{try{return new URL(T).pathname}catch{return String(T)}},t={mkdirSync:c,existsSync:N,dirname:_,join:n,resolve:p};var I=t.dirname(s(import.meta.url)),L=process.env.BOJIK_DATA_DIR||t.join(I,"..","data"),A=process.env.BOJIK_DB||t.join(L,"bojik.db"),R=`
CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, short TEXT, parent_id TEXT, level TEXT
);
-- \uBCF4\uC9C1(\uC790\uB9AC) = \uB85C\uADF8\uC778 \uACC4\uC815. \uC0AC\uB78C\uC774 \uBC14\uB00C\uC5B4\uB3C4 \uACC4\uC815\uACFC \uC9C0\uC2DD\uC740 \uBCF4\uC9C1\uC5D0 \uB0A8\uB294\uB2E4.
CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY, unit_id TEXT NOT NULL, name TEXT NOT NULL, category TEXT, description TEXT,
  login_id TEXT UNIQUE, pw_salt TEXT, pw_hash TEXT, kind TEXT DEFAULT 'seat'
);
-- \uBCF4\uC9C1\uC790 \uC774\uB825: \uD574\uB2F9 \uBCF4\uC9C1\uC744 \uAC70\uCCD0 \uAC04(\uAC70\uCCD0 \uAC08) \uC0AC\uB78C. status = former | current | incoming
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, rank TEXT, position_id TEXT, status TEXT NOT NULL,
  tenure_start TEXT, tenure_end TEXT, note TEXT
);
CREATE TABLE IF NOT EXISTS access_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT, grantee_position_id TEXT NOT NULL, scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL, permission TEXT NOT NULL, granted_by TEXT, granted_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, position_id TEXT NOT NULL, active_position_id TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, doc_type TEXT NOT NULL, scope TEXT NOT NULL,
  unit_id TEXT, position_id TEXT, version TEXT, issuer TEXT, effective_date TEXT,
  status TEXT DEFAULT 'active', superseded_by TEXT, created_by TEXT, created_at TEXT, summary TEXT
);
CREATE TABLE IF NOT EXISTS doc_chunks (
  id TEXT PRIMARY KEY, doc_id TEXT NOT NULL, seq INTEGER, heading TEXT, text TEXT NOT NULL, facts TEXT
);
CREATE TABLE IF NOT EXISTS knowledge_units (
  id TEXT PRIMARY KEY, position_id TEXT NOT NULL, task_key TEXT, title TEXT, raw_text TEXT,
  structure TEXT, status TEXT NOT NULL, version INTEGER DEFAULT 1, supersedes TEXT,
  author_id TEXT, approver_id TEXT, created_at TEXT, approved_at TEXT, updated_at TEXT,
  source TEXT, extractor TEXT, confidence REAL
);
CREATE TABLE IF NOT EXISTS ku_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ku_id TEXT NOT NULL, action TEXT NOT NULL,
  actor_id TEXT, at TEXT, note TEXT, diff TEXT
);
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY, position_id TEXT, type TEXT NOT NULL, key TEXT, label TEXT NOT NULL, props TEXT
);
CREATE TABLE IF NOT EXISTS edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT, position_id TEXT, src TEXT NOT NULL, dst TEXT NOT NULL,
  type TEXT NOT NULL, props TEXT, ku_id TEXT
);
CREATE TABLE IF NOT EXISTS conflicts (
  id TEXT PRIMARY KEY, position_id TEXT NOT NULL, rule_code TEXT, severity TEXT, task_key TEXT,
  title TEXT, description TEXT, ku_a TEXT, ku_b TEXT, doc_chunk TEXT, evidence TEXT,
  ai_analysis TEXT, status TEXT DEFAULT 'open', detected_by TEXT, fingerprint TEXT,
  created_at TEXT, resolved_by TEXT, resolved_at TEXT, resolution TEXT, resolution_note TEXT
);
CREATE TABLE IF NOT EXISTS qa_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, position_id TEXT, question TEXT,
  answer TEXT, citations TEXT, trace TEXT, mode TEXT, feedback TEXT, at TEXT
);
CREATE TABLE IF NOT EXISTS access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, seat_id TEXT, holder_id TEXT, action TEXT, target TEXT,
  allowed INTEGER, detail TEXT, at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ku_pos ON knowledge_units(position_id, status);
CREATE INDEX IF NOT EXISTS idx_edges_pos ON edges(position_id);
CREATE INDEX IF NOT EXISTS idx_nodes_pos ON nodes(position_id);
CREATE INDEX IF NOT EXISTS idx_conf_pos ON conflicts(position_id, status);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON doc_chunks(doc_id);
`,X=2,e,a;function u(T=A){if(e&&a===T)return e;if(a=T,T!==":memory:"&&t.mkdirSync(t.dirname(T),{recursive:!0}),e=new i(T),e.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;"),(e.prepare("PRAGMA user_version").get().user_version||0)<X){for(let{name:E}of e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all())e.exec(`DROP TABLE IF EXISTS ${E}`);e.exec(`PRAGMA user_version = ${X}`)}return e.exec(R),e}function o(){return e||u(),e}var m=(T,...E)=>o().prepare(T).all(...E),g=(T,...E)=>o().prepare(T).get(...E),C=(T,...E)=>o().prepare(T).run(...E);function M(T){let E=o();E.exec("BEGIN");try{let r=T();return E.exec("COMMIT"),r}catch(r){throw E.exec("ROLLBACK"),r}}var f=()=>new Date().toISOString(),d=null,y=T=>{d=T},F=()=>{try{d?.()}catch{}};function Y(T){return`${T}-${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`}var k=(T,E=null)=>{if(T==null)return E;try{return JSON.parse(T)}catch{return E}};export{s as a,t as b,L as c,A as d,u as e,o as f,m as g,g as h,C as i,M as j,f as k,y as l,F as m,Y as n,k as o};
