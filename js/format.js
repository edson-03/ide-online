// Formatação de HTML, CSS e JavaScript com Prettier (standalone, via jsDelivr).
// Carregado sob demanda no primeiro uso, para não pesar a abertura da IDE.
// Python não tem formatador disponível no navegador: o botão fica desabilitado.

const PRETTIER_URL = 'https://cdn.jsdelivr.net/npm/prettier@3.9.9/';

const PARSERS = { html: 'html', css: 'css', js: 'babel' };

let loading = null;

function loadPrettier() {
  if (!loading) {
    loading = Promise.all([
      import(`${PRETTIER_URL}standalone.mjs`),
      // O plugin html usa os demais para formatar <style> e <script> embutidos.
      import(`${PRETTIER_URL}plugins/html.mjs`),
      import(`${PRETTIER_URL}plugins/postcss.mjs`),
      import(`${PRETTIER_URL}plugins/babel.mjs`),
      import(`${PRETTIER_URL}plugins/estree.mjs`),
    ]).then(([prettier, ...plugins]) => ({ prettier, plugins }));
    // Permite tentar de novo se o carregamento falhar.
    loading.catch(() => { loading = null; });
  }
  return loading;
}

export const canFormat = (lang) => lang in PARSERS;

// Retorna o código formatado. Lança Error com mensagem legível em caso de falha.
export async function formatCode(lang, code) {
  if (!canFormat(lang)) throw new Error('Formatação não disponível para esta linguagem.');

  let lib;
  try {
    lib = await loadPrettier();
  } catch {
    throw new Error('Não foi possível carregar o formatador (Prettier). Verifique sua conexão.');
  }

  try {
    return await lib.prettier.format(code, {
      parser: PARSERS[lang],
      plugins: lib.plugins,
      tabWidth: 2,
    });
  } catch (err) {
    // Erros de sintaxe do Prettier já trazem linha:coluna e um trecho do código.
    throw new Error(`Não foi possível formatar: o código tem erro de sintaxe.\n${err.message}`);
  }
}
