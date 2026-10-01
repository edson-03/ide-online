// Modelo do projeto: arquivos de cada modo (web / python), abas abertas e arquivo ativo.
// Não mexe no DOM: a interface escuta as mudanças via onChange.

// output: onde o resultado aparece (preview = página no iframe; console = só texto).
export const MODES = {
  web: { label: 'HTML/CSS/JS', exts: ['html', 'css', 'js'], newExt: 'js', output: 'preview' },
  python: { label: 'Python', exts: ['py', 'txt', 'csv', 'json'], newExt: 'py', output: 'console' },
  node: { label: 'JavaScript', exts: ['js'], newExt: 'js', output: 'console' },
};

const EXT_LANG = { html: 'html', css: 'css', js: 'js', py: 'python', txt: 'text', csv: 'text', json: 'json' };

export const extOf = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');
export const langOf = (name) => EXT_LANG[extOf(name)] ?? 'text';
// Modo que aceita o arquivo. .js serve para web e JavaScript: prefere o modo indicado.
export const modeOfName = (name, preferred = null) => {
  const ext = extOf(name);
  if (MODES[preferred]?.exts.includes(ext)) return preferred;
  return Object.keys(MODES).find((m) => MODES[m].exts.includes(ext)) ?? null;
};

export const DEFAULT_FILES = {
  web: [
    {
      name: 'index.html',
      content: `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Meu projeto</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>Olá, mundo!</h1>
  <p>Edite os arquivos e clique em <strong>Executar</strong>.</p>
  <button id="btn">Clique aqui</button>

  <script src="script.js"></script>
</body>
</html>
`,
    },
    {
      name: 'style.css',
      content: `body {
  font-family: system-ui, sans-serif;
  padding: 24px;
}

h1 {
  color: #4f8cff;
}
`,
    },
    {
      name: 'script.js',
      content: `const btn = document.getElementById('btn');
let cliques = 0;

btn.addEventListener('click', () => {
  cliques++;
  console.log('Cliques:', cliques);
});
`,
    },
  ],
  node: [
    {
      name: 'main.js',
      content: `// JavaScript puro: sem página, a saída aparece no console.
import { saudacao } from './util.js';

console.log(saudacao('mundo'));
for (let i = 0; i < 3; i++) {
  console.log('linha', i);
}
`,
    },
    {
      name: 'util.js',
      content: `export function saudacao(nome) {
  return \`Olá, \${nome}!\`;
}
`,
    },
  ],
  python: [
    {
      name: 'main.py',
      content: `def saudacao(nome):
    return f"Olá, {nome}!"

print(saudacao("mundo"))
for i in range(3):
    print("linha", i)
`,
    },
  ],
};

