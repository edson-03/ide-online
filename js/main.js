// Ponto de entrada: liga os componentes da IDE.

import { createProject, MODES, langOf, modeOfName } from './project.js';
import { createEditor } from './editor.js';
import { createFilesUI } from './files-ui.js';
import { createConsole } from './console.js';
import { createPreview } from './preview.js';
import { createPython } from './python.js';
import { canFormat, formatCode } from './format.js';
import { loadState, saveState } from './storage.js';
import { initResizers } from './resizer.js';
import { downloadFile, downloadZip, readImports } from './transfer.js';
import { createLangPicker, LANG_ICONS } from './lang-picker.js';
import { createJsRunner } from './js-runner.js';
import { askConfirm } from './confirm.js';

const $ = (id) => document.getElementById(id);

const status = $('status');
const btnRun = $('btn-run');
const btnStop = $('btn-stop');
const btnFormat = $('btn-format');
const btnClear = $('btn-clear');
const btnDownload = $('btn-download');

const STATUS_TEXT = {
  ready: 'Pronto',
  loading: 'Carregando runtime Python (~10 MB, só na 1ª vez)…',
  running: 'Executando…',
  input: 'Aguardando entrada no console…',
  error: 'Erro',
};

function setStatus(state) {
  status.dataset.state = state;
  status.textContent = STATUS_TEXT[state];
}

const consoleCount = $('console-count');
const ideConsole = createConsole($('console-output'), {
  onCount: (n) => { consoleCount.textContent = n ? `(${n})` : ''; },
});
$('btn-console-clear').addEventListener('click', ideConsole.clear);

// Service worker (sw.js): deixa prompt()/input() esperarem de forma síncrona nos workers.
// Só existe em localhost/HTTPS; sem ele, prompt() exige await e input() depende de JSPI.
navigator.serviceWorker?.register('sw.js').catch(() => {});

// Restaura o último projeto (ou cria o exemplo padrão).
const saved = loadState();
const project = createProject(saved);

// ---------- Tema ----------

const btnTheme = $('btn-theme');
let theme = saved?.theme === 'dark' ? 'dark' : 'light';

function applyTheme() {
  document.documentElement.dataset.theme = theme;
  btnTheme.querySelector('use').setAttribute('href', theme === 'dark' ? '#i-moon' : '#i-sun');
  btnTheme.querySelector('span').textContent = theme === 'dark' ? 'Escuro' : 'Claro';
}

applyTheme();

// ---------- Editor e arquivos ----------

const editor = createEditor($('editor-host'), {
  theme,
  onChange: (id, value) => project.setContent(id, value),
});

if (!editor.hasCodeMirror) {
  status.dataset.state = 'error';
  status.textContent = 'Editor simples';
  ideConsole.warn('O editor avançado (CodeMirror) não carregou. Verifique sua conexão. Usando editor simples, sem destaque de sintaxe.');
}

const filesUI = createFilesUI({
  project,
  listEl: $('file-list'),
  tabsEl: $('file-tabs'),
  onError: (msg) => {
    setConsoleOpen(true);
    ideConsole.error(msg);
  },
});

const HINTS = {
  web: 'index.html é a página. CSS e JS do projeto são incluídos nela ao executar.',
  node: 'Executar roda o main.js, sem página (a saída vai para o console). Use import/export entre arquivos: import { f } from "./util.js".',
  python: 'Executar roda o main.py. Outros .py podem ser importados (import util) e arquivos .txt/.csv/.json lidos com open().',
};

let shownMode = null; // modo exibido na última atualização da interface

