// Preview de HTML/CSS/JS em iframe isolado.
//
// Segurança: sandbox="allow-scripts allow-modals allow-forms", SEM allow-same-origin.
// O documento do iframe tem origem opaca: o código do usuário não acessa o DOM,
// os cookies nem o localStorage da IDE. A única comunicação é via postMessage.

import { FMT_SOURCE } from './fmt-source.js';
import { createBatcher } from './out-batch.js';

// Script injetado antes do código do usuário: redireciona console e erros para a IDE.
// Os argumentos são serializados aqui porque postMessage não clona funções nem nós do DOM.
// A saída do console vai agrupada (out-batch.js, mesmo código dos workers); erros
// enviam antes o que está pendente, para manter a ordem.
const BRIDGE = `<script>
(function () {
${FMT_SOURCE}
  ${createBatcher.toString()}
  function post(msg) {
    msg.__ide = true;
    try { parent.postMessage(msg, '*'); } catch (e) {}
  }
  var batcher = createBatcher(post);
  function send(level, args, extra) {
    batcher.flush();
    post({ level: level, args: Array.prototype.map.call(args, fmt), line: extra && extra.line });
  }
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (m) {
    var orig = console[m];
    console[m] = function () {
      batcher.push(m === 'debug' ? 'log' : m, Array.prototype.map.call(arguments, fmt).join(' '));
      orig.apply(console, arguments);
    };
  });
  window.addEventListener('error', function (e) {
    send('error', [e.message || 'Erro desconhecido'], { line: e.lineno });
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    send('error', ['Promise rejeitada sem tratamento: ' + (r instanceof Error ? r.name + ': ' + r.message : fmt(r))]);
  });
})();
<\/script>`;

// Impede que "</script>" dentro do JS do usuário feche a tag antes da hora.
// "<\/script" é equivalente dentro de strings, regex e comentários.
const escapeScript = (code) => code.replace(/<\/script/gi, '<\\/script');
// Mesmo problema com "</style>" no CSS; "\/" é um escape válido em CSS.
const escapeStyle = (code) => code.replace(/<\/style/gi, '<\\/style');

