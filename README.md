# IDE Online — HTML, CSS, JavaScript e Python

IDE que roda inteira no navegador, sem build e sem backend. Três linguagens executam de verdade:

- **HTML/CSS/JS**: página num preview isolado.
- **JavaScript**: código sem página, saída no console (tipo Node), num Web Worker.
- **Python**: Pyodide (CPython compilado para WebAssembly), num Web Worker.

## Estrutura

```
/
├── index.html          # layout e carregamento das bibliotecas (CDN)
├── css/style.css       # temas claro/escuro, layout, responsividade
├── js/
│   ├── main.js         # liga os componentes: toolbar, modos, atalhos, autosave
│   ├── project.js      # modelo do projeto: arquivos por modo, abas, exemplos padrão
│   ├── editor.js       # editor CodeMirror (um documento por arquivo)
│   ├── files-ui.js     # Explorer e abas: abrir, fechar, criar, renomear, apagar
│   ├── transfer.js     # baixar arquivo / projeto .zip e importar
│   ├── lang-picker.js  # tela de escolha de linguagem (busca + cards)
│   ├── js-runner.js    # executa o modo JavaScript num Web Worker
│   ├── fmt-source.js   # serialização dos valores do console (preview e worker JS)
│   ├── out-batch.js    # agrupa a saída dos programas (evita travar com loops de print)
│   ├── console.js      # painel de console (log / info / warn / error / input)
│   ├── confirm.js      # diálogo de confirmação centralizado
│   ├── preview.js      # monta o documento do preview e o iframe isolado
│   ├── python.js       # cliente do worker Python (executar / parar)
│   ├── py-worker.js    # Web Worker que carrega o Pyodide e roda o código
│   ├── format.js       # formatação com Prettier
│   ├── storage.js      # localStorage
│   └── resizer.js      # divisores arrastáveis
├── PLANO.md            # plano de execução por etapas
├── CLAUDE.md           # contexto e regras do projeto para o assistente
└── README.md
```

## Como iniciar

A aplicação precisa ser servida por HTTP. Abrir o `index.html` direto (`file://`) não funciona, porque módulos ES e Web Workers exigem uma origem HTTP.

Na pasta do projeto, rode um destes:

```
python -m http.server 8765
npx serve -l 8765
```

Depois abra http://localhost:8765.

É preciso ter internet: as bibliotecas vêm de CDN.

## Como usar

| Ação | Como |
|---|---|
| Trocar de linguagem | botão ao lado do **Executar**: abre a tela de escolha (busca, Enter escolhe o 1º resultado, Esc fecha). Ela também abre sozinha na primeira visita |
| Abrir arquivo | clique no arquivo no Explorer ou na aba acima do editor |
| Fechar aba | **X** da aba ou botão do meio do mouse (o arquivo continua no Explorer) |
| Novo arquivo | **+** nas abas ou ícone de novo arquivo no Explorer |
| Renomear | duplo clique no nome (aba ou Explorer) ou ícone de lápis no Explorer |
| Apagar arquivo | ícone de lixeira no Explorer (pede confirmação) |
| Baixar arquivo atual | ícone de download na barra superior |
| Baixar projeto | ícone de caixa no Explorer (gera `projeto-web.zip` ou `projeto-python.zip`) |
| Importar | ícone de upload no Explorer: arquivos soltos ou um `.zip` |
| Executar | botão **Executar** ou `Ctrl+Enter`. Encerra o que estiver rodando em outra linguagem (uma execução por vez) |
| Parar | botão **Parar** (Python em execução ou preview aberto) |
| Recarregar preview | ícone ↻ no cabeçalho do Preview |
| Formatar | ícone de linhas na barra superior ou `Shift+Alt+F` (HTML, CSS, JS) |
| Limpar arquivo atual | ícone de lixeira na barra superior (apaga o conteúdo, não o arquivo) |
| Restaurar exemplo | ícone ↺ na barra superior (só a linguagem atual) |
| Salvar agora | `Ctrl+S` (o salvamento também é automático) |
| Mostrar/ocultar Explorer | ícone de arquivos na barra lateral |
| Recolher/expandir console | clique em **Console** no rodapé do Preview |
| Tema claro/escuro | botão no canto direito da barra de status |
| Indentar / recuar | `Tab` / `Shift+Tab` |
| Buscar / próximo | `Ctrl+F` / `Ctrl+G` (com o cursor no editor) |
| Substituir | `Ctrl+H` ou `Shift+Ctrl+F` |
| Ir para a linha | `Alt+G` |
| Comentar / descomentar | `Ctrl+/` |

No Mac, use `Cmd` no lugar de `Ctrl`. Ao trocar de linguagem, o preview HTML/CSS/JS é encerrado.

Cada linguagem tem seus próprios arquivos. A linguagem de cada arquivo vem da extensão:

| Modo | Extensões |
|---|---|
| HTML/CSS/JS | `.html`, `.css`, `.js` |
| JavaScript | `.js` |
| Python | `.py`, `.txt`, `.csv`, `.json` |

