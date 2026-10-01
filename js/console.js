// Painel de console da IDE. Recebe mensagens do preview (JS), do Python e da própria IDE.

const SOURCE_LABEL = { js: 'JS', python: 'Python', system: 'IDE' };

// Evita que um loop de print/console.log trave a página com milhares de nós.
const MAX_LINES = 1000;

function formatArg(arg) {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.stack || `${arg.name}: ${arg.message}`;
  try {
    return JSON.stringify(arg, null, 2) ?? String(arg);
  } catch {
    return String(arg);
  }
}

// onCount(n): chamado quando muda o número de mensagens (para o contador do cabeçalho).
export function createConsole(outputEl, { onCount } = {}) {
  // Campo de entrada para o input() do Python. Só um por vez.
  let activePrompt = null;

  const notify = () => onCount?.(outputEl.childElementCount - (activePrompt ? 1 : 0));

  function makeLine(level, text, source) {
    const line = document.createElement('div');
    line.className = `console-line level-${level}`;
    const tag = document.createElement('span');
    tag.className = 'console-source';
    tag.textContent = SOURCE_LABEL[source] ?? source;
    const span = document.createElement('span');
    span.className = 'console-text';
    // textContent: nunca interpretar a saída do usuário como HTML.
    span.textContent = text;
    line.append(tag, span);
    return line;
  }

  // Acrescenta várias linhas de uma vez: uma única medição de layout e um único aviso.
  function append(lines) {
    // Só rola automaticamente se o usuário já estava no fim.
    const atBottom = outputEl.scrollHeight - outputEl.scrollTop - outputEl.clientHeight < 20;
    const frag = document.createDocumentFragment();
    frag.append(...lines);
    outputEl.appendChild(frag);
    while (outputEl.childElementCount > MAX_LINES) outputEl.firstElementChild.remove();
    if (atBottom) outputEl.scrollTop = outputEl.scrollHeight;
    notify();
  }

  function write(level, args, source = 'system') {
    append([makeLine(level, args.map(formatArg).join(' '), source)]);
  }

  // Saída agrupada de um worker: lines = [{ level, text }]; dropped = linhas descartadas.
  function writeBatch(lines, source, dropped = 0) {
    const nodes = [];
    if (dropped) nodes.push(makeLine('warn', `… ${dropped} linhas omitidas (saída rápida demais para exibir)`, 'system'));
    for (const { level, text } of lines) nodes.push(makeLine(level, text, source));
    append(nodes);
  }

  // Retorna Promise<string> com o texto digitado (Enter envia).
  function prompt(promptText, source = 'python') {
    cancelPrompt();
    const line = document.createElement('div');
    line.className = 'console-line level-log console-prompt';

    const tag = document.createElement('span');
    tag.className = 'console-source';
    tag.textContent = SOURCE_LABEL[source] ?? source;

    const text = document.createElement('span');
    text.className = 'console-text';
    text.textContent = promptText;

    const input = document.createElement('input');
    input.className = 'console-input';
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', promptText || 'Entrada do programa');

    line.append(tag, text, input);
    outputEl.appendChild(line);
    outputEl.scrollTop = outputEl.scrollHeight;
    input.focus();
    activePrompt = line;

    return new Promise((resolve) => {
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        // Fica no console como linha comum: prompt + valor digitado.
        input.remove();
        line.classList.remove('console-prompt');
        text.textContent = promptText + input.value;
        activePrompt = null;
        notify();
        resolve(input.value);
      });
    });
  }

  function cancelPrompt() {
    if (activePrompt) activePrompt.remove();
    activePrompt = null;
  }

  return {
    write,
    writeBatch,
    log: (...args) => write('log', args),
    info: (...args) => write('info', args),
    warn: (...args) => write('warn', args),
    error: (...args) => write('error', args),
    prompt,
    cancelPrompt,
    // Mantém o campo de entrada pendente, senão o programa ficaria esperando sem campo.
    clear: () => {
      outputEl.textContent = '';
      if (activePrompt) outputEl.appendChild(activePrompt);
      notify();
    },
  };
}
