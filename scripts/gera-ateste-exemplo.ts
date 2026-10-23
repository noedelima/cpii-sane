// Gera um ateste de exemplo, com dados ficticios, usando o MESMO modulo que o
// sistema usa no navegador (src/lib/pdf-ateste.ts). Serve para conferir a olho
// o resultado apos mexer no jspdf/dompurify, que teste unitario nao cobre.
//
//   npx vite-node scripts/gera-ateste-exemplo.ts -- <arquivo-de-saida.pdf>
//
// Nao faz parte do app: nao e importado por nenhuma tela.
import fs from "node:fs";
import path from "node:path";
import { montarPdfAteste, type AtesteDocParams } from "@/lib/pdf-ateste";
import type { Grupo, NotaFiscal } from "@/types/database";

const saida = process.argv[2] ?? "ateste-exemplo.pdf";

function grupo(id: number, romano: string, arabico: number, nome: string, ata: string): Grupo {
  return {
    id,
    nome,
    numero_romano: romano,
    numero_arabico: arabico,
    numero_ata: ata,
    numero_tc: `TC ${20 + arabico}/2026`,
    numero_pregao: "90012/2025",
  } as unknown as Grupo;
}

function nf(
  id: number,
  numero: string,
  grupo_id: number,
  entrega: string,
  entregaFim: string | null,
  valor: number,
  processo: string
): NotaFiscal {
  return {
    id,
    numero,
    grupo_id,
    data_entrega: entrega,
    data_entrega_fim: entregaFim,
    valor_total: valor,
    processo_pagamento: processo,
  } as unknown as NotaFiscal;
}

const grupos = [
  grupo(7, "VII", 7, "Grupo VII — Estocáveis A", "15/2025"),
  grupo(8, "VIII", 8, "Grupo VIII — Estocáveis B", "16/2025"),
];

const nfs = [
  nf(1, "000.021.211", 7, "2026-09-01", "2026-09-15", 18_430.55, "23027.000912/2026-14"),
  nf(2, "000.021.288", 7, "2026-09-16", "2026-09-30", 12_105.9, "23027.000912/2026-14"),
  nf(3, "000.021.344", 8, "2026-09-08", null, 7_880.25, "23027.000915/2026-48"),
];

const params: AtesteDocParams = {
  atesteId: 42,
  dataEmissao: new Date(2026, 9, 23),
  fornecedor: {
    codigo: "C TEIXEIRA",
    razao_social: "C. TEIXEIRA COMÉRCIO DE ALIMENTOS LTDA.",
    cnpj: "12.345.678/0001-90",
  },
  grupoPorId: new Map(grupos.map((g) => [g.id, g])),
  nfs,
  nfEmpenhosPorNf: new Map([
    [1, [{ numero: "2026NE000123", valor: 12_000 }, { numero: "2026NE000130", valor: 6_430.55 }]],
    [2, [{ numero: "2026NE000130", valor: 12_105.9 }]],
    [3, [{ numero: "2026NE000141", valor: 7_880.25 }]],
  ]),
  processoSuap: "23027.000912/2026-14",
  localEmissao: "Rio de Janeiro",
  observacoes:
    "Documento de exemplo, gerado com dados fictícios para conferência visual do layout. Não possui validade.",
  assinanteNome: "Noé de Lima Bezerra",
  assinanteMatricula: "3304702",
  // O logo e lido do disco: carregarLogo() do app usa fetch/FileReader, que
  // so existem no navegador.
  logoDataUrl:
    "data:image/png;base64," +
    fs.readFileSync(path.resolve("public/cpii-logo.png")).toString("base64"),
};

const { doc, numeroDoc, filename } = montarPdfAteste(params);
fs.writeFileSync(saida, Buffer.from(doc.output("arraybuffer")));
console.log(`ateste ${numeroDoc} (${filename}) -> ${saida}`);
console.log(`paginas: ${doc.getNumberOfPages()}`);
