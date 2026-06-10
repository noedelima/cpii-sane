// Montagem do PDF de ateste de recebimento (usado na emissão e no histórico).
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtDate, fmtMoney } from "@/lib/format";
import type { Grupo, NotaFiscal } from "@/types/database";

export interface AtesteDocParams {
  atesteId: number;
  dataEmissao: Date;
  fornecedor: { codigo: string; razao_social: string; cnpj: string | null };
  grupoPorId: Map<number, Grupo>;
  nfs: NotaFiscal[];
  processoSuap: string | null;
  localEmissao: string;
  observacoes: string | null;
  assinanteNome: string;
  assinanteMatricula: string | null;
  logoDataUrl: string | null;
}

let logoCache: string | null = null;

/** Carrega o logo institucional (cacheado) como dataURL. */
export async function carregarLogo(): Promise<string | null> {
  if (logoCache) return logoCache;
  try {
    const resp = await fetch(import.meta.env.BASE_URL + "cpii-logo.png");
    const blob = await resp.blob();
    logoCache = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    return logoCache;
  } catch {
    return null;
  }
}

function dataPorExtenso(d: Date): string {
  const meses = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

interface ResumoGrupo {
  grupo: Grupo | undefined;
  qtd: number;
  total: number;
}

export function montarPdfAteste(p: AtesteDocParams): {
  doc: jsPDF;
  numeroDoc: string;
  filename: string;
} {
  const ano = p.dataEmissao.getFullYear();
  const numeroDoc = `${String(p.atesteId).padStart(3, "0")}/${ano}`;

  // resumo por grupo (ordenado pelo número arábico)
  const mapa = new Map<number, ResumoGrupo>();
  for (const n of p.nfs) {
    let e = mapa.get(n.grupo_id);
    if (!e) {
      e = { grupo: p.grupoPorId.get(n.grupo_id), qtd: 0, total: 0 };
      mapa.set(n.grupo_id, e);
    }
    e.qtd++;
    e.total += Number(n.valor_total ?? 0);
  }
  const resumo = [...mapa.values()].sort(
    (a, b) => (a.grupo?.numero_arabico ?? 0) - (b.grupo?.numero_arabico ?? 0)
  );
  const totalGeral = p.nfs.reduce((a, n) => a + Number(n.valor_total ?? 0), 0);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 18;

  if (p.logoDataUrl) doc.addImage(p.logoDataUrl, "PNG", M, 12, 24, 19.5);
  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text("COLÉGIO PEDRO II", W / 2, 17, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text("Pró-Reitoria de Administração — PROAD", W / 2, 22.5, { align: "center" });
  doc.text("Seção de Alimentação e Nutrição — SANE", W / 2, 27, { align: "center" });
  doc.setDrawColor(30, 58, 138).setLineWidth(0.6);
  doc.line(M, 34, W - M, 34);

  doc.setFont("helvetica", "bold").setFontSize(12);
  doc.text(`ATESTE DE RECEBIMENTO Nº ${numeroDoc}`, W / 2, 43, { align: "center" });
  doc.setFontSize(10);
  doc.text("Gêneros alimentícios — fornecimento contratado", W / 2, 48.5, { align: "center" });

  const grupos = resumo
    .map((r) => {
      const g = r.grupo;
      if (!g) return "";
      const partes = [g.nome];
      const refs: string[] = [];
      if (g.numero_ata) refs.push(`Ata ${g.numero_ata}`);
      if (g.numero_tc) refs.push(`TC ${g.numero_tc}`);
      if (g.numero_pregao) refs.push(`Pregão ${g.numero_pregao}`);
      if (refs.length) partes.push(`(${refs.join(" · ")})`);
      return partes.join(" ");
    })
    .filter(Boolean);

  const entregas = p.nfs.map((n) => n.data_entrega).sort();
  const periodo =
    entregas.length > 1
      ? `${fmtDate(entregas[0])} a ${fmtDate(entregas[entregas.length - 1])}`
      : fmtDate(entregas[0]);

  autoTable(doc, {
    startY: 54,
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9.5, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 42 } },
    margin: { left: M, right: M },
    body: [
      ["Fornecedor:", `${p.fornecedor.razao_social} (${p.fornecedor.codigo})`],
      ["CNPJ:", p.fornecedor.cnpj ?? "—"],
      ["Grupo(s)/Contrato(s):", grupos.join("\n")],
      ["Período das entregas:", periodo],
      ["Processo SUAP:", p.processoSuap || "—"],
    ],
  });

  type Row = (string | number)[] & { _sub?: boolean };
  const body: Row[] = [];
  for (const r of resumo) {
    const gid = r.grupo?.id;
    for (const n of p.nfs.filter((x) => x.grupo_id === gid)) {
      body.push([
        r.grupo?.numero_romano ?? "—",
        n.numero,
        fmtDate(n.data_entrega),
        n.processo_pagamento ?? "—",
        fmtMoney(n.valor_total),
      ] as Row);
    }
    const sub = [
      "",
      "",
      "",
      `Subtotal Grupo ${r.grupo?.numero_romano ?? "—"} (${r.qtd} NF${r.qtd > 1 ? "s" : ""})`,
      fmtMoney(r.total),
    ] as Row;
    sub._sub = true;
    body.push(sub);
  }

  autoTable(doc, {
    startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4,
    head: [["Grupo", "Nota Fiscal", "Entrega", "Processo de pagamento", "Valor (R$)"]],
    body: body as unknown as (string | number)[][],
    foot: [["", "", "", `TOTAL GERAL (${p.nfs.length} NFs)`, fmtMoney(totalGeral)]],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.6 },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 8.5 },
    footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 16 },
      1: { cellWidth: 30 },
      2: { cellWidth: 22 },
      4: { cellWidth: 28, halign: "right" },
    },
    margin: { left: M, right: M },
    didParseCell: (hook) => {
      const raw = hook.row.raw as Row;
      if (hook.section === "body" && raw?._sub) {
        hook.cell.styles.fontStyle = "bold";
        hook.cell.styles.fillColor = [241, 245, 249];
      }
      if ((hook.section === "body" || hook.section === "foot") && hook.column.index === 4) {
        hook.cell.styles.halign = "right";
      }
    },
  });

  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  const texto =
    `Atestamos, para fins de liquidação e pagamento, nos termos dos arts. 140 e 141 da ` +
    `Lei nº 14.133/2021, que os gêneros alimentícios relativos às notas fiscais acima ` +
    `relacionadas, fornecidos por ${p.fornecedor.razao_social}` +
    `${p.fornecedor.cnpj ? ", CNPJ " + p.fornecedor.cnpj : ""}, foram entregues nos campi ` +
    `do Colégio Pedro II e conferidos quanto à quantidade e à qualidade, em conformidade ` +
    `com as condições pactuadas no(s) instrumento(s) acima identificado(s).` +
    (p.processoSuap ? ` O presente ateste integra o Processo SUAP nº ${p.processoSuap}.` : "");

  doc.setFont("helvetica", "normal").setFontSize(10);
  const linhas = doc.splitTextToSize(texto, W - 2 * M) as string[];
  const hTexto = linhas.length * 4.6;
  const obsTrim = p.observacoes?.trim() ?? "";
  const hBlocoFinal = hTexto + (obsTrim ? 18 : 0) + 46;
  if (y + hBlocoFinal > doc.internal.pageSize.getHeight() - 14) {
    doc.addPage();
    y = 24;
  }
  doc.text(linhas, M, y);
  y += hTexto + 4;

  if (obsTrim) {
    doc.setFont("helvetica", "bold").setFontSize(9.5);
    doc.text("Observações:", M, y);
    doc.setFont("helvetica", "normal");
    const obs = doc.splitTextToSize(obsTrim, W - 2 * M) as string[];
    doc.text(obs, M, y + 4.6);
    y += 4.6 + obs.length * 4.4 + 4;
  }

  y += 6;
  doc.setFontSize(10);
  doc.text(`${p.localEmissao || "Rio de Janeiro"}, ${dataPorExtenso(p.dataEmissao)}.`, M, y);

  y += 22;
  doc.setDrawColor(60).setLineWidth(0.3);
  doc.line(W / 2 - 45, y, W / 2 + 45, y);
  doc.setFontSize(10);
  doc.text(p.assinanteNome, W / 2, y + 5, { align: "center" });
  doc.setFontSize(8.5).setTextColor(90);
  doc.text("Seção de Alimentação e Nutrição — SANE / Colégio Pedro II", W / 2, y + 9.6, {
    align: "center",
  });
  doc.text(
    p.assinanteMatricula
      ? `Matrícula SIAPE: ${p.assinanteMatricula}`
      : "Matrícula SIAPE: ____________________",
    W / 2,
    y + 14,
    { align: "center" }
  );

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5).setTextColor(130);
    doc.text(
      `Ateste nº ${numeroDoc} · gerado no CPII SANE Controle em ${new Date().toLocaleString("pt-BR")} por ${p.assinanteNome || "—"}`,
      M,
      doc.internal.pageSize.getHeight() - 8
    );
    doc.text(`Página ${i} de ${pages}`, W - M, doc.internal.pageSize.getHeight() - 8, {
      align: "right",
    });
    doc.setTextColor(0);
  }

  const filename = `ateste-${String(p.atesteId).padStart(3, "0")}-${ano}-${p.fornecedor.codigo.replace(/[^a-zA-Z0-9]+/g, "_")}.pdf`;
  return { doc, numeroDoc, filename };
}
