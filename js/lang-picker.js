// Tela de escolha de linguagem (<dialog> com busca e cards).
// Lista só as linguagens que a IDE executa de verdade.

// Ícones desenhados aqui (SVG inline), sem dependência externa.
export const LANG_ICONS = {
  python: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <path fill="#3776ab" d="M15.9 3C9.3 3 9.7 5.9 9.7 5.9v3H16v.9H7.2S3 9.3 3 16s3.7 6.4 3.7 6.4h2.2v-3.1s-.1-3.7 3.6-3.7h6.2s3.5.1 3.5-3.4V6.6S22.7 3 15.9 3zm-3.4 2a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z"/>
    <path fill="#ffd43b" d="M16.1 29c6.6 0 6.2-2.9 6.2-2.9v-3H16v-.9h8.8S29 22.7 29 16s-3.7-6.4-3.7-6.4h-2.2v3.1s.1 3.7-3.6 3.7h-6.2s-3.5-.1-3.5 3.4v5.6S9.3 29 16.1 29zm3.4-2a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2z"/>
  </svg>`,
  node: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <rect x="3" y="3" width="26" height="26" rx="3" fill="#f7df1e"/>
    <text x="27" y="26" text-anchor="end" font-family="Arial, sans-serif" font-weight="700" font-size="12" fill="#222">JS</text>
  </svg>`,
  web: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <path fill="#e44d26" d="M5 3l2.2 24.6L16 30l8.8-2.4L27 3z"/>
    <path fill="#f16529" d="M16 5v22.8l7.1-2L25 5z"/>
    <path fill="#fff" d="M10 8h12l-.3 3H13.3l.2 3H21.4l-.7 7.8L16 23.1l-4.7-1.3-.3-3.6h3l.2 1.6 1.8.5 1.8-.5.3-3H10.6z"/>
  </svg>`,
};

const CHOICES = [
  { mode: 'python', name: 'Python', group: 'Linguagens de programação', keywords: 'py python3 pyodide' },
  { mode: 'node', name: 'JavaScript', group: 'Linguagens de programação', keywords: 'js node nodejs console es6 ecmascript' },
  { mode: 'web', name: 'HTML/CSS/JS', group: 'Web', keywords: 'html css javascript web site página pagina frontend' },
];

const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// onChoose(mode): o usuário escolheu uma linguagem. getMode(): modo atual (destacado).
export function createLangPicker({ dialog, onChoose, getMode }) {
  const search = dialog.querySelector('.lang-search input');
  const groupsEl = dialog.querySelector('.lang-groups');
  const emptyEl = dialog.querySelector('.lang-empty');

  function render() {
    const q = normalize(search.value.trim());
    const visible = CHOICES.filter((c) => !q || normalize(`${c.name} ${c.keywords}`).includes(q));
    const groups = [...new Set(visible.map((c) => c.group))];

    groupsEl.replaceChildren(...groups.map((g) => {
      const section = document.createElement('section');
      section.className = 'lang-group';
      const h = document.createElement('h3');
      h.textContent = g;
      const grid = document.createElement('div');
      grid.className = 'lang-grid';
      for (const c of visible.filter((c) => c.group === g)) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `lang-card${c.mode === getMode() ? ' current' : ''}`;
        card.dataset.mode = c.mode;
        card.innerHTML = LANG_ICONS[c.mode]; // SVG fixo, definido acima
        const label = document.createElement('span');
        label.textContent = c.name;
        card.appendChild(label);
        grid.appendChild(card);
      }
      section.append(h, grid);
      return section;
    }));
    emptyEl.hidden = visible.length > 0;
  }

  groupsEl.addEventListener('click', (e) => {
    const card = e.target.closest('.lang-card');
    if (!card) return;
    dialog.close();
    onChoose(card.dataset.mode);
  });

  search.addEventListener('input', render);
  search.addEventListener('keydown', (e) => {
    // Enter na busca escolhe o primeiro resultado.
    if (e.key === 'Enter') {
      e.preventDefault();
      groupsEl.querySelector('.lang-card')?.click();
    }
    // O campo de busca usaria o Esc só para limpar o texto; aqui ele fecha a tela.
    if (e.key === 'Escape') {
      e.preventDefault();
      dialog.close();
    }
  });

  // Clique no fundo (fora do conteúdo) fecha.
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());

  return {
    open() {
      search.value = '';
      render();
      dialog.showModal();
      search.focus();
    },
  };
}
