// Diálogo de confirmação centralizado, no lugar do confirm() do navegador
// (que aparece no topo da tela e não pode ser posicionado nem estilizado).

let dialog = null;

function build() {
  dialog = document.createElement('dialog');
  dialog.className = 'confirm-dialog';
  dialog.innerHTML = `
    <p class="confirm-message"></p>
    <form method="dialog" class="confirm-actions">
      <button class="btn" value="cancel">Cancelar</button>
      <button class="btn confirm-ok" value="ok"></button>
    </form>`;
  document.body.appendChild(dialog);
  // Clique no fundo (fora do conteúdo) cancela.
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close('cancel'); });
}

// Retorna Promise<boolean>: true se o usuário confirmou. Esc ou Cancelar: false.
// danger: botão de confirmação em vermelho (ação que apaga algo).
export function askConfirm(message, { ok = 'OK', danger = false } = {}) {
  if (!dialog) build();
  dialog.querySelector('.confirm-message').textContent = message;
  const okBtn = dialog.querySelector('.confirm-ok');
  okBtn.textContent = ok;
  okBtn.classList.toggle('danger', danger);
  dialog.returnValue = '';
  dialog.showModal();
  okBtn.focus();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
  });
}
