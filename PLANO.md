# Plano de execução — IDE Online (HTML, CSS, JS, Python)

## Premissas

- **Sem build**: HTML + CSS + JS puro (ES modules). Abre com um servidor estático local (`python -m http.server` ou `npx serve`). `file://` não serve: Web Worker e Pyodide exigem HTTP.
- **Editor**: CodeMirror 5 via cdnjs. Motivo: funciona sem bundler, tem modos para as 4 linguagens, tema escuro, numeração, auto-indent e atalhos. Monaco é mais pesado e exige loader AMD; CodeMirror 6 exige bundler ou import maps de vários pacotes.
- **Python**: Pyodide (CPython em WebAssembly) via jsDelivr, rodando em **Web Worker**. O worker isola a execução da UI e pode ser encerrado com `terminate()` em caso de loop infinito.
- **Formatação**: Prettier standalone (cdnjs/jsDelivr) para HTML/CSS/JS. Para Python **não há formatador** simples no navegador: o botão fica desabilitado em Python, com tooltip explicando. Não vamos simular.
- **Preview**: `iframe sandbox="allow-scripts"` (sem `allow-same-origin`) com `srcdoc`. O código do usuário não acessa o DOM nem o `localStorage` da IDE.
- **Projeto** = um único conjunto {html, css, js, python} salvo no `localStorage`. Não haverá múltiplos projetos nomeados (dá para adicionar depois, se quiser).

## Estrutura alvo

```
/
├── index.html          # layout e carregamento das libs (CDN)
├── css/style.css       # tema escuro, layout, responsividade
├── js/
│   ├── main.js         # ligação dos componentes e eventos da toolbar
│   ├── editor.js       # abas + instâncias CodeMirror
│   ├── preview.js      # monta o srcdoc e injeta a ponte do console
│   ├── console.js      # painel de console (log/warn/error/info)
│   ├── python.js       # cliente do worker Pyodide (estado, run, stop)
│   ├── py-worker.js    # worker: carrega Pyodide, roda código, envia stdout/stderr
│   ├── storage.js      # autosave e preferências
│   ├── format.js       # Prettier
│   └── resizer.js      # divisores arrastáveis
├── README.md
└── PLANO.md
```

## Etapas

### 1. Esqueleto e layout
- `index.html` com barra superior (abas de linguagem, Executar, Parar, Limpar, Formatar, Novo), área editor | preview e painel de console embaixo.
- CSS com tema escuro e grid. Em telas < 768px, empilha editor / preview / console.
- **Verificar**: abre no servidor local sem erros no console do navegador; layout responde ao redimensionar.

### 2. Editor
- 4 instâncias CodeMirror (uma por linguagem), alternadas pelas abas, com o modo, numeração, auto-indent, fechamento de tags/colchetes e o tema escuro.
- Atalhos: `Ctrl+Enter` executa, `Shift+Alt+F` formata, `Ctrl+S` salva (com `preventDefault`).
- Se o CDN falhar, mostrar aviso e cair para `<textarea>` simples (a IDE continua utilizável).
- **Verificar**: trocar de aba preserva o conteúdo de cada uma; highlighting correto nas 4.

### 3. Console
- Componente que recebe `{level, args, source}` e renderiza com cor por nível (log, info, warn, error) e prefixo de origem (JS / Python / Sistema).
- Botão para limpar o console; auto-scroll.
- **Verificar**: chamadas manuais de teste aparecem com cores distintas.

### 4. Preview HTML/CSS/JS
- Montar o `srcdoc`: HTML do usuário + `<style>` com CSS + script-ponte + `<script>` com JS.
- O script-ponte sobrescreve `console.*` e captura `window.onerror` e `unhandledrejection`, enviando via `postMessage`.
- Na IDE, aceitar só mensagens cujo `event.source === iframe.contentWindow`.
- Executar recria o iframe (estado limpo a cada execução).
- **Verificar**: `console.log` e um erro proposital aparecem no console da IDE com a linha; `parent.document` falha dentro do iframe (isolamento).

### 5. Python (Pyodide em worker)
- O worker carrega Pyodide sob demanda na 1ª execução Python, com status "Carregando runtime Python (~10 MB)…".
- `setStdout`/`setStderr` enviam linhas ao console; exceções retornam o traceback formatado.
- Para `input()`: não há suporte real (exigiria SharedArrayBuffer + headers COOP/COEP). Ele lança um erro claro explicando a limitação.
- Botão **Parar**: `worker.terminate()` + recriar o worker (o runtime recarrega na próxima execução).
- Falha de rede no CDN → mensagem "Runtime Python indisponível. Verifique a conexão".
- **Verificar**: `print`, erro de sintaxe, exceção em runtime e `while True: pass` + Parar funcionam.

### 6. Toolbar e fluxo de execução
- **Executar**: se a aba ativa é Python → Python; senão → preview web. Valida o conteúdo vazio com um aviso.
- **Limpar**: limpa o editor ativo (com confirmação).
- **Novo**: restaura os exemplos padrão (com confirmação).
- Indicador de estado: pronto / executando / carregando runtime / erro.
- **Verificar**: cada botão nas 4 abas; nenhum erro deixa a UI travada.

### 7. Formatação
- Prettier standalone com plugins html, postcss e babel; erro de sintaxe do formatador vira mensagem no console (não quebra).
- **Verificar**: código desalinhado é formatado nas 3 linguagens web; código inválido gera mensagem clara.

### 8. Persistência
- Autosave com debounce (~500 ms) das 4 linguagens + aba ativa + tamanhos dos painéis.
- Carregar na inicialização; `try/catch` em toda leitura/escrita (modo privado pode bloquear).
- **Verificar**: recarregar a página mantém código, aba e layout.

### 9. Redimensionamento
- Divisores arrastáveis (pointer events) entre editor/preview e área principal/console; chamar `cm.refresh()` ao soltar.
- **Verificar**: arrastar no desktop e no toque; tamanhos persistem.

### 10. README e testes manuais
- README: como iniciar, dependências (CodeMirror, Prettier, Pyodide — todas via CDN), limitações (precisa de internet na 1ª carga, sem `input()` em Python, sem pacotes Python com extensão nativa fora do Pyodide, sem formatador Python).
- Exemplos prontos de teste para HTML, CSS, JS e Python (incluindo os casos de erro).
- **Verificar**: percorrer o checklist de qualidade do prompt item a item.

## Limitações declaradas desde já

| Item | Situação |
|---|---|
| `input()` em Python | implementado via JSPI (Chrome/Edge); sem JSPI, mensagem clara |
| Formatar Python | indisponível |
| Uso offline | não; libs vêm de CDN |
| Pacotes Python | só os da distribuição Pyodide (`micropip` fica fora do escopo inicial) |
| Loop infinito em JS | confirmado no Chrome: trava a aba (iframe no mesmo processo). Saída: recarregar a página; o código fica salvo e não roda sozinho |

## Pontos para decidir antes de começar

1. CodeMirror 5 (simples, sem build) está ok, ou prefere Monaco (visual do VS Code, mais pesado)?
2. Preview ao vivo (re-executa ao digitar, com debounce) ou só pelo botão Executar? Sugestão: só pelo botão, com opção de "auto-run" desligada por padrão.
