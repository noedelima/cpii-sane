// PDF do lançamento de uma Nota Fiscal — itens lançados e empenhos associados
// para pagamento. Enviado à empresa para conferir o lançamento e alinhar com o
// controle dela.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtDate, fmtMoney } from "@/lib/format";

export interface NFLancItem {
  codigo_catmat: string | null;
  descricao: string;
  unidade: string;
  quantidade: number;
  valor_unitario: number | null;
  empenho_numero: string | null;
}

export interface NFLancEmpenho {
  numero: string;
  valor_debitado: number;
}

export interface NFLancParams {
  numero: string;
  dataEmissao: string | null;
  dataEntrega: string;
  fornecedor: { codigo: string; razao_social: string; cnpj: string | null };
  grupos: string[];
  valorTotal: number | null;
  processoPagamento: string | null;
  itens: NFLancItem[];
  empenhos: NFLancEmpenho[];
  emitidoPor: string;
  logoDataUrl: string | null;
}

const M = 18;

export function montarPdfNFLancamento(p: NFLancParams): { doc: jsPDF; filename: string } {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  if (p.logoDataUrl) doc.addImage(p.logoDataUrl, "PNG", M, 12, 24, 19.5);
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(0);
  doc.text("COLÉGIO PEDRO II", W / 2, 17, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text("Pró-Reitoria de Administração — PROAD", W / 2, 22.5, { align: "center" });
  doc.text("Seção de Alimentação e Nutrição — SANE", W / 2, 27, { align: "center" });
  doc.setDrawColor(30, 58, 138).setLineWidth(0.6);
  doc.line(M, 34, W - M, 34);
  doc.setFont("helvetica", "bold").setFontSize(12);
  doc.text(`LANÇAMENTO DA NOTA FISCAL Nº ${p.numero}`, W / 2, 43, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(9.5);
  doc.text("Itens e empenhos associados para pagamento", W / 2, 48.5, { align: "center" });

  autoTable(doc, {
    startY: 55,
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9.5, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 40 } },
    margin: { left: M, right: M },
    body: [
      ["Fornecedor:", `${p.fornecedor.razao_social} (${p.fornecedor.codigo})`],
      ["CNPJ:", p.fornecedor.cnpj ?? "—"],
      ["Grupo(s)/Contrato(s):", p.grupos.length ? p.grupos.join("\n") : "—"],
      ["Emissão / Entrega:", `${p.dataEmissao ? fmtDate(p.dataEmissao) : "—"} / ${fmtDate(p.dataEntrega)}`],
      ["Processo de pagamento:", p.processoPagamento || "—"],
    ],
  });
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  // itens da NF
  const somaItens = p.itens.reduce((a, it) => a + it.quantidade * Number(it.valor_unitario ?? 0), 0);
  const bodyItens = p.itens.map((it) => [
    it.codigo_catmat ?? "—",
    it.descricao,
    it.unidade,
    Number(it.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 3 }),
    fmtMoney(it.valor_unitario),
    fmtMoney(it.quantidade * Number(it.valor_unitario ?? 0)),
    it.empenho_numero ?? "—",
  ]);
  if (bodyItens.length) {
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0);
    doc.text("Itens lançados", M, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      head: [["CatMat", "Item", "Un", "Qtd", "Vlr unit.", "Subtotal", "Empenho"]],
      body: bodyItens,
      foot: [["", "", "", "", "Total dos itens:", fmtMoney(somaItens), ""]],
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8, cellPadding: 1.4, overflow: "linebreak" },
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 8 },
      footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 18 },
        2: { cellWidth: 12, halign: "center" },
        3: { cellWidth: 18, halign: "right" },
        4: { cellWidth: 24, halign: "right" },
        5: { cellWidth: 26, halign: "right" },
        6: { cellWidth: 26 },
      },
      margin: { left: M, right: M },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  // empenhos debitados
  const somaEmp = p.empenhos.reduce((a, e) => a + Number(e.valor_debitado ?? 0), 0);
  if (y + 30 > H - 16) {
    doc.addPage();
    y = 20;
  }
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0);
  doc.text("Empenhos associados (débito para pagamento)", M, y);
  y += 2;
  autoTable(doc, {
    startY: y,
    head: [["Nota de empenho", "Valor debitado (R$)"]],
    body: p.empenhos.length
      ? p.empenhos.map((e) => [e.numero, fmtMoney(e.valor_debitado)])
      : [["—", fmtMoney(0)]],
    foot: [["TOTAL DEBITADO", fmtMoney(somaEmp)]],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 1.6 },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 9 },
    footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right", cellWidth: 50 } },
    margin: { left: M, right: M },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  if (y + 16 > H - 16) {
    doc.addPage();
    y = 20;
  }
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(0);
  doc.text(`Valor total da NF: ${fmtMoney(p.valorTotal)}`, M, y);
  const dif = Number(p.valorTotal ?? 0) - somaEmp;
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(Math.abs(dif) < 0.01 ? 22 : 180, Math.abs(dif) < 0.01 ? 130 : 80, 40);
  doc.text(
    Math.abs(dif) < 0.01
      ? "Total da NF conciliado com os empenhos debitados."
      : `Diferença entre o valor da NF e o total debitado: ${fmtMoney(dif)}.`,
    M,
    y + 5
  );
  doc.setTextColor(0);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5).setTextColor(130);
    doc.text(
      `Lançamento da NF ${p.numero} · gerado no CPII SANE Controle em ${new Date().toLocaleString("pt-BR")}` +
        (p.emitidoPor ? ` por ${p.emitidoPor}` : ""),
      M,
      H - 8
    );
    doc.text(`Página ${i} de ${pages}`, W - M, H - 8, { align: "right" });
    doc.setTextColor(0);
  }

  return {
    doc,
    filename: `lancamento-nf-${p.numero.replace(/[^a-zA-Z0-9]+/g, "_")}.pdf`,
  };
}
