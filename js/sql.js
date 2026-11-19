// Cliente do worker SQL (sql-worker.js).
// O SQLite é carregado sob demanda, na primeira execução SQL.

// onOutput(level, text): mensagem avulsa. onBatch(lines, dropped): saída agrupada.
export function createSql({ onOutput, onBatch, onStatus }) {
  let worker = null;
  let pending = null; // { resolve } da execução em andamento

  function spawn() {
    const w = new Worker(new URL('./sql-worker.js', import.meta.url), { type: 'module' });
    worker = w;

    w.onmessage = (e) => {
      const msg = e.data;
      switch (msg.type) {
        case 'status': onStatus(msg.state); break;
        case 'batch': onBatch(msg.lines, msg.dropped); break;
        case 'fatal': onOutput('error', msg.text); break;
        case 'done': finish(msg.ok); break;
      }
    };

    w.onerror = (e) => {
      e.preventDefault();
      onOutput('error', `Falha no worker SQL: ${e.message || 'erro desconhecido'}`);
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

  // Retorna Promise<boolean>: true se todos os comandos rodaram sem erro.
  function run(sql) {
    if (pending) return Promise.reject(new Error('Já existe uma execução SQL em andamento.'));
    if (!worker) spawn();
    return new Promise((resolve) => {
      pending = { resolve };
      onStatus('running');
      worker.postMessage({ type: 'run', sql });
    });
  }

  // Interrompe encerrando o worker; a próxima execução cria outro.
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
