// Código-fonte (em texto) da função que converte valores do console em string.
// É injetado no preview (iframe) e no worker de JavaScript, onde o código do usuário roda:
// postMessage não clona funções nem nós do DOM, então tudo vira texto antes de sair.
export const FMT_SOURCE = `
  function fmt(v) {
    if (typeof v === 'string') return v;
    if (v === undefined) return 'undefined';
    if (typeof v === 'function') return v.toString();
    if (typeof v === 'symbol' || typeof v === 'bigint') return v.toString();
    if (v instanceof Error) return v.name + ': ' + v.message;
    if (typeof Node !== 'undefined' && v instanceof Node) {
      return v.nodeType === 1 ? '<' + v.tagName.toLowerCase() + '>' : v.nodeName;
    }
    try {
      var seen = new WeakSet();
      return JSON.stringify(v, function (k, x) {
        if (typeof x === 'object' && x !== null) {
          if (seen.has(x)) return '[circular]';
          seen.add(x);
        }
        if (x === undefined) return 'undefined';
        if (typeof x === 'function') return '[função]';
        return x;
      }, 2);
    } catch (e) { return String(v); }
  }
`;
