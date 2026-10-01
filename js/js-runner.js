// Executa JavaScript "puro" (sem página) num Web Worker, como um console tipo Node.
//
// Cada arquivo .js do projeto vira um módulo ES (blob URL). Imports relativos entre
// arquivos ("./util.js") são reescritos para a blob URL correspondente.
// O worker não tem DOM nem acesso à interface da IDE; a comunicação é via postMessage.
// Um loop infinito não trava a IDE: Parar encerra o worker.

import { FMT_SOURCE } from './fmt-source.js';

// URL absoluta: o código de partida roda numa blob URL, onde caminhos relativos não funcionam.
const OUT_BATCH_URL = new URL('./out-batch.js', import.meta.url).href;

// Código de partida do worker: redireciona console/erros e importa o arquivo de entrada.
// A saída do console vai agrupada (out-batch.js); erros e o fim enviam antes o que está pendente.
const BOOT = `
import { createBatcher } from '${OUT_BATCH_URL}';
${FMT_SOURCE}
const batcher = createBatcher((msg) => postMessage(msg));
const send = (msg) => { batcher.flush(); postMessage(msg); };
for (const m of ['log', 'info', 'warn', 'error', 'debug']) {
  console[m] = (...args) => batcher.push(m === 'debug' ? 'log' : m, args.map(fmt).join(' '));
}
const describe = (e) => (e instanceof Error ? e.name + ': ' + e.message : fmt(e));
self.addEventListener('error', (e) => {
  e.preventDefault();
  send({ type: 'error', text: 'Uncaught ' + (e.error ? describe(e.error) : e.message), stack: e.error?.stack, url: e.filename, line: e.lineno });
});
self.addEventListener('unhandledrejection', (e) => {
  e.preventDefault();
  send({ type: 'error', text: 'Promise rejeitada sem tratamento: ' + describe(e.reason), stack: e.reason?.stack });
});
self.onmessage = async (e) => {
  try {
    await import(e.data.entry);
    send({ type: 'done', ok: true });
  } catch (err) {
    send({ type: 'error', text: 'Uncaught ' + describe(err), stack: err?.stack });
    send({ type: 'done', ok: false });
  }
};
`;

// import ... from './x.js' | import './x.js' | export ... from './x.js' | import('./x.js')
const IMPORT_RE = /(\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"]+)\2/g;

const cleanPath = (p) => p.replace(/^\.\//, '');

// Cria as blob URLs dos módulos, na ordem de dependência.
function buildModules(files) {
  const byName = new Map(files.map((f) => [f.name, f]));
  const urls = new Map(); // nome -> blob URL
  const visiting = new Set();

  function urlOf(name, importer) {
    if (urls.has(name)) return urls.get(name);
    const file = byName.get(name);
    if (!file) throw new Error(`${importer} importa "./${name}", mas esse arquivo não existe no projeto.`);
    if (visiting.has(name)) throw new Error(`Importação circular envolvendo ${name}. Reorganize os imports entre os arquivos.`);
    visiting.add(name);
    const code = file.content.replace(IMPORT_RE, (match, prefix, quote, spec) => {
      // Só reescreve caminhos relativos para arquivos do projeto; o resto fica como está.
      if (!spec.startsWith('./')) return match;
      return `${prefix}${quote}${urlOf(cleanPath(spec), name)}${quote}`;
    });
    visiting.delete(name);
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    urls.set(name, url);
    return url;
  }

  return { urlOf, urls };
}

// onOutput(level, text): erro ou aviso avulso. onBatch(lines, dropped): saída agrupada do console.
export function createJsRunner({ onOutput, onBatch }) {
  let worker = null;
  let urls = new Map();
  let pending = null;

  // Troca blob URLs por nomes de arquivo e acha a 1ª linha do projeto no stack.
  function locate(stack, url, line) {
    const names = new Map([...urls].map(([name, u]) => [u, name]));
    if (url && names.has(url) && line) return { file: names.get(url), line };
    for (const m of String(stack ?? '').matchAll(/(blob:[^\s)]+?):(\d+):\d+/g)) {
      if (names.has(m[1])) return { file: names.get(m[1]), line: Number(m[2]) };
    }
    return null;
  }

  function cleanup() {
    if (worker) worker.terminate();
    worker = null;
    for (const u of urls.values()) URL.revokeObjectURL(u);
    urls = new Map();
  }

  function finish(ok) {
    const p = pending;
    pending = null;
    p?.resolve(ok);
  }

  // Retorna Promise<boolean>: true se o arquivo de entrada terminou de executar sem erro.
  // O worker continua vivo depois disso (timers, promises) até stop() ou nova execução.
  function run(files, entry) {
    stop();
    let modules;
    try {
      modules = buildModules(files);
      modules.urlOf(entry, entry);
    } catch (err) {
      for (const u of modules?.urls.values() ?? []) URL.revokeObjectURL(u);
      onOutput('error', err.message);
      return Promise.resolve(false);
    }
    urls = modules.urls;

    const bootUrl = URL.createObjectURL(new Blob([BOOT], { type: 'text/javascript' }));
    const w = new Worker(bootUrl, { type: 'module' });
    URL.revokeObjectURL(bootUrl);
    worker = w;

    w.onmessage = (e) => {
      if (worker !== w) return;
      const msg = e.data;
      if (msg.type === 'batch') onBatch(msg.lines, msg.dropped);
      else if (msg.type === 'error') {
        const loc = locate(msg.stack, msg.url, msg.line);
        onOutput('error', loc ? `${msg.text} (${loc.file}, linha ${loc.line})` : msg.text);
      } else if (msg.type === 'done') finish(msg.ok);
    };
    w.onerror = (e) => {
      e.preventDefault();
      if (worker !== w) return;
      onOutput('error', e.message || 'Falha ao iniciar o JavaScript.');
      finish(false);
    };

    return new Promise((resolve) => {
      pending = { resolve };
      w.postMessage({ entry: urls.get(entry) });
    });
  }

  // Encerra o worker (loop infinito, timers). Retorna true se havia algo rodando.
  function stop() {
    const wasRunning = worker !== null;
    cleanup();
    finish(false);
    return wasRunning;
  }

  return {
    run,
    stop,
    get active() { return worker !== null; },
    get busy() { return pending !== null; },
  };
}
