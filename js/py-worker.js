// Web Worker que executa Python com Pyodide (CPython compilado para WebAssembly).
// Roda fora da thread da interface: um loop infinito não trava a IDE e pode ser
// interrompido com worker.terminate() (ver python.js).
//
// Protocolo:
//   IDE -> worker: { type: 'preload' }  (carrega o runtime em segundo plano, sem responder)
//                  { type: 'run', files: [{ name, content }], entry }
//                  { type: 'input-reply', value }  (resposta a um input())
//   worker -> IDE: { type: 'status', state: 'loading' | 'running' }
//                  { type: 'batch', lines: [{ level, text }], dropped }  (saída agrupada)
//                  { type: 'input', prompt }        (input() aguardando o usuário)
//                  { type: 'done', ok }
//                  { type: 'fatal', text }   (runtime não pôde ser carregado)

import { createBatcher } from './out-batch.js';

const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';

// Pasta (no sistema de arquivos em memória do Pyodide) onde os arquivos do projeto
// são gravados antes de cada execução. Permite "import util" e open("dados.txt").
const PROJECT_DIR = '/home/pyodide/projeto';

// Executa o arquivo de entrada num namespace limpo e imprime um traceback
// sem os frames internos da IDE.
//
// input(): o Python pausa com run_sync() até a IDE responder. Isso usa JSPI
// (JavaScript Promise Integration do WebAssembly), disponível no Chrome/Edge
// recentes. Sem JSPI, input() lança um erro explicativo.
const SETUP = `
import builtins, importlib, os, sys, traceback
from pyodide.ffi import can_run_sync, run_sync

_PROJECT_DIR = '${PROJECT_DIR}'

def _ide_input(prompt=''):
    if not can_run_sync():
        raise RuntimeError("input() não é suportado neste navegador (requer JSPI, disponível no Chrome e no Edge recentes). Defina os valores direto no código.")
    # Envia ao JS a saída pendente (ex.: print(..., end='')); ela aparece antes do prompt.
    sys.stdout.flush()
    return run_sync(_ide_request_input(str(prompt)))

builtins.input = _ide_input

def _ide_run(entry):
    os.chdir(_PROJECT_DIR)
    if _PROJECT_DIR not in sys.path:
        sys.path.insert(0, _PROJECT_DIR)
    # Módulos do projeto importados numa execução anterior: força reimportar a versão nova.
    for name, mod in list(sys.modules.items()):
        if (getattr(mod, '__file__', None) or '').startswith(_PROJECT_DIR + '/'):
            del sys.modules[name]
    importlib.invalidate_caches()
    ns = {'__name__': '__main__', '__file__': os.path.join(_PROJECT_DIR, entry)}
    try:
        with open(entry, encoding='utf-8') as f:
            code = f.read()
        exec(compile(code, entry, 'exec'), ns)
        return True
    except SystemExit:
        return True
    except BaseException as e:
        sys.stdout.flush()
        tb = e.__traceback__
        if tb is not None and tb.tb_frame.f_code.co_name == '_ide_run':
            tb = tb.tb_next
        text = ''.join(traceback.format_exception(type(e), e, tb))
        sys.stderr.write(text.replace(_PROJECT_DIR + '/', ''))
        return False
    finally:
        sys.stdout.flush()
`;

let pyodidePromise = null;
let runtimeReady = false;
let pendingInput = null; // resolve() do input() aguardando resposta

// stdout com buffer de linha próprio: o modo "batched" do Pyodide segura a
// linha incompleta até vir uma quebra de linha, e aí print(..., end='') não
// apareceria antes do input().
const decoder = new TextDecoder();
let stdoutPartial = '';

function writeStdout(buffer) {
  const lines = (stdoutPartial + decoder.decode(buffer, { stream: true })).split('\n');
  stdoutPartial = lines.pop();
  for (const text of lines) post('stdout', { text });
  return buffer.length;
}

function flushStdout() {
  if (stdoutPartial) post('stdout', { text: stdoutPartial });
  stdoutPartial = '';
}

