// Web Worker que executa SQL com sql.js (SQLite compilado para WebAssembly).
// Cada execução usa um banco novo, em memória: o script roda inteiro do zero.
// Roda fora da thread da interface: uma consulta sem fim pode ser interrompida
// com worker.terminate() (ver sql.js).
//
// Protocolo:
//   IDE -> worker: { type: 'run', sql }
//   worker -> IDE: { type: 'status', state: 'loading' | 'running' }
//                  { type: 'batch', lines: [{ level, text }], dropped }  (saída agrupada;
//                                    level 'table': text = { columns, rows, more })
//                  { type: 'done', ok }
//                  { type: 'fatal', text }   (runtime não pôde ser carregado)

import { createBatcher } from './out-batch.js';

const SQLJS_URL = 'https://cdn.jsdelivr.net/npm/sql.js@1.14.2/dist/';

// Linhas exibidas por consulta; o resto só é contado.
const MAX_ROWS = 500;

const batcher = createBatcher((msg) => self.postMessage(msg));

function post(type, payload = {}) {
  batcher.flush();
  self.postMessage({ type, ...payload });
}

let sqlPromise = null;
let runtimeReady = false;

function loadRuntime() {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      // sql-wasm.js é um script clássico (não é módulo ES) e module workers não têm importScripts:
      // baixa o texto e extrai a função initSqlJs que ele define.
      const res = await fetch(`${SQLJS_URL}sql-wasm.js`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const initSqlJs = new Function(`${await res.text()}\nreturn initSqlJs;`)();
      const SQL = await initSqlJs({ locateFile: (file) => SQLJS_URL + file });
      runtimeReady = true;
      return SQL;
    })();
    // Permite tentar de novo na próxima execução se o carregamento falhar.
    sqlPromise.catch(() => { sqlPromise = null; });
  }
  return sqlPromise;
}

// Valor de uma célula como texto. null fica null (a tabela mostra NULL).
function cell(v) {
  if (v === null) return null;
  if (v instanceof Uint8Array) return `<blob de ${v.length} bytes>`;
  return String(v);
}

const lineAt = (sql, pos) => sql.slice(0, pos).split('\n').length;

// Posição do início do próximo comando (pula espaços e comentários).
function skipBlank(sql, pos) {
  for (;;) {
    const rest = sql.slice(pos);
    const m = rest.match(/^(\s+|--[^\n]*|\/\*[\s\S]*?\*\/)/);
    if (!m) return pos;
    pos += m[0].length;
  }
}

function runScript(SQL, sql) {
  const db = new SQL.Database();
  const it = db.iterateStatements(sql);
  let start = skipBlank(sql, 0); // início do comando atual, para a linha do erro
  try {
    for (const stmt of it) {
      const columns = stmt.getColumnNames();
      if (columns.length) {
        const rows = [];
        let more = 0;
        while (stmt.step()) {
          if (rows.length < MAX_ROWS) rows.push(stmt.get().map(cell));
          else more++;
        }
        batcher.push('table', { columns, rows, more });
      } else {
        stmt.step();
        const n = db.getRowsModified();
        const text = stmt.getSQL();
        const kind = text.slice(skipBlank(text, 0)).split(/\s+/)[0].toUpperCase();
        // getRowsModified só vale para INSERT/UPDATE/DELETE; nos outros mostra só "OK".
        if (['INSERT', 'UPDATE', 'DELETE', 'REPLACE'].includes(kind)) {
          batcher.push('info', `${kind}: ${n} ${n === 1 ? 'linha afetada' : 'linhas afetadas'}`);
        } else {
          batcher.push('info', `${kind}: OK`);
        }
      }
      stmt.free();
      start = skipBlank(sql, sql.length - it.getRemainingSQL().length);
    }
    return true;
  } catch (err) {
    batcher.push('error', `Erro na linha ${lineAt(sql, start)}: ${err.message}`);
    return false;
  } finally {
    db.close();
  }
}

self.onmessage = async (e) => {
  const { type, sql } = e.data || {};
  if (type !== 'run') return;

  let SQL;
  try {
    if (!runtimeReady) post('status', { state: 'loading' });
    SQL = await loadRuntime();
    post('status', { state: 'running' });
  } catch (err) {
    post('fatal', { text: `SQLite indisponível. Verifique sua conexão com a internet e tente de novo. (${err.message})` });
    post('done', { ok: false });
    return;
  }

  const ok = runScript(SQL, sql);
  post('done', { ok });
};