// Atualiza tudo que depende do modo e do arquivo ativo.
function refreshUI() {
  const mode = project.mode;
  const file = project.activeFile();
  document.documentElement.dataset.mode = mode;
  document.documentElement.dataset.output = MODES[mode].output;
  $('lang-btn-icon').innerHTML = LANG_ICONS[mode]; // SVG fixo de lang-picker.js
  $('lang-btn-name').textContent = MODES[mode].label;
  $('explorer-hint').textContent = HINTS[mode];
  filesUI.render();
  if (!file || file.id !== editor.current) editor.show(file);
  updateFileButtons();
  // Fora do modo web o preview fica oculto: encerra para os timers não escreverem no console.
  if (mode !== 'web' && previewActive) stopPreview();
  // Trocou de linguagem: a saída da anterior não vale mais (exceto Python ainda rodando).
  if (shownMode && shownMode !== mode) {
    if (!python.busy) ideConsole.clear();
    // Cada linguagem tem seus próprios arquivos: deixa claro que nada foi perdido.
    ideConsole.info(`Mostrando os arquivos de ${MODES[mode].label}. Seu código ${MODES[shownMode].label} continua salvo: escolha ${MODES[shownMode].label} de novo para voltar a ele.`);
  }
  shownMode = mode;
  // Modo Python aberto: já carrega o runtime (~10 MB) para a 1ª execução não esperar.
  if (mode === 'python') python.preload();
  updateRun();
  updateStop();
}

project.onChange(({ type, id }) => {
  // Documento em cache desatualizado (apagado, substituído ou com outra extensão):
  // o editor recria a partir do projeto na próxima exibição.
  if (type === 'delete' || type === 'replace' || type === 'rename') editor.drop(id);
  if (type === 'structure') refreshUI();
  scheduleSave();
});

const langPicker = createLangPicker({
  dialog: $('lang-dialog'),
  getMode: () => project.mode,
  onChoose: (mode) => project.setMode(mode),
});
$('btn-lang').addEventListener('click', () => langPicker.open());

btnTheme.addEventListener('click', () => {
  theme = theme === 'dark' ? 'light' : 'dark';
  applyTheme();
  editor.setTheme(theme);
  scheduleSave();
});

// ---------- Explorer e console recolhíveis ----------

const explorer = $('explorer');
const btnExplorer = $('btn-explorer');
const consolePane = $('console-pane');
const btnConsoleToggle = $('btn-console-toggle');

function setExplorerOpen(open) {
  explorer.hidden = !open;
  btnExplorer.classList.toggle('active', open);
  btnExplorer.setAttribute('aria-pressed', String(open));
  editor.refresh();
}

function setConsoleOpen(open) {
  consolePane.classList.toggle('collapsed', !open);
  btnConsoleToggle.setAttribute('aria-expanded', String(open));
}

btnExplorer.addEventListener('click', () => {
  setExplorerOpen(explorer.hidden);
  scheduleSave();
});

btnConsoleToggle.addEventListener('click', () => {
  setConsoleOpen(consolePane.classList.contains('collapsed'));
  scheduleSave();
});

setExplorerOpen(saved?.explorer !== false);
setConsoleOpen(saved?.consoleOpen !== false);

// ---------- Salvamento automático ----------

let saveTimer = null;
let saveWarned = false;
let layout = saved?.layout ?? {};

function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const ok = saveState({
    project: project.serialize(),
    layout,
    theme,
    explorer: !explorer.hidden,
    consoleOpen: !consolePane.classList.contains('collapsed'),
  });
  if (!ok && !saveWarned) {
    saveWarned = true;
    ideConsole.warn('Não foi possível salvar o projeto neste navegador (armazenamento bloqueado ou cheio). Seu código não será lembrado ao recarregar a página.');
  }
  return ok;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 500);
}

// Garante o salvamento de uma edição feita menos de 500 ms antes de fechar a página.
window.addEventListener('pagehide', () => { if (saveTimer) saveNow(); });

// ---------- Divisores ----------

initResizers({
  split: $('split'),
  previewPane: $('preview-pane'),
  gutterV: $('gutter-v'),
  gutterH: $('gutter-h'),
  layout,
  onChange: (next) => {
    layout = next;
    editor.refresh();
    scheduleSave();
  },
});

// ---------- Execução ----------

const preview = createPreview(
  $('preview-host'),
  (level, args) => ideConsole.write(level, args, 'js'),
  (lines, dropped) => ideConsole.writeBatch(lines, 'js', dropped),
);

