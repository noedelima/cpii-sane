import { describe, expect, it } from "vitest";
import {
  accept,
  contentTypeDe,
  detectarFormato,
  ehImagem,
  formatoDoCaminho,
  formatoDoTipo,
  LIMITE_BYTES,
  LIMITE_PADRAO_MB,
  limiteMbValido,
  mbParaBytes,
  sanitizarNome,
  TETO_UPLOAD_MB,
  validarArquivo,
} from "../src/lib/arquivos";

const bytes = (...b: number[]) => new Uint8Array(b);

describe("detectarFormato", () => {
  it("reconhece PDF pela assinatura %PDF", () => {
    expect(detectarFormato(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe("pdf");
  });

  it("reconhece PNG pela assinatura completa", () => {
    expect(detectarFormato(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
  });

  it("reconhece JPEG pela assinatura FF D8 FF", () => {
    expect(detectarFormato(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
  });

  it("devolve null para formato nao suportado (HEIC, WebP, lixo)", () => {
    // 'RIFF....WEBP'
    expect(detectarFormato(bytes(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00))).toBeNull();
    expect(detectarFormato(bytes(0x00, 0x01, 0x02))).toBeNull();
  });

  it("nao estoura com arquivo truncado", () => {
    expect(detectarFormato(bytes())).toBeNull();
    expect(detectarFormato(bytes(0x89, 0x50))).toBeNull();
    expect(detectarFormato(bytes(0xff, 0xd8))).toBeNull();
  });

  it("nao confunde PNG incompleto com PNG", () => {
    expect(detectarFormato(bytes(0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00))).toBeNull();
  });
});

describe("formatoDoTipo / formatoDoCaminho", () => {
  it("normaliza variacoes de MIME", () => {
    expect(formatoDoTipo("application/pdf")).toBe("pdf");
    expect(formatoDoTipo("IMAGE/JPEG")).toBe("jpeg");
    expect(formatoDoTipo("image/jpg")).toBe("jpeg");
    expect(formatoDoTipo("image/png")).toBe("png");
  });

  it("recusa MIME vazio ou desconhecido", () => {
    expect(formatoDoTipo("")).toBeNull();
    expect(formatoDoTipo(null)).toBeNull();
    expect(formatoDoTipo("image/heic")).toBeNull();
    expect(formatoDoTipo("image/webp")).toBeNull();
  });

  it("le a extensao ignorando query string da URL assinada", () => {
    expect(formatoDoCaminho("1700000000-recibo.PDF")).toBe("pdf");
    expect(formatoDoCaminho("foto.jpeg")).toBe("jpeg");
    expect(formatoDoCaminho("https://x/y/foto.png?token=abc#t")).toBe("png");
    expect(formatoDoCaminho("https://x/arquivo-sem-extensao")).toBeNull();
    expect(formatoDoCaminho(null)).toBeNull();
  });

  it("ehImagem separa imagem de PDF", () => {
    expect(ehImagem("jpeg")).toBe(true);
    expect(ehImagem("png")).toBe(true);
    expect(ehImagem("pdf")).toBe(false);
    expect(ehImagem(null)).toBe(false);
  });
});

describe("validarArquivo", () => {
  const arq = (over: Partial<{ name: string; type: string; size: number }> = {}) => ({
    name: "doc.pdf",
    type: "application/pdf",
    size: 1024,
    ...over,
  });

  it("aceita PDF nos dois modos", () => {
    expect(validarArquivo(arq(), false)).toBeNull();
    expect(validarArquivo(arq(), true)).toBeNull();
  });

  it("recusa imagem quando o campo e so de PDF", () => {
    const erro = validarArquivo(arq({ name: "foto.jpg", type: "image/jpeg" }), false);
    expect(erro).toMatch(/somente PDF/i);
  });

  it("aceita JPG e PNG quando imagens estao liberadas", () => {
    expect(validarArquivo(arq({ name: "foto.jpg", type: "image/jpeg" }), true)).toBeNull();
    expect(validarArquivo(arq({ name: "foto.png", type: "image/png" }), true)).toBeNull();
  });

  it("aceita pela extensao quando o celular nao informa o MIME", () => {
    expect(validarArquivo(arq({ name: "foto.jpg", type: "" }), true)).toBeNull();
  });

  it("recusa HEIC com instrucao de conversao, nao com erro generico", () => {
    const erro = validarArquivo(arq({ name: "IMG_0001.HEIC", type: "image/heic" }), true);
    expect(erro).toMatch(/HEIC/);
    expect(erro).toMatch(/JPG/);
  });

  it("recusa acima do limite e arquivo vazio", () => {
    expect(validarArquivo(arq({ size: LIMITE_BYTES + 1 }), true)).toMatch(/10 MB/);
    expect(validarArquivo(arq({ size: 0 }), true)).toMatch(/vazio/i);
  });

  it("aceita exatamente no limite", () => {
    expect(validarArquivo(arq({ size: LIMITE_BYTES }), true)).toBeNull();
  });

  it("respeita o limite configurado pelo admin", () => {
    const doisMb = mbParaBytes(2);
    expect(validarArquivo(arq({ size: doisMb + 1 }), true, 2)).toMatch(/2 MB/);
    expect(validarArquivo(arq({ size: doisMb }), true, 2)).toBeNull();
    // o mesmo arquivo passa com um limite maior
    expect(validarArquivo(arq({ size: doisMb + 1 }), true, 5)).toBeNull();
  });

  it("usa o limite ja normalizado na mensagem, nao o valor cru", () => {
    // 300 estoura o teto: a mensagem tem de falar do teto que vale
    expect(validarArquivo(arq({ size: mbParaBytes(300) }), true, 300)).toMatch(
      new RegExp(`${TETO_UPLOAD_MB} MB`)
    );
  });
});

describe("limiteMbValido", () => {
  it("mantem valores dentro da faixa", () => {
    expect(limiteMbValido(1)).toBe(1);
    expect(limiteMbValido(15)).toBe(15);
    expect(limiteMbValido(TETO_UPLOAD_MB)).toBe(TETO_UPLOAD_MB);
  });

  it("corta no teto, para um zero a mais nao virar deposito de arquivo grande", () => {
    expect(limiteMbValido(300)).toBe(TETO_UPLOAD_MB);
  });

  it("nunca devolve zero ou negativo", () => {
    expect(limiteMbValido(0)).toBe(LIMITE_PADRAO_MB);
    expect(limiteMbValido(-5)).toBe(LIMITE_PADRAO_MB);
  });

  it("cai no padrao quando a configuracao esta vazia ou invalida", () => {
    // o caso que ja mordeu antes: Number("") e 0, nao NaN
    expect(limiteMbValido("")).toBe(LIMITE_PADRAO_MB);
    expect(limiteMbValido(undefined)).toBe(LIMITE_PADRAO_MB);
    expect(limiteMbValido(null)).toBe(LIMITE_PADRAO_MB);
    expect(limiteMbValido("dez")).toBe(LIMITE_PADRAO_MB);
  });

  it("aceita o valor como texto, que e como ele vem do banco", () => {
    expect(limiteMbValido("8")).toBe(8);
    expect(limiteMbValido(" 8 ")).toBe(8);
  });

  it("arredonda fracao", () => {
    expect(limiteMbValido(7.4)).toBe(7);
    expect(limiteMbValido(7.6)).toBe(8);
  });
});

describe("contentTypeDe", () => {
  it("nunca devolve MIME vazio: cai no PDF quando nao sabe", () => {
    expect(contentTypeDe({ name: "doc.pdf", type: "", size: 1 })).toBe("application/pdf");
  });

  it("normaliza image/jpg para image/jpeg", () => {
    expect(contentTypeDe({ name: "f.jpg", type: "image/jpg", size: 1 })).toBe("image/jpeg");
  });

  it("deduz pela extensao quando o type vem vazio", () => {
    expect(contentTypeDe({ name: "f.png", type: "", size: 1 })).toBe("image/png");
  });
});

describe("accept", () => {
  it("libera imagens so quando pedido", () => {
    expect(accept(false)).toBe("application/pdf");
    expect(accept(true)).toContain("image/jpeg");
    expect(accept(true)).toContain("image/png");
    expect(accept(true)).toContain("application/pdf");
  });
});

describe("sanitizarNome", () => {
  it("remove acentos e espacos", () => {
    expect(sanitizarNome("Recibo Nº 12 — Tijuca II.pdf")).toBe("Recibo_N_12_Tijuca_II.pdf");
  });

  it("preserva a extensao em nome muito longo", () => {
    const nome = "a".repeat(200) + ".jpeg";
    const saida = sanitizarNome(nome);
    expect(saida.length).toBeLessThanOrEqual(80);
    expect(saida.endsWith(".jpeg")).toBe(true);
    expect(formatoDoCaminho(saida)).toBe("jpeg");
  });

  it("nao inventa extensao em nome sem ponto", () => {
    expect(sanitizarNome("arquivo")).toBe("arquivo");
  });
});
