// Entrada síncrona (prompt/input) nos Web Workers, com ajuda do service worker (sw.js).
//
// Lado do worker: canWaitSync() e waitInput(id) — o worker fica parado num
// XMLHttpRequest síncrono até a IDE responder. Lado da página: answerInput(id, value).
//
// Só funciona com o service worker controlando a página: localhost, 127.0.0.1 ou HTTPS.
// Sem ele (ex.: acesso por IP da rede), canWaitSync() retorna false e quem chama usa outro caminho.

const ENDPOINT = new URL('../__ide_input__', import.meta.url).href;
const MAX_RETRIES = 20;

let available = null;

function request(params) {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', `${ENDPOINT}?${new URLSearchParams(params)}`, false);
  xhr.send();
  return xhr;
}

// Worker: true se o service worker responde (testado uma vez por worker).
export function canWaitSync() {
  if (available === null) {
    try {
      const xhr = request({ probe: '1' });
      available = xhr.status === 200 && xhr.responseText === 'ide-ok';
    } catch {
      available = false;
    }
  }
  return available;
}

// Worker: bloqueia até a IDE enviar o texto do pedido `id`. Retorna o texto.
export function waitInput(id) {
  for (let i = 0; i < MAX_RETRIES; i++) {
    let xhr;
    try {
      xhr = request({ id });
    } catch {
      // Falha de rede: o navegador reiniciou o service worker (resposta demorou demais).
      // O texto que chegar enquanto isso fica guardado lá; pede de novo.
      continue;
    }
    if (xhr.status === 200) return JSON.parse(xhr.responseText).value;
    break;
  }
  throw new Error('A entrada do console deixou de responder. Execute o programa de novo.');
}

// Página: envia ao service worker o texto digitado para o pedido `id`.
export function answerInput(id, value) {
  navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ id, value }));
}
