/**
 * Regras dos arquivos anexados (PDF e imagens).
 *
 * A tela de upload e o mesclador do "Baixar PDFs unificados" compartilham esta
 * definicao de proposito: o que o sistema aceita tem de ser exatamente o que
 * ele sabe embutir no PDF enviado para pagamento.
 *
 * Por que so JPEG e PNG: o mesclador usa pdf-lib, que embute apenas esses dois
 * formatos. Aceitar HEIC (padrao do iPhone) ou WebP no upload faria o anexo
 * subir, aparecer na tela e *desaparecer* do PDF unificado — falha silenciosa
 * no documento que instrui o pagamento. Melhor recusar no upload, com a
 * instrucao de converter, do que perder a foto da impropriedade depois.
 */

export type Formato = "pdf" | "jpeg" | "png";

export const TIPO_PDF = "application/pdf";
export const TIPOS_IMAGEM = ["image/jpeg", "image/png"] as const;

/** Limite por arquivo (o mesmo aplicado nos buckets do Storage). */
export const LIMITE_BYTES = 10 * 1024 * 1024;

const POR_TIPO: Record<string, Formato> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/pjpeg": "jpeg",
  "image/png": "png",
};

const POR_EXTENSAO: Record<string, Formato> = {
  pdf: "pdf",
  jpg: "jpeg",
  jpeg: "jpeg",
  jfif: "jpeg",
  png: "png",
};

/** Formato pelo MIME informado pelo navegador (pode vir vazio ou errado). */
export function formatoDoTipo(tipo: string | null | undefined): Formato | null {
  if (!tipo) return null;
  return POR_TIPO[tipo.trim().toLowerCase()] ?? null;
}

/** Formato pela extensao do caminho/URL — palpite, nao garantia. */
export function formatoDoCaminho(caminho: string | null | undefined): Formato | null {
  if (!caminho) return null;
  const limpo = caminho.split("?")[0].split("#")[0];
  const ext = limpo.slice(limpo.lastIndexOf(".") + 1).toLowerCase();
  return POR_EXTENSAO[ext] ?? null;
}

/**
 * Formato pelos bytes do arquivo — e esta a fonte confiavel.
 * Extensao e MIME podem mentir (e os anexos legados sao URLs externas sem
 * extensao nenhuma), mas a assinatura do arquivo nao.
 */
export function detectarFormato(bytes: Uint8Array): Formato | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 &&
      bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf"; // %PDF
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 &&
      bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d &&
      bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 &&
      bytes[2] === 0xff) return "jpeg";
  return null;
}

export function ehImagem(f: Formato | null): boolean {
  return f === "jpeg" || f === "png";
}

/** Valor do atributo accept do input de arquivo. */
export function accept(imagens: boolean): string {
  return imagens ? [TIPO_PDF, ...TIPOS_IMAGEM].join(",") : TIPO_PDF;
}

export interface ArquivoEscolhido {
  name: string;
  type: string;
  size: number;
}

/**
 * Valida o arquivo escolhido. Devolve a mensagem de erro, ou null se esta ok.
 * Aceita pelo MIME ou pela extensao: celulares as vezes entregam type vazio.
 */
export function validarArquivo(file: ArquivoEscolhido, imagens: boolean): string | null {
  const formato = formatoDoTipo(file.type) ?? formatoDoCaminho(file.name);
  if (!formato) {
    return imagens
      ? "Formato não aceito. Envie PDF, JPG ou PNG. Fotos de iPhone em HEIC precisam ser convertidas para JPG (na foto: Compartilhar › Opções › Mais compatível)."
      : "Envie um arquivo PDF.";
  }
  if (!imagens && formato !== "pdf") {
    return "Este campo aceita somente PDF.";
  }
  if (file.size > LIMITE_BYTES) {
    return `Arquivo acima de ${Math.round(LIMITE_BYTES / 1024 / 1024)} MB.`;
  }
  if (file.size === 0) {
    return "Arquivo vazio.";
  }
  return null;
}

/** MIME a gravar no Storage (nunca confia no type vazio do navegador). */
export function contentTypeDe(file: ArquivoEscolhido): string {
  const f = formatoDoTipo(file.type) ?? formatoDoCaminho(file.name);
  if (f === "png") return "image/png";
  if (f === "jpeg") return "image/jpeg";
  return TIPO_PDF;
}

/**
 * Nome seguro para o caminho no bucket: sem acentos, sem espaco, sem caractere
 * especial — e preservando a extensao, que e o primeiro palpite do mesclador.
 */
export function sanitizarNome(nome: string): string {
  const base = nome
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_");
  // slice(-80) corta pela direita e poderia comer a extensao em nomes longos:
  // recorta o miolo e mantem o sufixo.
  if (base.length <= 80) return base;
  const ponto = base.lastIndexOf(".");
  if (ponto < 0 || base.length - ponto > 12) return base.slice(-80);
  const ext = base.slice(ponto);
  return base.slice(0, 80 - ext.length) + ext;
}
