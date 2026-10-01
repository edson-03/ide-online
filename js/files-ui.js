// Explorer (lista de arquivos) e abas do editor.
// Lê e altera o projeto (project.js); a re-renderização acontece a cada mudança de estrutura.

import { langOf } from './project.js';
import { askConfirm } from './confirm.js';

const FILE_ICONS = {
  html: ['fi-html', '<>'],
  css: ['fi-css', '#'],
  js: ['fi-js', 'JS'],
  python: ['fi-py', 'PY'],
  json: ['fi-json', '{}'],
  text: ['fi-text', 'TXT'],
};

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

function svgIcon(id) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${id}`);
  svg.appendChild(use);
  return svg;
}

function fileLabel(name) {
  const [cls, text] = FILE_ICONS[langOf(name)] ?? FILE_ICONS.text;
  return [el('span', { class: `file-icon ${cls}` }, text), el('span', { class: 'name' }, name)];
}

// onError(msg): mostra um erro ao usuário (ex.: nome inválido ao renomear).
export function createFilesUI({ project, listEl, tabsEl, onError }) {
  function render() {
    const active = project.activeFile();

    listEl.replaceChildren(...project.list().map((f) => el('li',
      { class: `file-row${f === active ? ' active' : ''}`, 'data-id': f.id },
      el('button', { class: 'file-item', 'data-action': 'open', title: f.name }, ...fileLabel(f.name)),
      el('span', { class: 'file-actions' },
        el('button', { class: 'icon-btn tiny', 'data-action': 'rename', title: 'Renomear', 'aria-label': `Renomear ${f.name}` }, svgIcon('i-pencil')),
        el('button', { class: 'icon-btn tiny', 'data-action': 'delete', title: 'Apagar', 'aria-label': `Apagar ${f.name}` }, svgIcon('i-trash')),
      ),
    )));

    tabsEl.replaceChildren(
      ...project.tabs().map((f) => el('div',
        { class: `file-tab${f === active ? ' active' : ''}`, role: 'tab', 'aria-selected': String(f === active), 'data-id': f.id },
        el('button', { class: 'tab-main', 'data-action': 'open', title: 'Duplo clique para renomear' }, ...fileLabel(f.name)),
        el('button', { class: 'tab-close', 'data-action': 'close', title: 'Fechar aba', 'aria-label': `Fechar ${f.name}` }, svgIcon('i-x')),
      )),
      el('button', { class: 'tab-add', 'data-action': 'new', title: 'Novo arquivo', 'aria-label': 'Novo arquivo' }, svgIcon('i-plus')),
    );

    // Mantém a aba ativa visível quando há muitas abas.
    tabsEl.querySelector('.file-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function newFile() {
    const file = project.create(project.mode, project.uniqueName(project.mode));
    startRename(file.id, tabsEl);
  }

  // Edição do nome no próprio item (aba ou Explorer).
  function startRename(id, container) {
    const file = project.get(id);
    const nameEl = container.querySelector(`[data-id="${id}"] .name`);
    if (!file || !nameEl) return;

    const input = el('input', { class: 'rename-input', type: 'text', spellcheck: 'false', 'aria-label': 'Novo nome do arquivo' });
    input.value = file.name;
    nameEl.replaceWith(input);
    input.focus();
    // Seleciona só o nome, sem a extensão, como no VS Code.
    const dot = file.name.lastIndexOf('.');
    input.setSelectionRange(0, dot > 0 ? dot : file.name.length);

    let done = false;
    const finish = (commit, keepOnError) => {
      if (done) return;
      if (commit) {
        try {
          project.rename(id, input.value);
        } catch (err) {
          onError(err.message);
          if (keepOnError) {
            input.classList.add('invalid');
            input.title = err.message;
            return;
          }
        }
      }
      done = true;
      render();
    };

    input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // não dispara os atalhos globais
      if (e.key === 'Enter') { e.preventDefault(); finish(true, true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true, false));
    // Clique no campo não deve abrir/fechar a aba por baixo.
    input.addEventListener('click', (e) => e.stopPropagation());
  }

  async function remove(id) {
    const file = project.get(id);
    if (file && await askConfirm(`Apagar o arquivo ${file.name}? Essa ação não pode ser desfeita.`, { ok: 'Apagar', danger: true })) {
      project.remove(id);
    }
  }

  function handleClick(container) {
    return (e) => {
      const actionEl = e.target.closest('[data-action]');
      if (!actionEl || !container.contains(actionEl)) return;
      const action = actionEl.dataset.action;
      if (action === 'new') return newFile();
      const id = Number(actionEl.closest('[data-id]')?.dataset.id);
      if (action === 'open') project.open(id);
      else if (action === 'close') project.close(id);
      else if (action === 'rename') startRename(id, container);
      else if (action === 'delete') remove(id);
    };
  }

  function handleDblClick(container) {
    return (e) => {
      const row = e.target.closest('[data-id]');
      if (row && e.target.closest('.tab-main, .file-item')) startRename(Number(row.dataset.id), container);
    };
  }

  listEl.addEventListener('click', handleClick(listEl));
  tabsEl.addEventListener('click', handleClick(tabsEl));
  listEl.addEventListener('dblclick', handleDblClick(listEl));
  tabsEl.addEventListener('dblclick', handleDblClick(tabsEl));
  // Botão do meio fecha a aba, como nos navegadores.
  tabsEl.addEventListener('auxclick', (e) => {
    const row = e.target.closest('.file-tab');
    if (e.button === 1 && row) project.close(Number(row.dataset.id));
  });

  return { render, newFile };
}
