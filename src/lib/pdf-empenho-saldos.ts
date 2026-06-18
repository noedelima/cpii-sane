// PDF de saldos de empenho ("PDF¹") — usado no empenho individual (saldo atual
// dos itens) e na seleção de várias NEs (relatório único). Enviado à empresa
// para conferência dos saldos quando há divergência no controle interno dela.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtDate, fmtMoney } from "@/lib/format";

export interface EmpenhoSaldoItem {
  codigo_catmat: string | null;
  descricao: string;
  unidade: string;
  qtd_empenhada: number;
  valor_unitario_ne: number;
  consumido_qtd: number;
  saldo_qtd: number | null;
  valor_inicial: number; // saldo inicial em R$ (qtd_empenhada × preço da NE)
  saldo_valor: number; // saldo atual em R$
}

export interface EmpenhoSaldoBloco {
  numero: string;
  data_emissao: string;
  processo_suap: string | null;
  valor_global: number; // valor líquido do empenho (inicial + reforço − cancel. − anul.)
  grupos: string[]; // nomes/refs dos grupos do empenho
  itens: EmpenhoSaldoItem[];
  fornecedorNome?: string; // exibido por NE quando o relatório reúne várias empresas
}

export interface EmpenhoSaldosParams {
  fornecedor: { codigo: string; razao_social: string; cnpj: string | null };
  blocos: EmpenhoSaldoBloco[];
  emitidoPor: string;
  dataGeracao?: Date;
  logoDataUrl: string | null;
  cabecalho?: { orgao: string; setor1: string; setor2: string };
}

const M = 18;

function qtd(n: number | null | undefined, un: string): string {
  if (n == null) return "—";
  return `${Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 })} ${un}`;
}