export function createProject(saved) {
  let nextId = 1;
  const files = new Map(); // id -> { id, name, mode, content }
  const tabs = {}; // modo -> ids das abas abertas, em ordem
  const active = {}; // modo -> id do arquivo ativo
  for (const m of Object.keys(MODES)) {
    tabs[m] = [];
    active[m] = null;
  }
  let mode = 'web';
  const listeners = [];

  const emit = (type, id = null) => listeners.forEach((fn) => fn({ type, id }));

  const list = (m = mode) => [...files.values()].filter((f) => f.mode === m);
  const findByName = (m, name) => typeof name === 'string'
    ? list(m).find((f) => f.name.toLowerCase() === name.toLowerCase())
    : undefined;

  // Retorna a mensagem de erro, ou null se o nome é válido.
  function validateName(m, name, exceptId = null) {
    if (!name) return 'O nome do arquivo não pode ficar vazio.';
    if (/[\\/:*?"<>|]/.test(name)) return 'Nome inválido: não use / \\ : * ? " < > |';
    if (!MODES[m].exts.includes(extOf(name))) {
      return `No modo ${MODES[m].label}, use uma destas extensões: ${MODES[m].exts.map((e) => '.' + e).join(', ')}`;
    }
    const other = findByName(m, name);
    if (other && other.id !== exceptId) return `Já existe um arquivo chamado ${other.name}.`;
    return null;
  }

  function add(m, name, content) {
    const file = { id: nextId++, name, mode: m, content };
    files.set(file.id, file);
    return file;
  }

  function open(id) {
    const file = files.get(id);
    if (!file) return;
    // Já aberto e ativo: nada muda (evita re-renderizar e quebrar o duplo clique).
    if (active[file.mode] === id && tabs[file.mode].includes(id) && file.mode === mode) return;
    if (!tabs[file.mode].includes(id)) tabs[file.mode].push(id);
    active[file.mode] = id;
    emit('structure');
  }

  function close(id) {
    const file = files.get(id);
    if (!file) return;
    const t = tabs[file.mode];
    const i = t.indexOf(id);
    if (i === -1) return;
    t.splice(i, 1);
    // Ativa a aba vizinha, como nos editores de código.
    if (active[file.mode] === id) active[file.mode] = t[i] ?? t[i - 1] ?? null;
    emit('structure');
  }

  function create(m, name, content = '') {
    name = name.trim();
    const err = validateName(m, name);
    if (err) throw new Error(err);
    const file = add(m, name, content);
    open(file.id);
    return file;
  }

  function rename(id, name) {
    const file = files.get(id);
    name = name.trim();
    if (!file || name === file.name) return;
    const err = validateName(file.mode, name, id);
    if (err) throw new Error(err);
    file.name = name;
    emit('rename', id);
    emit('structure');
  }

  function remove(id) {
    const file = files.get(id);
    if (!file) return;
    close(id);
    files.delete(id);
    emit('delete', id);
    emit('structure');
  }

  function uniqueName(m, base = 'novo', ext = MODES[m].newExt) {
    let name = `${base}.${ext}`;
    for (let i = 2; findByName(m, name); i++) name = `${base}-${i}.${ext}`;
    return name;
  }

  function loadMode(m, entries) {
    for (const f of list(m)) files.delete(f.id);
    tabs[m] = [];
    active[m] = null;
    for (const { name, content } of entries) {
      if (typeof name !== 'string' || typeof content !== 'string') continue;
      if (validateName(m, name)) continue; // ignora entradas inválidas ou duplicadas
      add(m, name, content);
    }
  }

  function restoreTabs(m, openNames, activeName) {
    const byName = (n) => findByName(m, n)?.id;
    tabs[m] = (Array.isArray(openNames) ? openNames : list(m).map((f) => f.name)).map(byName).filter(Boolean);
    active[m] = byName(activeName) ?? tabs[m][0] ?? null;
  }

  // Restaura o estado salvo. Aceita o formato antigo (4 abas fixas: code.html/css/js/python).
  const p = saved?.project;
  if (p?.files) {
    for (const m of Object.keys(MODES)) {
      loadMode(m, Array.isArray(p.files[m]) ? p.files[m] : DEFAULT_FILES[m]);
      restoreTabs(m, p.open?.[m], p.active?.[m]);
    }
    mode = MODES[p.mode] ? p.mode : 'web';
  } else if (saved?.code) {
    const c = saved.code;
    const str = (v, def) => (typeof v === 'string' ? v : def);
    loadMode('web', [
      { name: 'index.html', content: str(c.html, DEFAULT_FILES.web[0].content) },
      { name: 'style.css', content: str(c.css, DEFAULT_FILES.web[1].content) },
      { name: 'script.js', content: str(c.js, DEFAULT_FILES.web[2].content) },
    ]);
    loadMode('python', [{ name: 'main.py', content: str(c.python, DEFAULT_FILES.python[0].content) }]);
    for (const m of Object.keys(MODES)) restoreTabs(m);
    mode = saved.tab === 'python' ? 'python' : 'web';
  } else {
    for (const m of Object.keys(MODES)) {
      loadMode(m, DEFAULT_FILES[m]);
      restoreTabs(m);
    }
  }

  return {
    get mode() { return mode; },
    setMode(m) {
      if (!MODES[m] || m === mode) return;
      mode = m;
      emit('structure');
    },
    list,
    get: (id) => files.get(id),
    tabs: (m = mode) => tabs[m].map((id) => files.get(id)),
    activeFile: (m = mode) => files.get(active[m]) ?? null,
    open,
    close,
    create,
    rename,
    remove,
    uniqueName,
    validateName,
    findByName,

    setContent(id, content) {
      const file = files.get(id);
      if (!file || file.content === content) return;
      file.content = content;
      emit('content', id);
    },

    // Cria ou substitui arquivos (importação). Retorna os arquivos afetados.
    upsert(m, entries) {
      const touched = [];
      for (const { name, content } of entries) {
        const existing = findByName(m, name);
        if (existing) {
          existing.content = content;
          emit('replace', existing.id);
          touched.push(existing);
        } else if (!validateName(m, name)) {
          touched.push(add(m, name, content));
        }
      }
      for (const f of touched) if (!tabs[m].includes(f.id)) tabs[m].push(f.id);
      if (touched.length) active[m] = touched[0].id;
      emit('structure');
      return touched;
    },

    // Volta o modo ao exemplo padrão.
    reset(m = mode) {
      for (const f of list(m)) emit('delete', f.id);
      loadMode(m, DEFAULT_FILES[m]);
      restoreTabs(m);
      emit('structure');
    },

    serialize() {
      const out = { mode, files: {}, open: {}, active: {} };
      for (const m of Object.keys(MODES)) {
        out.files[m] = list(m).map(({ name, content }) => ({ name, content }));
        out.open[m] = tabs[m].map((id) => files.get(id).name);
        out.active[m] = files.get(active[m])?.name ?? null;
      }
      return out;
    },

    onChange: (fn) => listeners.push(fn),
  };
}
