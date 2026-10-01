# IDE Online — contexto do projeto

IDE no navegador para HTML/CSS/JS (preview), JavaScript puro (console, tipo Node) e Python (Pyodide). Sem build e sem backend. A estrutura de arquivos, o uso e as limitações estão no `README.md`; o plano original, no `PLANO.md`.

## Regras do projeto

- **Sem build**: HTML + CSS + JS puro com módulos ES. Bibliotecas só via CDN, com versão fixa (CodeMirror 5.65.16, Pyodide 314.0.7, Prettier 3.9.9, JSZip 3.10.1). Não trocar biblioteca nem adicionar dependência sem perguntar.
- **Isolamento**: o preview roda em `iframe sandbox="allow-scripts allow-modals allow-forms"`, **nunca** com `allow-same-origin`. A IDE só aceita `postMessage` do iframe atual. Python e o modo JavaScript rodam em Web Workers. A saída do usuário entra no DOM só com `textContent`.
- **Não simular** o que não existe (ex.: formatador Python). Limitação nova vai para a seção Limitações do README.
- **Interface e comentários em português do Brasil.** Mensagens ao usuário: claras, sem jargão.
- **Nada de `alert`/`confirm`/`prompt` nativos na IDE**: use `askConfirm()` de `js/confirm.js` (diálogo centralizado).
- **Saída de programas sempre agrupada** (`js/out-batch.js`): workers e script-ponte do preview usam `createBatcher`. Sem isso, um loop de `print` congela a IDE. Quando estoura, descarta as linhas mais **antigas**.
- **Uma execução por vez**: Executar encerra o que roda nos outros modos (`stopOthers` em `main.js`); trocar de linguagem encerra o preview e limpa o console (exceto com Python rodando).
- **Runtime Python pré-carregado** (`python.preload()`) ao abrir o modo Python e logo após Parar; nunca nos outros modos (dados móveis). O pré-carregamento não muda o status da IDE.
- Mudanças pequenas e focadas; manter o estilo do código ao redor. Atualizar o README quando mudar comportamento, atalho ou limitação.

## Rodar e testar

- Servir por HTTP (`file://` não funciona): `python -m http.server 8765` e abrir http://localhost:8765.
- Não há testes automatizados no repositório. Para validar, usar Chrome headless com `puppeteer-core` instalado **fora do projeto** (pasta temporária), apontando para `C:/Program Files/Google/Chrome/Application/chrome.exe`.
  - Mexer no editor: `document.querySelector('.CodeMirror').CodeMirror.setValue(...)`.
  - Trocar de modo: clicar `#btn-lang` e depois `.lang-card[data-mode="web|node|python"]`.
  - Estado salvo fica em `localStorage['ide-online:v1']`. Um estado sem `project.files` abre os exemplos no modo **web**, ignorando `project.mode`.
  - A 1ª execução Python baixa o runtime (~10 MB): usar timeout longo.

## Pendências conhecidas (não feitas)

- Arrastar e soltar arquivos no Explorer para importar.
- Imagens/arquivos binários no modo web (exigiria data URLs; o `localStorage` de ~5 MB vira o limite, talvez migrar para IndexedDB).
- Autocompletar no editor (addon `show-hint` do CodeMirror).
- Testes automatizados para funções puras (`buildDocument`/`locate` em `preview.js`, `validateName` em `project.js`).
- Avaliar se, ao cortar saída em excesso, é melhor manter as primeiras linhas em vez das últimas.