/** Desenha o cabeçalho institucional e devolve o Y para o conteúdo. */
function cabecalho(
  doc: jsPDF,
  logo: string | null,
  titulo: string,
  subtitulo: string,
  cab: { orgao: string; setor1: string; setor2: string }
): number {
  const W = doc.internal.pageSize.getWidth();
  if (logo) doc.addImage(logo, "PNG", M, 12, 24, 19.5);
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(0);
  doc.text(cab.orgao, W / 2, 17, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(cab.setor1, W / 2, 22.5, { align: "center" });
  doc.text(cab.setor2, W / 2, 27, { align: "center" });
  doc.setDrawColor(30, 58, 138).setLineWidth(0.6);
  doc.line(M, 34, W - M, 34);
  doc.setFont("helvetica", "bold").setFontSize(12);
  doc.text(titulo, W / 2, 43, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(9.5);
  doc.text(subtitulo, W / 2, 48.5, { align: "center" });
  return 55;
}

export function montarPdfEmpenhoSaldos(p: EmpenhoSaldosParams): {
  doc: jsPDF;
  filename: string;
} {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const multi = p.blocos.length > 1;
  const titulo = multi
    ? "DEMONSTRATIVO DE SALDOS DE EMPENHO"
    : `SALDO DO EMPENHO ${p.blocos[0]?.numero ?? ""}`;

  const cab = p.cabecalho ?? {
    orgao: "COLÉGIO PEDRO II",
    setor1: "Pró-Reitoria de Administração — PROAD",
    setor2: "Seção de Alimentação e Nutrição — SANE",
  };
  let y = cabecalho(doc, p.logoDataUrl, titulo, "Gêneros alimentícios — saldos para conferência da contratada", cab);

  // bloco de identificação do fornecedor
  autoTable(doc, {
    startY: y,
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9.5, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 36 } },
    margin: { left: M, right: M },
    body: [
      ["Fornecedor:", `${p.fornecedor.razao_social} (${p.fornecedor.codigo})`],
      ["CNPJ:", p.fornecedor.cnpj ?? "—"],
      ["Notas de empenho:", p.blocos.map((b) => b.numero).join(", ")],
    ],
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  let saldoGeral = 0;
  let globalGeral = 0;

  for (const b of p.blocos) {
    const saldoNE = b.itens.reduce((a, it) => a + Number(it.saldo_valor ?? 0), 0);
    saldoGeral += saldoNE;
    globalGeral += Number(b.valor_global ?? 0);

    // título da NE (com quebra de página se necessário)
    if (y + 26 > H - 16) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold").setFontSize(10.5).setTextColor(30, 58, 138);
    doc.text(`Empenho ${b.numero}`, M, y);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(60);
    doc.text(
      `Emissão ${fmtDate(b.data_emissao)}` +
        (b.processo_suap ? ` · Processo SUAP ${b.processo_suap}` : "") +
        (b.fornecedorNome ? ` · ${b.fornecedorNome}` : ""),
      M,
      y + 4.4
    );
    if (b.grupos.length) {
      doc.text(doc.splitTextToSize(`Grupo(s)/Contrato(s): ${b.grupos.join(" · ")}`, W - 2 * M) as string[], M, y + 8.8);
    }
    doc.setTextColor(0);
    y += (b.grupos.length ? 12.5 : 8) + 2;

    const body = b.itens.map((it) => [
      it.codigo_catmat ?? "—",
      it.descricao,
      it.unidade,
      qtd(it.qtd_empenhada, ""),
      qtd(it.consumido_qtd, ""),
      it.saldo_qtd == null ? "—" : qtd(it.saldo_qtd, ""),
      fmtMoney(it.valor_inicial),
      fmtMoney(it.saldo_valor),
    ]);
    if (!body.length) {
      body.push(["—", "Empenho sem itens detalhados", "", "", "", "", "", fmtMoney(0)]);
    }

    autoTable(doc, {
      startY: y,
      head: [[
        "CatMat", "Item", "Un", "Qtd emp.", "Consumido", "Saldo (qtd)", "Saldo inic. (R$)", "Saldo atual (R$)",
      ]],
      body,
      foot: [[
        "", "", "", "", "", "Saldo na NE:", "", fmtMoney(saldoNE),
      ]],
      theme: "grid",
      styles: { font: "helvetica", fontSize: 7.8, cellPadding: 1.3, overflow: "linebreak" },
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 7.8 },
      footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 17 },
        2: { cellWidth: 11, halign: "center" },
        3: { cellWidth: 19, halign: "right" },
        4: { cellWidth: 19, halign: "right" },
        5: { cellWidth: 20, halign: "right" },
        6: { cellWidth: 22, halign: "right" },
        7: { cellWidth: 23, halign: "right" },
      },
      margin: { left: M, right: M },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2;

    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(60);
    doc.text(
      `Valor global do empenho: ${fmtMoney(b.valor_global)}  ·  Saldo em R$ na NE: ${fmtMoney(saldoNE)}`,
      W - M,
      y + 3,
      { align: "right" }
    );
    doc.setTextColor(0);
    y += 9;
  }

  if (multi) {
    if (y + 14 > H - 16) {
      doc.addPage();
      y = 20;
    }
    doc.setDrawColor(30, 58, 138).setLineWidth(0.4);
    doc.line(M, y, W - M, y);
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0);
    doc.text(
      `TOTAL — ${p.blocos.length} NEs · Valor global ${fmtMoney(globalGeral)} · Saldo em R$ ${fmtMoney(saldoGeral)}`,
      W - M,
      y + 6,
      { align: "right" }
    );
    y += 12;
  }

  // rodapé com paginação e nota de geração
  const dataGer = p.dataGeracao ?? new Date();
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5).setTextColor(130);
    doc.text(
      `Saldos de empenho · gerado no CPII SANE Controle em ${dataGer.toLocaleString("pt-BR")}` +
        (p.emitidoPor ? ` por ${p.emitidoPor}` : ""),
      M,
      H - 8
    );
    doc.text(`Página ${i} de ${pages}`, W - M, H - 8, { align: "right" });
    doc.setTextColor(0);
  }

  const base = multi
    ? `saldos-empenhos-${p.fornecedor.codigo.replace(/[^a-zA-Z0-9]+/g, "_")}`
    : `saldo-${(p.blocos[0]?.numero ?? "ne").replace(/[^a-zA-Z0-9]+/g, "_")}`;
  return { doc, filename: `${base}.pdf` };
}