const python = createPython({
  onOutput: (level, text) => ideConsole.write(level, [text], 'python'),
  onBatch: (lines, dropped) => ideConsole.writeBatch(lines, 'python', dropped),
  onStatus: (state) => {
    // A 1ª execução leva alguns segundos: avisa onde o usuário está olhando.
    if (state === 'loading') ideConsole.info(STATUS_TEXT.loading);
    setStatus(state);
  },
  onInput: (promptText) => {
    setConsoleOpen(true);
    return ideConsole.prompt(promptText);
  },
});

const jsRunner = createJsRunner({
  onOutput: (level, text) => ideConsole.write(level, [text], 'js'),
  onBatch: (lines, dropped) => ideConsole.writeBatch(lines, 'js', dropped),
  onInput: async (promptText) => {
    setConsoleOpen(true);
    setStatus('input');
    const value = await ideConsole.prompt(promptText, 'js');
    setStatus(jsRunner.busy ? 'running' : 'ready');
    return value;
  },
});

let stoppedByUser = false;
let jsStoppedByUser = false;
let previewActive = false; // o iframe pode ter timers rodando; o Parar o encerra

// O Parar fica ativo enquanto houver algo para encerrar.
const updateStop = () => { btnStop.disabled = !(python.busy || previewActive || jsRunner.active); };
// Executar só fica bloqueado no modo Python com Python rodando; nos outros modos ele encerra o Python.
const updateRun = () => {
  const busy = python.busy && project.mode === 'python';
  btnRun.disabled = busy;
  btnRun.classList.toggle('busy', busy);
  btnRun.querySelector('.label').textContent = busy ? 'Executando' : 'Executar';
};

const fileData = (mode) => project.list(mode).map(({ name, content }) => ({ name, content }));

async function runPython() {
  const files = fileData('python');
  const pyFiles = files.filter((f) => f.name.endsWith('.py'));
  const entry = pyFiles.find((f) => f.name === 'main.py') ?? pyFiles[0];
  if (!entry || !entry.content.trim()) {
    ideConsole.warn(entry
      ? `${entry.name} está vazio. Escreva algum código antes de executar.`
      : 'O projeto Python não tem nenhum arquivo .py. Crie um main.py.');
    return;
  }
  stoppedByUser = false;
  ideConsole.info(entry.name === 'main.py' ? 'Executando main.py…' : `main.py não encontrado. Executando ${entry.name}…`);
  let ok = false;
  try {
    const run = python.run(files, entry.name);
    updateRun();
    updateStop();
    ok = await run;
  } catch (err) {
    ideConsole.error(`Não foi possível executar: ${err.message}`);
  } finally {
    updateRun();
    updateStop();
    // Se o JavaScript começou a rodar no lugar do Python, ele cuida do status.
    if (!jsRunner.busy) setStatus(ok || stoppedByUser ? 'ready' : 'error');
  }
}

async function runNode() {
  const files = fileData('node');
  const entry = files.find((f) => f.name === 'main.js') ?? files[0];
  if (!entry || !entry.content.trim()) {
    ideConsole.warn(entry
      ? `${entry.name} está vazio. Escreva algum código antes de executar.`
      : 'O projeto JavaScript não tem nenhum arquivo .js. Crie um main.js.');
    return;
  }
  ideConsole.info(entry.name === 'main.js' ? 'Executando main.js…' : `main.js não encontrado. Executando ${entry.name}…`);
  setStatus('running');
  jsStoppedByUser = false;
  ideConsole.cancelPrompt(); // prompt() pendente da execução anterior
  const run = jsRunner.run(files, entry.name);
  updateStop();
  const ok = await run;
  // Erro no main.js: um prompt() que ficou aberto não tem mais quem use a resposta.
  if (!ok && !jsRunner.busy && !python.busy) ideConsole.cancelPrompt();
  // Se uma nova execução já começou, ela cuida do status.
  if (!jsRunner.busy && !python.busy) setStatus(ok || jsStoppedByUser ? 'ready' : 'error');
  updateStop();
}

