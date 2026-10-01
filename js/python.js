// Cliente do worker Python (py-worker.js).
// O runtime é carregado sob demanda, na primeira execução Python.

// onOutput(level, text): mensagem avulsa. onBatch(lines, dropped): saída agrupada do programa.
export function createPython({ onOutput, onBatch, onStatus, onInput }) {
  let worker = null;
  let pending = null; // { resolve } da execução em andamento

  function spawn() {
    const w = new Worker(new URL('./py-worker.js', import.meta.url), { type: 'module' });
    worker = w;

    w.onmessage = (e) => {
      const msg = e.data;
      switch (msg.type) {
        case 'status': onStatus(msg.state); break;
        case 'batch': onBatch(msg.lines, msg.dropped); break;
        case 'fatal': onOutput('error', msg.text); break;
        case 'done': finish(msg.ok); break;
        case 'input':
          // onInput(prompt) -> Promise<string> com o texto digitado.
          onStatus('input');
          onInput(msg.prompt).then((value) => {
            // Ignora a resposta se a execução foi interrompida enquanto esperava.
            if (worker !== w) return;
            onStatus('running');
            w.postMessage({ type: 'input-reply', value });
          });
          break;
      }
    };

    w.onerror = (e) => {
      e.preventDefault();
      onOutput('error', `Falha no worker Python: ${e.message || 'erro desconhecido'}`);
      finish(false);
      kill();
    };
  }

  function finish(ok) {
    if (!pending) return;
    const { resolve } = pending;
    pending = null;
    resolve(ok);
  }

  function kill() {
    if (worker) worker.terminate();
    worker = null;
  }

  // files: [{ name, content }] do modo Python; entry: arquivo a executar (ex.: main.py).
  // Retorna Promise<boolean>: true se o código terminou sem exceção.
  function run(files, entry) {
    if (pending) return Promise.reject(new Error('Já existe uma execução Python em andamento.'));
    if (!worker) spawn();
    return new Promise((resolve) => {
      pending = { resolve };
      onStatus('running');
      worker.postMessage({ type: 'run', files, entry });
    });
  }

  // Interrompe a execução encerrando o worker. O runtime é recarregado na próxima execução.
  function stop() {
    if (!pending) return false;
    kill();
    finish(false);
    return true;
  }

  return {
    run,
    stop,
    get busy() { return pending !== null; },
  };
}
