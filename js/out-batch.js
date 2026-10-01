// Agrupa a saída de um programa (print/console.log) antes de enviar à IDE.
// Usado dentro dos workers (Python e JavaScript). Sem isso, um loop que imprime sem
// parar manda milhares de mensagens por segundo e congela a interface.
//
// Envia { type: 'batch', lines: [{ level, text }], dropped } no máximo a cada
// `interval` ms, com até `max` linhas; o excedente é descartado e contado em dropped.

export function createBatcher(send, { interval = 50, max = 200 } = {}) {
  let lines = [];
  let dropped = 0;
  let last = 0;
  let timer = null;

  function flush() {
    clearTimeout(timer);
    timer = null;
    last = Date.now();
    if (!lines.length && !dropped) return;
    send({ type: 'batch', lines, dropped });
    lines = [];
    dropped = 0;
  }

  function push(level, text) {
    lines.push({ level, text });
    if (lines.length > max) {
      lines.shift();
      dropped++;
    }
    // Num loop que nunca devolve o controle o timer não dispara: confere o relógio aqui.
    if (Date.now() - last >= interval) flush();
    else if (!timer) timer = setTimeout(flush, interval);
  }

  return { push, flush };
}