function runWeb() {
  const files = fileData('web');
  if (!files.some((f) => f.content.trim())) {
    ideConsole.warn('Os arquivos HTML, CSS e JS estão vazios. Escreva algum código antes de executar.');
    return;
  }
  ideConsole.info('Executando HTML + CSS + JavaScript…');
  try {
    preview.run(files);
    previewActive = true;
    updateStop();
    setStatus('ready');
  } catch (err) {
    ideConsole.error(`Não foi possível montar o preview: ${err.message}`);
    setStatus('error');
  }
}

function stopPreview() {
  preview.stop();
  previewActive = false;
}

function stopPython() {
  stoppedByUser = true;
  python.stop();
  ideConsole.cancelPrompt();
  // Parar descarta o runtime: recarrega já, em segundo plano, se o usuário segue no Python.
  if (project.mode === 'python') python.preload();
}

// Uma execução por vez: encerra o que estiver rodando nos outros modos.
function stopOthers(mode) {
  if (mode !== 'python' && python.busy) {
    stopPython();
    ideConsole.warn('Execução Python anterior interrompida.');
  }
  if (mode !== 'node' && jsRunner.active) {
    jsStoppedByUser = true;
    jsRunner.stop();
    ideConsole.cancelPrompt();
  }
  if (mode !== 'web' && previewActive) stopPreview();
  updateRun();
  updateStop();
}

btnRun.addEventListener('click', () => {
  ideConsole.clear();
  stopOthers(project.mode);
  if (project.mode === 'python') runPython();
  else if (project.mode === 'node') runNode();
  else runWeb();
});

// Recarregar preview: roda HTML/CSS/JS de novo.
$('btn-refresh').addEventListener('click', () => {
  ideConsole.clear();
  stopOthers('web');
  runWeb();
});

btnStop.addEventListener('click', () => {
  if (python.busy) {
    stopPython();
    ideConsole.warn('Execução Python interrompida. O runtime está sendo recarregado em segundo plano.');
  } else if (jsRunner.active && (project.mode === 'node' || !previewActive)) {
    jsStoppedByUser = true;
    jsRunner.stop();
    ideConsole.cancelPrompt();
    setStatus('ready');
    ideConsole.warn('Execução JavaScript interrompida.');
  } else if (previewActive) {
    stopPreview();
    ideConsole.info('Preview encerrado.');
  }
  updateRun();
  updateStop();
});

// ---------- Ações do arquivo atual ----------

let formatting = false;

function updateFileButtons() {
  const file = project.activeFile();
  const formattable = !!file && canFormat(langOf(file.name));
  btnFormat.disabled = !formattable || formatting;
  btnFormat.title = !file || formattable ? 'Formatar (Shift+Alt+F)' : `Formatação não disponível para ${file.name}`;
  btnClear.disabled = !file;
  btnDownload.disabled = !file;
}

btnFormat.addEventListener('click', async () => {
  const file = project.activeFile();
  if (!file || formatting || !canFormat(langOf(file.name))) return;
  const code = file.content;
  if (!code.trim()) return;

  formatting = true;
  updateFileButtons();
  try {
    const formatted = await formatCode(langOf(file.name), code);
    // Só aplica se o arquivo não mudou enquanto o Prettier carregava.
    if (project.get(file.id) === file && file.content === code) {
      project.setContent(file.id, formatted);
      editor.setValue(file.id, formatted);
    }
  } catch (err) {
    setConsoleOpen(true);
    ideConsole.error(err.message);
  } finally {
    formatting = false;
    updateFileButtons();
  }
});

btnClear.addEventListener('click', async () => {
  const file = project.activeFile();
  if (!file || !file.content) return;
  if (!await askConfirm(`Apagar todo o código de ${file.name}?`, { ok: 'Limpar', danger: true })) return;
  project.setContent(file.id, '');
  editor.setValue(file.id, '');
  editor.focus();
});

btnDownload.addEventListener('click', () => {
  const file = project.activeFile();
  if (file) downloadFile(file.name, file.content);
});

