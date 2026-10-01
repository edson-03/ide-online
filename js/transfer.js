// Baixar e importar arquivos.
// O .zip usa JSZip (cdnjs), carregado só quando necessário.

const JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const MAX_FILE_SIZE = 1024 * 1024; // 1 MB por arquivo (o projeto fica no localStorage)

let jszipPromise = null;

function loadJSZip() {
  if (!jszipPromise) {
    jszipPromise = new Promise((resolve, reject) => {
      if (window.JSZip) return resolve(window.JSZip);
      const script = document.createElement('script');
      script.src = JSZIP_URL;
      script.onload = () => (window.JSZip ? resolve(window.JSZip) : reject(new Error('JSZip não carregou')));
      script.onerror = () => reject(new Error('Não foi possível carregar a biblioteca de .zip (JSZip). Verifique sua conexão.'));
      document.head.appendChild(script);
    });
    jszipPromise.catch(() => { jszipPromise = null; });
  }
  return jszipPromise;
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadFile(name, content) {
  saveBlob(new Blob([content], { type: 'text/plain;charset=utf-8' }), name);
}

export async function downloadZip(zipName, files) {
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.content);
  saveBlob(await zip.generateAsync({ type: 'blob' }), zipName);
}

// Lê os arquivos escolhidos pelo usuário (soltos ou dentro de .zip).
// Retorna { files: [{ name, content }], skipped: [{ name, reason }] }.
// isAccepted(name) diz se a extensão é suportada por algum modo.
export async function readImports(fileList, isAccepted) {
  const files = [];
  const skipped = [];

  // size: tamanho em bytes, quando conhecido antes de ler (arquivo solto).
  const accept = async (name, size, read) => {
    if (!isAccepted(name)) {
      skipped.push({ name, reason: 'extensão não suportada' });
      return;
    }
    if (size > MAX_FILE_SIZE) {
      skipped.push({ name, reason: 'maior que 1 MB' });
      return;
    }
    const content = await read();
    if (content.length > MAX_FILE_SIZE) {
      skipped.push({ name, reason: 'maior que 1 MB' });
      return;
    }
    files.push({ name, content });
  };

  for (const file of fileList) {
    if (file.name.toLowerCase().endsWith('.zip')) {
      const JSZip = await loadJSZip();
      let zip;
      try {
        zip = await JSZip.loadAsync(file);
      } catch {
        skipped.push({ name: file.name, reason: 'arquivo .zip inválido' });
        continue;
      }
      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        // Pastas dentro do .zip são ignoradas: o projeto não tem subpastas.
        const name = entry.name.split('/').pop();
        if (!name || entry.name.startsWith('__MACOSX/') || name.startsWith('.')) continue;
        await accept(name, 0, () => entry.async('string'));
      }
    } else {
      await accept(file.name, file.size, () => file.text());
    }
  }
  return { files, skipped };
}
