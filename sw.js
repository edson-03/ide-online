// Service worker da IDE. Única função: permitir que um Web Worker (Python ou JavaScript)
// espere de forma síncrona o texto digitado no console, para prompt() e input()
// funcionarem sem await e sem JSPI. Ver js/sync-input.js.
//
// O worker faz um XMLHttpRequest síncrono para __ide_input__?id=...; este service worker
// segura a resposta até a IDE enviar o texto ({ id, value } via postMessage).
// Nenhuma outra requisição é interceptada nem guardada em cache.

const waiting = new Map(); // id -> resolve(Response) de uma requisição esperando o texto
const answers = new Map(); // id -> texto que chegou antes da requisição (ex.: service worker reiniciado)

const reply = (value) => new Response(JSON.stringify({ value }), {
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || !url.pathname.endsWith('/__ide_input__')) return;
  if (url.searchParams.has('probe')) {
    e.respondWith(new Response('ide-ok', { headers: { 'Cache-Control': 'no-store' } }));
    return;
  }
  const id = url.searchParams.get('id');
  if (answers.has(id)) {
    e.respondWith(reply(answers.get(id)));
    answers.delete(id);
    return;
  }
  e.respondWith(new Promise((resolve) => waiting.set(id, resolve)));
});

self.addEventListener('message', (e) => {
  const { id, value } = e.data || {};
  if (typeof id !== 'string') return;
  const resolve = waiting.get(id);
  waiting.delete(id);
  if (resolve) resolve(reply(String(value)));
  else answers.set(id, String(value));
});
