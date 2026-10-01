// Divisores arrastáveis: largura do editor (%) e altura do console (px).
// Os tamanhos ficam nas variáveis CSS --editor-width e --console-height.
// Em telas pequenas os divisores ficam ocultos (layout empilhado, ver style.css).

const EDITOR_MIN = 15; // %
const EDITOR_MAX = 85; // %
const CONSOLE_MIN = 60; // px
const PREVIEW_MIN = 160; // px mínimos do preview acima do console

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// split: contêiner editor | preview. previewPane: coluna do preview, que contém o console.
export function initResizers({ split, previewPane, gutterV, gutterH, layout = {}, onChange }) {
  const root = document.documentElement.style;
  const state = {};

  function apply(next) {
    if (Number.isFinite(next.editorWidth)) {
      state.editorWidth = clamp(next.editorWidth, EDITOR_MIN, EDITOR_MAX);
      root.setProperty('--editor-width', `${state.editorWidth}%`);
    }
    if (Number.isFinite(next.consoleHeight)) {
      const max = Math.max(CONSOLE_MIN, previewPane.clientHeight - PREVIEW_MIN);
      state.consoleHeight = clamp(next.consoleHeight, CONSOLE_MIN, max);
      root.setProperty('--console-height', `${state.consoleHeight}px`);
    }
  }

  apply(layout);

  function drag(gutter, onMove) {
    gutter.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      gutter.setPointerCapture(e.pointerId);
      gutter.classList.add('dragging');
      // Impede que o iframe do preview "engula" o mouse durante o arraste.
      document.body.classList.add('resizing');

      const move = (ev) => onMove(ev);
      const up = () => {
        gutter.removeEventListener('pointermove', move);
        gutter.removeEventListener('pointerup', up);
        gutter.removeEventListener('pointercancel', up);
        gutter.classList.remove('dragging');
        document.body.classList.remove('resizing');
        onChange({ ...state });
      };
      gutter.addEventListener('pointermove', move);
      gutter.addEventListener('pointerup', up);
      gutter.addEventListener('pointercancel', up);
    });
  }

  drag(gutterV, (e) => {
    const rect = split.getBoundingClientRect();
    apply({ editorWidth: ((e.clientX - rect.left) / rect.width) * 100 });
  });

  drag(gutterH, (e) => {
    apply({ consoleHeight: previewPane.getBoundingClientRect().bottom - e.clientY });
  });
}
