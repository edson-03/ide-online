// Editor de código: uma instância do CodeMirror 5 e um documento (CodeMirror.Doc)
// por arquivo. Trocar de aba troca o documento, preservando o histórico de desfazer.
// Depende do global window.CodeMirror (index.html). Sem ele, usa <textarea>.

import { langOf } from './project.js';

// Modo do CodeMirror por linguagem (ver langOf em project.js).
const CM_MODES = {
  html: 'htmlmixed',
  css: 'css',
  js: 'javascript',
  python: 'python',
  json: { name: 'javascript', json: true },
  text: null,
};

// Tema do CodeMirror para cada tema da IDE.
const CM_THEMES = { light: 'default', dark: 'material-darker' };

// Textos da busca (addons search e jump-to-line) em português.
const PHRASES = {
  'Search:': 'Buscar:',
  '(Use /re/ syntax for regexp search)': '(use /regex/ para expressão regular)',
  'Replace:': 'Substituir:',
  'Replace all:': 'Substituir todos:',
  'With:': 'Por:',
  'Replace with:': 'Substituir por:',
  'Replace?': 'Substituir?',
  Yes: 'Sim',
  No: 'Não',
  All: 'Todos',
  Stop: 'Parar',
  'Jump to line:': 'Ir para a linha:',
  '(Use line:column or scroll% syntax)': '(use linha:coluna ou porcentagem%)',
};

// onChange(id, value): chamado quando o usuário edita o arquivo aberto.
export function createEditor(host, { theme = 'light', onChange }) {
  const hasCM = typeof window.CodeMirror === 'function';

  const empty = document.createElement('div');
  empty.className = 'editor-empty';
  empty.textContent = 'Nenhum arquivo aberto. Escolha um arquivo no Explorer ou crie um novo com +.';
  host.appendChild(empty);

  const wrapper = document.createElement('div');
  wrapper.className = 'editor-instance';
  wrapper.hidden = true;
  host.appendChild(wrapper);

  let current = null; // id do arquivo exibido
  let cm = null;
  let ta = null;
  const docs = new Map(); // id -> { doc, lang }

  if (hasCM) {
    cm = window.CodeMirror(wrapper, {
      theme: CM_THEMES[theme] ?? CM_THEMES.light,
      lineNumbers: true,
      indentUnit: 2,
      tabSize: 4,
      smartIndent: true,
      autoCloseBrackets: true,
      matchBrackets: true,
      styleActiveLine: true,
      phrases: PHRASES,
      // Buscar (Ctrl+F, Ctrl+G), Substituir (Shift+Ctrl+F) e Ir para linha (Alt+G) vêm do keymap padrão.
      // Tab insere espaços em vez do caractere \t.
      extraKeys: {
        'Ctrl-H': 'replace',
        'Ctrl-/': 'toggleComment',
        'Cmd-/': 'toggleComment',
        Tab: (cm) => cm.somethingSelected()
          ? cm.indentSelection('add')
          : cm.replaceSelection(' '.repeat(cm.getOption('indentUnit'))),
        'Shift-Tab': (cm) => cm.indentSelection('subtract'),
      },
    });
    cm.on('change', () => { if (current !== null) onChange(current, cm.getValue()); });
  } else {
    ta = document.createElement('textarea');
    ta.className = 'editor-fallback';
    ta.spellcheck = false;
    wrapper.appendChild(ta);
    ta.addEventListener('input', () => { if (current !== null) onChange(current, ta.value); });
  }

  // Exibe o arquivo (ou o aviso de "nenhum arquivo" se file for null).
  function show(file) {
    if (!file) {
      current = null;
      wrapper.hidden = true;
      empty.hidden = false;
      return;
    }
    const lang = langOf(file.name);
    wrapper.hidden = false;
    empty.hidden = true;

    if (!hasCM) {
      if (current !== file.id) ta.value = file.content;
      current = file.id;
      ta.focus();
      return;
    }

    let entry = docs.get(file.id);
    // Recria o documento se a extensão mudou (renomear .js -> .py, por exemplo).
    if (!entry || entry.lang !== lang) {
      entry = { doc: window.CodeMirror.Doc(file.content, CM_MODES[lang]), lang };
      docs.set(file.id, entry);
    }
    current = file.id;
    if (cm.getDoc() !== entry.doc) cm.swapDoc(entry.doc);
    cm.setOption('indentUnit', lang === 'python' ? 4 : 2);
    cm.setOption('autoCloseTags', lang === 'html');
    cm.refresh();
    cm.focus();
  }

  return {
    hasCodeMirror: hasCM,
    get current() { return current; },
    show,

    // Altera o conteúdo de um arquivo já carregado no editor (Formatar, Limpar).
    setValue(id, value) {
      if (hasCM) docs.get(id)?.doc.setValue(value);
      else if (id === current) ta.value = value;
    },

    // Descarta o documento em cache (arquivo apagado ou substituído por importação).
    drop(id) {
      docs.delete(id);
      if (id === current) current = null;
    },

    focus: () => (cm ? cm.focus() : ta.focus()),
    refresh: () => cm?.refresh(),
    setTheme: (t) => cm?.setOption('theme', CM_THEMES[t] ?? CM_THEMES.light),
  };
}