$('btn-new').addEventListener('click', async () => {
  const label = MODES[project.mode].label;
  if (!await askConfirm(`Restaurar o exemplo de ${label}? Todos os arquivos ${label} atuais serão apagados.`, { ok: 'Restaurar', danger: true })) return;
  if (project.mode === 'python' && python.busy) stopPython();
  if (project.mode === 'node') {
    jsRunner.stop();
    ideConsole.cancelPrompt();
  }
  if (project.mode === 'web') stopPreview();
  updateRun();
  updateStop();
  project.reset();
  ideConsole.clear();
  ideConsole.info(`Projeto ${label} restaurado com o exemplo.`);
  setStatus('ready');
});

// ---------- Explorer: novo, importar, baixar .zip ----------

$('btn-file-new').addEventListener('click', () => filesUI.newFile());

const importInput = $('import-input');
$('btn-import').addEventListener('click', () => importInput.click());

importInput.addEventListener('change', async () => {
  const chosen = [...importInput.files];
  importInput.value = ''; // permite importar o mesmo arquivo de novo
  if (!chosen.length) return;
  setConsoleOpen(true);

  let result;
  try {
    result = await readImports(chosen, (name) => modeOfName(name, project.mode) !== null);
  } catch (err) {
    ideConsole.error(`Falha ao importar: ${err.message}`);
    return;
  }
  for (const { name, reason } of result.skipped) ideConsole.warn(`Ignorado: ${name} (${reason}).`);
  if (!result.files.length) {
    ideConsole.warn('Nenhum arquivo importado. Extensões aceitas: .html, .css, .js, .py, .txt, .csv, .json ou um .zip com eles.');
    return;
  }

  // Separa por modo, pela extensão. Nome repetido (solto e no .zip): vale o último.
  const byMode = Object.fromEntries(Object.keys(MODES).map((m) => [m, []]));
  for (const f of result.files) {
    const list = byMode[modeOfName(f.name, project.mode)];
    const i = list.findIndex((g) => g.name.toLowerCase() === f.name.toLowerCase());
    if (i !== -1) list.splice(i, 1);
    list.push(f);
  }

  const conflicts = Object.entries(byMode)
    .flatMap(([m, list]) => list.filter((f) => project.findByName(m, f.name)).map((f) => f.name));
  if (conflicts.length && !await askConfirm(`Substituir arquivos existentes?\n${conflicts.join('\n')}`, { ok: 'Substituir' })) {
    for (const m of Object.keys(byMode)) byMode[m] = byMode[m].filter((f) => !project.findByName(m, f.name));
  }

  // Vai para o modo dos arquivos importados (prefere o modo atual, se recebeu arquivos).
  let target = null;
  for (const m of Object.keys(byMode)) {
    if (!byMode[m].length) continue;
    const touched = project.upsert(m, byMode[m]);
    if (!touched.length) continue;
    ideConsole.info(`Importado em ${MODES[m].label}: ${touched.map((f) => f.name).join(', ')}`);
    if (!target || m === project.mode) target = m;
  }
  if (target) project.setMode(target);
});

$('btn-zip').addEventListener('click', async () => {
  const mode = project.mode;
  try {
    const slug = MODES[mode].label.toLowerCase().replace(/[^a-z]+/g, '-');
    await downloadZip(`projeto-${slug}.zip`, fileData(mode));
  } catch (err) {
    setConsoleOpen(true);
    ideConsole.error(err.message);
  }
});

// ---------- Inicialização ----------

refreshUI();
ideConsole.info('IDE pronta. Escreva seu código e clique em Executar (Ctrl+Enter).');
if (saved) ideConsole.info('Último projeto restaurado deste navegador.');
// Primeira visita: começa pela escolha da linguagem.
else langPicker.open();

// Atalhos globais. Cmd no Mac equivale a Ctrl.
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === 'Enter') {
    e.preventDefault();
    btnRun.click();
  } else if (e.shiftKey && e.altKey && e.code === 'KeyF') {
    e.preventDefault();
    btnFormat.click();
  } else if (mod && e.code === 'KeyS') {
    // Substitui o "salvar página" do navegador por um salvamento imediato.
    e.preventDefault();
    if (saveNow()) ideConsole.info('Projeto salvo neste navegador.');
  }
});