// Chamada pelo Python (input). Resolve quando a IDE envia 'input-reply'.
// A linha incompleta do stdout vira o início do prompt, como num terminal.
function requestInput(prompt) {
  return new Promise((resolve) => {
    pendingInput = resolve;
    post('input', { prompt: stdoutPartial + prompt });
    stdoutPartial = '';
  });
}

const hasJSPI = typeof WebAssembly.Suspending === 'function';

// Saída do programa vai agrupada (ver out-batch.js); o resto sai na hora,
// depois de enviar a saída pendente, para manter a ordem.
const OUTPUT_LEVELS = { stdout: 'log', stderr: 'error', info: 'info' };
const batcher = createBatcher((msg) => self.postMessage(msg));

function post(type, payload = {}) {
  if (OUTPUT_LEVELS[type]) {
    batcher.push(OUTPUT_LEVELS[type], payload.text);
    return;
  }
  batcher.flush();
  self.postMessage({ type, ...payload });
}

function loadRuntime() {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      // Pyodide 314+ só funciona em module worker (não aceita importScripts).
      // import() dinâmico para que falhas de rede caiam no catch abaixo.
      const { loadPyodide } = await import(`${PYODIDE_URL}pyodide.mjs`);
      const pyodide = await loadPyodide({ indexURL: PYODIDE_URL });
      // isatty: o Python usa buffer de linha (como num terminal) em vez de buffer de bloco.
      pyodide.setStdout({ write: writeStdout, isatty: true });
      pyodide.setStderr({ batched: (text) => { flushStdout(); post('stderr', { text }); } });
      pyodide.globals.set('_ide_request_input', requestInput);
      pyodide.runPython(SETUP);
      runtimeReady = true;
      return pyodide;
    })();
    // Permite tentar de novo na próxima execução se o carregamento falhar.
    pyodidePromise.catch(() => { pyodidePromise = null; });
  }
  return pyodidePromise;
}

// Grava os arquivos do projeto, apagando os da execução anterior.
function writeProject(pyodide, files) {
  const FS = pyodide.FS;
  FS.mkdirTree(PROJECT_DIR);
  for (const name of FS.readdir(PROJECT_DIR)) {
    if (name === '.' || name === '..') continue;
    const path = `${PROJECT_DIR}/${name}`;
    if (FS.isFile(FS.stat(path).mode)) FS.unlink(path);
  }
  for (const f of files) FS.writeFile(`${PROJECT_DIR}/${f.name}`, f.content);
}

self.onmessage = async (e) => {
  const { type, files, entry, value } = e.data || {};
  if (type === 'input-reply') {
    const resolve = pendingInput;
    pendingInput = null;
    resolve?.(String(value));
    return;
  }
  // Pré-carregamento (modo Python aberto): sem status nem mensagens; erros ficam para a execução.
  if (type === 'preload') {
    loadRuntime().catch(() => {});
    return;
  }
  if (type !== 'run') return;

  let pyodide;
  try {
    // Runtime ainda não pronto (1ª vez ou pré-carregamento em andamento): avisa a espera.
    if (!runtimeReady) post('status', { state: 'loading' });
    pyodide = await loadRuntime();
    post('status', { state: 'running' });
  } catch (err) {
    post('fatal', { text: `Runtime Python indisponível. Verifique sua conexão com a internet e tente de novo. (${err.message})` });
    post('done', { ok: false });
    return;
  }

  try {
    writeProject(pyodide, files);
    // Baixa pacotes da distribuição Pyodide usados em "import" (ex.: numpy).
    const allCode = files.filter((f) => f.name.endsWith('.py')).map((f) => f.content).join('\n');
    await pyodide.loadPackagesFromImports(allCode, {
      messageCallback: (msg) => post('info', { text: msg }),
      errorCallback: (msg) => post('stderr', { text: msg }),
    });
    const run = pyodide.globals.get('_ide_run');
    // callPromising permite que run_sync (input) suspenda a execução.
    const ok = hasJSPI ? await run.callPromising(entry) : run(entry);
    run.destroy();
    flushStdout();
    post('done', { ok: ok === true });
  } catch (err) {
    // Erros fora do código do usuário (ex.: falha ao baixar pacote).
    post('stderr', { text: String(err.message || err) });
    post('done', { ok: false });
  }
};