// Referências a arquivos do projeto no HTML do usuário. São embutidas no lugar,
// porque o iframe (srcdoc, origem opaca) não consegue buscar style.css ou script.js.
const LINK_RE = /<link\b[^>]*>/gi;
const SCRIPT_SRC_RE = /<script\b([^>]*?)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script\s*>/gi;
const HREF_RE = /\bhref\s*=\s*["']([^"']+)["']/i;
const STYLESHEET_RE = /\brel\s*=\s*["']?stylesheet\b/i;

const cleanPath = (p) => p.trim().replace(/^\.\//, '');
const newlines = (s) => s.split('\n').length - 1;

// Monta o documento do preview a partir dos arquivos do modo web.
// Retorna { doc, segments }: segments guarda de qual arquivo/linha veio cada trecho,
// para traduzir o número de linha dos erros para o arquivo do editor.
export function buildDocument(files) {
  const byName = new Map(files.map((f) => [f.name, f]));
  const ofType = (ext) => files.filter((f) => f.name.toLowerCase().endsWith(ext));
  const htmlFile = byName.get('index.html') ?? ofType('.html')[0] ?? null;
  const html = htmlFile?.content ?? '';

  // Encontra as tags que apontam para CSS/JS do projeto.
  const refs = [];
  for (const m of html.matchAll(LINK_RE)) {
    const href = m[0].match(HREF_RE)?.[1];
    const file = href && byName.get(cleanPath(href));
    if (file && STYLESHEET_RE.test(m[0]) && file.name.endsWith('.css')) {
      refs.push({ index: m.index, length: m[0].length, file, open: '<style>\n', close: '\n</style>' });
    }
  }
  for (const m of html.matchAll(SCRIPT_SRC_RE)) {
    const file = byName.get(cleanPath(m[2]));
    if (file && file.name.endsWith('.js')) {
      refs.push({ index: m.index, length: m[0].length, file, open: `<script${m[1]}${m[3]}>\n`, close: '\n<\/script>' });
    }
  }
  refs.sort((a, b) => a.index - b.index);
  const used = new Set(refs.map((r) => r.file));

  const segments = []; // { text, file?, line? } — line: linha do arquivo onde o trecho começa
  const push = (text, file = null, line = 1) => segments.push({ text, file, line });
  const pushCode = (file) => push(file.name.endsWith('.css') ? escapeStyle(file.content) : escapeScript(file.content), file.name);

  // O doctype precisa ser o primeiro item; o resto vai depois da ponte do console.
  let cursor = 0;
  const doctype = html.match(/^\s*<!doctype[^>]*>/i);
  if (doctype) {
    push(doctype[0], htmlFile.name);
    cursor = doctype[0].length;
  } else {
    push('<!doctype html>');
  }
  push(`\n<meta name="viewport" content="width=device-width, initial-scale=1">\n${BRIDGE}\n`);

  // CSS não referenciado pelo HTML: incluído no início (cai no <head>).
  for (const file of ofType('.css')) {
    if (used.has(file)) continue;
    push('<style>\n');
    pushCode(file);
    push('\n</style>\n');
  }

  // HTML do usuário, com as referências substituídas pelo conteúdo dos arquivos.
  let line = 1 + newlines(html.slice(0, cursor));
  for (const ref of refs) {
    if (ref.index < cursor) continue;
    const piece = html.slice(cursor, ref.index);
    push(piece, htmlFile.name, line);
    line += newlines(piece) + newlines(html.slice(ref.index, ref.index + ref.length));
    push(ref.open);
    pushCode(ref.file);
    push(ref.close);
    cursor = ref.index + ref.length;
  }
  push(html.slice(cursor), htmlFile?.name ?? null, line);

  // JS não referenciado: incluído no fim (cai no <body>, depois do HTML).
  for (const file of ofType('.js')) {
    if (used.has(file)) continue;
    push('\n<script>\n');
    pushCode(file);
    push('\n<\/script>');
  }

  // Linha inicial de cada trecho no documento final.
  let docLine = 1;
  for (const seg of segments) {
    seg.start = docLine;
    seg.end = docLine + newlines(seg.text);
    docLine = seg.end;
  }

  return { doc: segments.map((s) => s.text).join(''), segments };
}

// Traduz a linha do documento do preview para { file, line } do projeto.
export function locate(segments, docLine) {
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg.file && seg.text && docLine >= seg.start && docLine <= seg.end) {
      return { file: seg.file, line: seg.line + docLine - seg.start };
    }
  }
  return null;
}

// onMessage(level, args): mensagem avulsa (erros). onBatch(lines, dropped): saída agrupada do console.
export function createPreview(host, onMessage, onBatch) {
  let iframe = null;
  let segments = [];

  function describeLine(line) {
    const loc = line ? locate(segments, line) : null;
    return loc ? ` (${loc.file}, linha ${loc.line})` : '';
  }

  window.addEventListener('message', (e) => {
    // Só aceita mensagens do iframe atual (descarta outras janelas e iframes antigos).
    if (!iframe || e.source !== iframe.contentWindow) return;
    const data = e.data;
    if (!data || data.__ide !== true) return;
    if (data.type === 'batch') {
      if (Array.isArray(data.lines)) onBatch(data.lines.map((l) => ({ level: l.level, text: String(l.text) })), Number(data.dropped) || 0);
      return;
    }
    if (!Array.isArray(data.args)) return;

    const args = data.args.map(String);
    if (data.level === 'error' && data.line) args[args.length - 1] += describeLine(data.line);
    onMessage(data.level, args);
  });

  // files: arquivos do modo web ({ name, content }).
  function run(files) {
    const built = buildDocument(files);
    segments = built.segments;

    // Recria o iframe a cada execução: estado limpo e encerra timers/loops anteriores.
    stop();
    iframe = document.createElement('iframe');
    iframe.className = 'preview-frame';
    iframe.title = 'Resultado';
    // allow-forms: sem ele o navegador bloqueia o envio antes do evento submit,
    // e um handler com preventDefault() nunca roda.
    iframe.setAttribute('sandbox', 'allow-scripts allow-modals allow-forms');
    iframe.srcdoc = built.doc;
    host.appendChild(iframe);
  }

  function stop() {
    if (iframe) iframe.remove();
    iframe = null;
  }

  return { run, stop };
}
