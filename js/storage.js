// Persistência no localStorage: código das 4 abas, aba ativa e layout.
// Tudo em try/catch: o localStorage pode estar bloqueado (modo privado,
// configuração do navegador) ou cheio; nesses casos a IDE funciona sem salvar.

const KEY = 'ide-online:v1';

// Retorna o estado salvo ou null se não houver (ou se estiver corrompido).
export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    return state && typeof state === 'object' ? state : null;
  } catch {
    return null;
  }
}

// Retorna true se salvou.
export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