Ao importar, um `.js` vai para a linguagem atual (se ela aceitar `.js`); senão, para HTML/CSS/JS.

O nome precisa ser único no modo e não pode ter `/ \ : * ? " < > |`. Não há subpastas.

### HTML, CSS e JavaScript

**Executar** monta a página a partir do `index.html` (ou do primeiro `.html`) e a mostra no Preview:

- `<link rel="stylesheet" href="style.css">` e `<script src="script.js"></script>` que apontam para arquivos do projeto são substituídos pelo conteúdo deles. Por isso o `.zip` baixado também funciona aberto direto no computador.
- Arquivos `.css` e `.js` que o HTML não referencia são incluídos automaticamente (CSS no início, JS no fim).
- `console.log/info/warn/error`, erros não tratados e promises rejeitadas aparecem no console com a origem `JS`. Erros mostram arquivo e linha, por exemplo `(script.js, linha 2)`.

### JavaScript

**Executar** roda o `main.js` (ou o primeiro `.js`) sem página; a saída vai para o console. Os arquivos são módulos ES: `import { f } from './util.js'` funciona entre arquivos do projeto. Erros mostram arquivo e linha, por exemplo `(main.js, linha 3)`. O programa continua vivo depois de terminar o `main.js` (timers, promises) até **Parar** ou uma nova execução; um loop infinito não trava a IDE.

### Python

**Executar** roda o `main.py` (ou o primeiro `.py`, se não houver `main.py`). Nesse modo, o painel da direita mostra só o console. A primeira execução baixa o runtime (~10 MB) e leva alguns segundos; as próximas são imediatas. `print` aparece no console; exceções aparecem com o traceback, indicando arquivo e linha.

Todos os arquivos do modo Python são gravados numa pasta antes de cada execução, então `import util` (para um `util.py` do projeto) e `open("dados.csv")` funcionam. Um módulo editado é reimportado na execução seguinte.

`input()` funciona: o console mostra um campo de texto com o prompt; digite e tecle Enter. O status fica "Aguardando entrada no console…" enquanto isso. Requer JSPI (WebAssembly JavaScript Promise Integration), disponível no Chrome e no Edge recentes; em navegadores sem JSPI, `input()` mostra um erro explicativo.

Pacotes incluídos na distribuição do Pyodide (numpy, pandas etc.) são baixados automaticamente quando aparecem num `import`.

## Dependências

Todas carregadas por CDN, sem instalação:

| Biblioteca | Versão | Onde é usada | Se falhar |
|---|---|---|---|
| [CodeMirror 5](https://codemirror.net/5/) (cdnjs) | 5.65.16 | `index.html`, `js/editor.js` | a IDE usa um `<textarea>` simples, sem destaque de sintaxe |
| [Pyodide](https://pyodide.org/) (jsDelivr) | 314.0.7 (Python 3.14) | `js/py-worker.js`, carregado na 1ª execução Python | mensagem "Runtime Python indisponível"; HTML/CSS/JS continuam funcionando |
| [Prettier](https://prettier.io/) (jsDelivr) | 3.9.9 | `js/format.js`, carregado no 1º uso do Formatar | mensagem de erro no console; o código não é alterado |
| [JSZip](https://stuk.github.io/jszip/) (cdnjs) | 3.10.1 | `js/transfer.js`, carregado ao baixar ou importar `.zip` | mensagem de erro no console; baixar/importar arquivos soltos continua funcionando |

## Segurança

- O preview roda num `iframe` com `sandbox="allow-scripts allow-modals allow-forms"` e **sem** `allow-same-origin`. O documento tem origem opaca: o código do usuário não acessa o DOM, os cookies nem o `localStorage` da IDE. A comunicação é só via `postMessage`, e a IDE só aceita mensagens do iframe atual.
- Python e o modo JavaScript rodam em Web Workers: sem acesso ao DOM nem ao `localStorage` da IDE.
- A saída do usuário é inserida no console com `textContent`, nunca como HTML.

## Limitações

- **Loop infinito no preview HTML/CSS/JS trava a aba** (no modo JavaScript, não: ele roda em worker). No Chrome, o iframe roda no mesmo processo da IDE, e o botão Parar não chega a responder. Para sair, recarregue a página: o código fica salvo e não é executado de novo sozinho. Em Python isso não acontece: o Parar funciona.
- **`input()` em Python depende de JSPI**, um recurso que o Pyodide ainda marca como experimental. Funciona no Chrome e no Edge recentes. Em navegadores sem JSPI (no momento, provavelmente Safari e talvez Firefox), `input()` lança um erro explicativo.
- **Não há formatação para Python** (nem para `.txt`, `.csv`, `.json`). O botão fica desabilitado nesses arquivos.
- **Sem subpastas.** Ao importar um `.zip`, os arquivos de subpastas entram pelo nome, sem a pasta. Extensões fora da lista são ignoradas, com aviso no console. Limite de 1 MB por arquivo.
- **Modo JavaScript sem `prompt()`, `alert()` e DOM** (não há janela no worker). Pacotes npm (`import 'lodash'`) não estão disponíveis; só imports relativos entre arquivos do projeto, sem importação circular.
- **Erro de sintaxe no modo JavaScript aparece sem número de linha.** O navegador não informa a posição de erros de sintaxe em módulos carregados por `import()`. Erros em tempo de execução mostram arquivo e linha.
- **Só três linguagens.** Java, C, C++, PHP etc. exigiriam um runtime WebAssembly próprio para cada uma ou um servidor; por isso não aparecem na tela de escolha.
- **Uma página por vez no preview.** Links entre páginas `.html` do projeto não navegam no Preview.
- **No preview, o código não busca outros arquivos do projeto.** `fetch('dados.json')` e `import` dentro de `<script type="module">` falham, porque o documento não tem endereço próprio (origem opaca). Os arquivos `.css` e `.js` entram embutidos na página; dados podem ir direto no `.js`. Formulários funcionam com `preventDefault()` no `submit`; um envio de verdade sai da página do preview (Executar a recria).
- **Arquivos criados pelo código Python não ficam no projeto.** Eles existem durante a execução (dá para ler o que foi escrito), mas a pasta é recriada a partir do projeto na execução seguinte.
- **`localStorage`, cookies e `fetch` com credenciais não funcionam no código do preview**, por causa do isolamento (origem opaca). Usar `localStorage` lá dá `SecurityError`.
- **Só pacotes Python da distribuição do Pyodide.** Instalar pacotes do PyPI com `micropip` não está disponível na interface.
- **Não funciona offline**, porque as bibliotecas vêm de CDN.
- **Um projeto por navegador**: o salvamento automático guarda um único projeto no `localStorage` deste navegador.
- **O console guarda as últimas 1000 linhas.** Quando um programa imprime mais rápido do que dá para exibir (ex.: `while True: print(i)`), a saída é enviada em lotes e parte das linhas é omitida, com aviso `… N linhas omitidas`. Assim a IDE continua respondendo e o Parar funciona.
- O Parar do Python encerra o worker; a próxima execução recarrega o runtime (alguns segundos).

## Testes manuais

### HTML

```html
<h1>Título</h1>
<ul>
  <li>Item 1</li>
  <li>Item 2</li>
</ul>
```

Esperado: título e lista aparecem no Resultado.

### CSS

Com o HTML acima:

```css
h1 { color: tomato; }
li:nth-child(2) { font-weight: bold; }
```

Esperado: título vermelho e o segundo item em negrito.

### JavaScript

```js
console.log('log', { a: 1 });
console.warn('aviso');
console.error('erro');
document.querySelector('h1').textContent = 'Alterado pelo JS';
try { parent.document; } catch (e) { console.log('isolado:', e.name); }
foo();
```

Esperado (colando em `script.js`): título alterado no Preview. No console: o log com o objeto formatado, o aviso em amarelo, o erro em vermelho, `isolado: SecurityError` e `ReferenceError: foo is not defined (script.js, linha 6)`.

### Vários arquivos

1. No modo HTML/CSS/JS, clique em **+**, digite `util` e Enter (vira `util.js`). Escreva `console.log('util carregado')`. Executar: a mensagem aparece, mesmo sem `<script src>` no HTML.
2. Feche a aba `util.js` no **X**: ela continua no Explorer; um clique reabre.
3. Tente renomear para `util.py`: aparece o erro de extensão; Esc cancela.
4. Troque para **Python**, crie `util.py` com `def f(): return 42` e no `main.py` escreva `import util` e `print(util.f())`. Esperado: `42`.
5. Baixe o projeto (.zip) e importe-o de volta: a IDE pergunta antes de substituir os arquivos existentes.

### JavaScript (modo JavaScript)

O exemplo padrão (`main.js` importando `util.js`) deve mostrar `Olá, mundo!` e `linha 0..2`. Depois, teste:

```js
let n = 0;
setInterval(() => console.log('tick', ++n), 500);
```

Esperado: os ticks continuam depois que o `main.js` termina; **Parar** encerra. Com `while (true) {}`, a IDE continua respondendo e **Parar** encerra.

### Python

```python
def fatorial(n):
    return 1 if n <= 1 else n * fatorial(n - 1)

for i in range(1, 6):
    print(i, fatorial(i))

1 / 0
```

Esperado (em `main.py`): os 5 fatoriais e, em seguida, o traceback de `ZeroDivisionError` apontando `main.py`, linha 7, com status "Erro".

```python
while True:
    pass
```

Esperado: o status fica "Executando…"; **Parar** interrompe e mostra o aviso no console.

```python
import numpy as np
print(np.arange(10).mean())
```

Esperado: mensagens de carregamento do numpy e depois `4.5`.

```python
nome = input("Seu nome: ")
idade = int(input("Idade: "))
print(f"Olá, {nome}! Ano que vem você terá {idade + 1}.")
```

Esperado: dois campos de entrada no console, um de cada vez. Depois de responder, ficam as linhas `Seu nome: …` e `Idade: …` e a mensagem final. Digitar texto na idade gera `ValueError`, e o Parar durante a espera interrompe a execução.
