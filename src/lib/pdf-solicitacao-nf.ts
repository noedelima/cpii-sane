// PDF da solicitação de emissão de NF — relação consolidada das entregas
// (recibos) de uma empresa, com as quantidades finais por item, para a empresa
// conferir e emitir a Nota Fiscal correspondente.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtDate, fmtMoney } from "@/lib/format";

export interface SolicNFItem {
  codigo_catmat: string | null;
  descricao: string;
  unidade: string;
  quantidade: number; // quantidade final consolidada (soma dos recibos)
  valor_unitario: number; // preço vigente do catálogo (estimativa)
}

export interface SolicNFRecibo {
  numero: string;
  campus: string;
  data_recebimento: string;
}

export interface SolicNFParams {
  solicitacaoId: number | null;
  dataSolicitacao: Date;
  fornecedor: { codigo: string; razao_social: string; cnpj: string | null };
  grupos: string[];
  periodo: { inicio: string | null; fim: string | null } | null;
  recibos: SolicNFRecibo[];
  itens: SolicNFItem[];
  observacoes: string | null;
  emitidoPor: string;
  logoDataUrl: string | null;
}

const M = 18;

export function montarPdfSolicitacaoNF(p: SolicNFParams): { doc: jsPDF; filename: string } {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const ano = p.dataSolicitacao.getFullYear();
  const numeroDoc = p.solicitacaoId ? `${String(p.solicitacaoId).padStart(3, "0")}/${ano}` : "—";

  if (p.logoDataUrl) doc.addImage(p.logoDataUrl, "PNG", M, 12, 24, 19.5);
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(0);
  doc.text("COLÉGIO PEDRO II", W / 2, 17, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text("Pró-Reitoria de Administração — PROAD", W / 2, 22.5, { align: "center" });
  doc.text("Seção de Alimentação e Nutrição — SANE", W / 2, 27, { align: "center" });
  doc.setDrawColor(30, 58, 138).setLineWidth(0.6);
  doc.line(M, 34, W - M, 34);
  doc.setFont("helvetica", "bold").setFontSize(12);
  doc.text(`SOLICITAÇÃO DE EMISSÃO DE NF Nº ${numeroDoc}`, W / 2, 43, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(9.5);
  doc.text("Relação de entregas para emissão da nota fiscal", W / 2, 48.5, { align: "center" });

  const periodoTxt = p.periodo?.inicio
    ? `${fmtDate(p.periodo.inicio)}${p.periodo.fim ? " a " + fmtDate(p.periodo.fim) : ""}`
    : "—";

  autoTable(doc, {
    startY: 55,
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9.5, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 42 } },
    margin: { left: M, right: M },
    body: [
      ["Fornecedor:", `${p.fornecedor.razao_social} (${p.fornecedor.codigo})`],
      ["CNPJ:", p.fornecedor.cnpj ?? "—"],
      ["Grupo(s)/Contrato(s):", p.grupos.length ? p.grupos.join("\n") : "—"],
      ["Período das entregas:", periodoTxt],
      ["Data da solicitação:", fmtDate(p.dataSolicitacao.toISOString().slice(0, 10))],
    ],
  });
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  // quantidades finais consolidadas
  const totalEstimado = p.itens.reduce((a, it) => a + it.quantidade * Number(it.valor_unitario ?? 0), 0);
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0);
  doc.text("Quantidades finais da entrega (consolidado)", M, y);
  y += 2;
  autoTable(doc, {
    startY: y,
    head: [["CatMat", "Item", "Un", "Qtd total", "Vlr unit. (ref.)", "Total (ref.)"]],
    body: p.itens.length
      ? p.itens.map((it) => [
          it.codigo_catmat ?? "—",
          it.descricao,
          it.unidade,
          Number(it.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 3 }),
          fmtMoney(it.valor_unitario),
          fmtMoney(it.quantidade * Number(it.valor_unitario ?? 0)),
        ])
      : [["—", "Nenhum item nos recibos selecionados", "", "", "", fmtMoney(0)]],
    foot: [["", "", "", "", "Total estimado:", fmtMoney(totalEstimado)]],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 1.4, overflow: "linebreak" },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 8 },
    footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 18 },
      2: { cellWidth: 12, halign: "center" },
      3: { cellWidth: 22, halign: "right" },
      4: { cellWidth: 28, halign: "right" },
      5: { cellWidth: 28, halign: "right" },
    },
    margin: { left: M, right: M },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  // recibos incluídos
  if (y + 24 > H - 16) {
    doc.addPage();
    y = 20;
  }
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0);
  doc.text(`Recibos incluídos (${p.recibos.length})`, M, y);
  y += 2;
  autoTable(doc, {
    startY: y,
    head: [["Recibo", "Campus", "Recebimento"]],
    body: p.recibos.length
      ? p.recibos.map((r) => [r.numero, r.campus, fmtDate(r.data_recebimento)])
      : [["—", "—", "—"]],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.4 },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 8.5 },
    columnStyles: { 2: { cellWidth: 32 } },
    margin: { left: M, right: M },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  const obs = p.observacoes?.trim();
  if (obs) {
    if (y + 16 > H - 16) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(0);
    doc.text("Observações:", M, y);
    doc.setFont("helvetica", "normal");
    const linhas = doc.splitTextToSize(obs, W - 2 * M) as string[];
    doc.text(linhas, M, y + 4.6);
    y += 4.6 + linhas.length * 4.4 + 4;
  }

  if (y + 14 > H - 16) {
    doc.addPage();
    y = 20;
  }
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(80);
  const nota = doc.splitTextToSize(
    "Solicitamos a emissão da nota fiscal correspondente às entregas acima relacionadas. " +
      "Os valores unitários são de referência (preço vigente do contrato) e podem ser ajustados " +
      "conforme o faturamento. Após a emissão, encaminhar a NF à SANE para lançamento e associação aos empenhos.",
    W - 2 * M
  ) as string[];
  doc.text(nota, M, y + 4);
  doc.setTextColor(0);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5).setTextColor(130);
    doc.text(
      `Solicitação de NF nº ${numeroDoc} · gerada no CPII SANE Controle em ${new Date().toLocaleString("pt-BR")}` +
        (p.emitidoPor ? ` por ${p.emitidoPor}` : ""),
      M,
      H - 8
    );
    doc.text(`Página ${i} de ${pages}`, W - M, H - 8, { align: "right" });
    doc.setTextColor(0);
  }

  const base = p.solicitacaoId
    ? `solicitacao-nf-${String(p.solicitacaoId).padStart(3, "0")}-${ano}`
    : `solicitacao-nf-${p.fornecedor.codigo.replace(/[^a-zA-Z0-9]+/g, "_")}`;
  return { doc, filename: `${base}.pdf` };
}
