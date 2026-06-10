// Importa o Excel mestre (Controle-Empenhos-SANE.xlsx) para o Supabase.
//
// Uso:
//   node supabase/import.mjs --dry-run          # valida e mostra estatisticas, nao grava
//   node supabase/import.mjs                    # importa (aborta se tabelas nao vazias)
//   node supabase/import.mjs --force            # limpa as tabelas de movimento e reimporta
//   node supabase/import.mjs caminho.xlsx ...   # caminho alternativo do arquivo
//
// Regras de migracao (planilha real tem dados "sujos" conhecidos):
// - Linhas "TOTAL" na aba Empenhos sao subtotais -> ignoradas.
// - Mesmo empenho em N linhas (dotacoes parciais) -> consolidado somando
//   ValorInicial/Reforco/Cancelamento/Anulacao; registrado em observacoes.
// - Mesma NF em N linhas (rateio entre empenhos) -> 1 registro em
//   notas_fiscais (valor_total = soma) + N registros em nf_empenhos.
// - Campos derivados (Utilizado, Saldo, QtdEntregue etc.) NAO sao importados.
// - empenhos.data_emissao nula -> estimada como 01/01 do ano do numero.
// - notas_fiscais.data_entrega nula -> DataEmissao ou DataAberturaProc.
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { connect } from "./db.mjs";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const FORCE = args.includes("--force");
const file = args.find((a) => !a.startsWith("--")) || "tmp/Controle-Empenhos-SANE.xlsx";

// ---------- leitura ----------
const wb = XLSX.read(readFileSync(file), { cellDates: true });

function sheetRows(name) {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error("Aba nao encontrada: " + name);
  const all = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const headers = (all[1] || []).map((h) => (h == null ? "" : String(h).trim()));
  const idx = {};
  headers.forEach((h, i) => { if (h) idx[h] = i; });
  return all.slice(2).map((r) => {
    const o = {};
    for (const h of Object.keys(idx)) o[h] = r[idx[h]] == null ? null : r[idx[h]];
    return o;
  });
}

function s(v) {
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}
function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function dateStr(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  }
  const t = String(v).trim();
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return br[3] + "-" + br[2] + "-" + br[1];
  const iso = t.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return null;
}
function minDate(list) {
  const ds = list.filter(Boolean).sort();
  return ds.length ? ds[0] : null;
}
function distinct(list) {
  return [...new Set(list.filter((x) => x != null))];
}
function round2(n) {
  return Math.round(n * 100) / 100;
}

// ---------- status ----------
const problems = [];
const unknownStatus = new Set();

function mkStatusMapper(dict, fallback, ctx) {
  return (raw) => {
    const t = s(raw);
    if (t == null) return fallback;
    const m = dict[t.toLowerCase()];
    if (m) return m;
    unknownStatus.add(ctx + ": " + JSON.stringify(t));
    return fallback;
  };
}

const stItem = mkStatusMapper(
  { ativo: "ativo", inativo: "inativo", cancelado: "cancelado" },
  "ativo", "itens.Status"
);
const stEmp = mkStatusMapper(
  { ativo: "ativo", esgotado: "esgotado", cancelado: "cancelado", anulado: "anulado" },
  "ativo", "empenhos.Status"
);
const docDict = {
  rascunho: "rascunho",
  pendente: "pendente",
  conferida: "confirmado", conferido: "confirmado", confirmada: "confirmado", confirmado: "confirmado",
  paga: "pago", pago: "pago",
  glosada: "glosado", glosado: "glosado",
  cancelada: "cancelado", cancelado: "cancelado",
};
const stNF = mkStatusMapper(docDict, "pendente", "notas_fiscais.Status");
const stRec = mkStatusMapper(docDict, "pendente", "recibos.Status");

// ---------- conexao e mapas de referencia ----------
const client = await connect();

const gq = await client.query("select id, nome, numero_romano, fornecedor_id from public.grupos");
const fq = await client.query("select id, codigo, razao_social from public.fornecedores");
const cq = await client.query("select id, nome, sigla from public.campi");
const grupoByNome = new Map(gq.rows.map((r) => [r.nome.toLowerCase(), r]));
const grupoByRomano = new Map(gq.rows.map((r) => [r.numero_romano.toUpperCase(), r]));
const fornByCod = new Map();
for (const r of fq.rows) {
  fornByCod.set(r.codigo.toLowerCase(), r.id);
  fornByCod.set(r.razao_social.toLowerCase(), r.id);
}
const campusByNome = new Map();
for (const r of cq.rows) {
  campusByNome.set(r.nome.toLowerCase(), r.id);
  campusByNome.set(r.sigla.toLowerCase(), r.id);
}

function grupo(raw, ctx) {
  const t = s(raw);
  if (t == null) { problems.push(ctx + ": grupo vazio"); return null; }
  const exact = grupoByNome.get(t.toLowerCase());
  if (exact) return exact;
  const m = t.toUpperCase().match(/(?:GRUPO\s+)?\b([IVX]+)\b/);
  if (m) {
    const byRoman = grupoByRomano.get(m[1]);
    if (byRoman) return byRoman;
  }
  problems.push(ctx + ": grupo nao resolvido: " + JSON.stringify(t));
  return null;
}
function fornecedor(raw) {
  const t = s(raw);
  if (t == null) return null;
  return fornByCod.get(t.toLowerCase()) || null;
}
function campus(raw, ctx) {
  const t = s(raw);
  if (t == null) { problems.push(ctx + ": campus vazio"); return null; }
  const id = campusByNome.get(t.toLowerCase());
  if (!id) problems.push(ctx + ": campus nao resolvido: " + JSON.stringify(t));
  return id || null;
}

// ---------- Itens ----------
const itens = [];
for (const [i, r] of sheetRows("Itens").entries()) {
  if (s(r["Descricao"]) == null) continue;
  const g = grupo(r["Grupo"], "Itens[" + (i + 3) + "]");
  if (!g) continue;
  itens.push({
    grupo_id: g.id,
    descricao: s(r["Descricao"]),
    codigo_catmat: s(r["CodigoCatMat"]),
    unidade: s(r["Unidade"]) || "un",
    preco_unitario: num(r["PrecoUnit"]) ?? 0,
    quantidade_ata: num(r["QtdAta"]) ?? 0,
    status: stItem(r["Status"]),
  });
}

// ---------- Empenhos (consolidando linhas multiplas) ----------
const empLinhas = sheetRows("Empenhos").filter((r) => {
  const n = s(r["NumeroEmpenho"]);
  return n != null && !n.toUpperCase().includes("TOTAL");
});
const empAgg = new Map();
for (const [i, r] of empLinhas.entries()) {
  const numero = s(r["NumeroEmpenho"]);
  const ctx = "Empenhos[" + (i + 3) + "]";
  let e = empAgg.get(numero);
  if (!e) {
    e = {
      numero,
      datas: [],
      fornecedor_id: null,
      valor_inicial: 0, reforco: 0, cancelamento: 0, anulacao: 0,
      statusRaw: null,
      linhas: 0,
      _grupoFallback: null,
    };
    empAgg.set(numero, e);
  }
  e.linhas++;
  e.datas.push(dateStr(r["DataEmissao"]));
  e.fornecedor_id = e.fornecedor_id ?? fornecedor(r["Fornecedor"]);
  e.valor_inicial += num(r["ValorInicial"]) ?? 0;
  e.reforco += num(r["Reforco"]) ?? 0;
  e.cancelamento += num(r["Cancelamento"]) ?? 0;
  e.anulacao += num(r["Anulacao"]) ?? 0;
  e.statusRaw = e.statusRaw ?? s(r["Status"]);
  e._grupoFallback = e._grupoFallback ?? grupo(r["Grupo"], ctx);
}
const empenhos = [...empAgg.values()].map((e) => {
  let data = minDate(e.datas);
  const obs = [];
  if (data == null) {
    const ano = e.numero.match(/^(\d{4})NE/);
    data = (ano ? ano[1] : "2023") + "-01-01";
    obs.push("Data de emissao nao informada na planilha migrada; estimada como " + data + ".");
  }
  if (e.linhas > 1) {
    obs.push("Consolidado de " + e.linhas + " linhas (dotacoes parciais) da planilha migrada.");
  }
  return {
    numero: e.numero,
    data_emissao: data,
    fornecedor_id: e.fornecedor_id,
    valor_inicial: round2(e.valor_inicial),
    reforco: round2(e.reforco),
    cancelamento: round2(e.cancelamento),
    anulacao: round2(e.anulacao),
    status: stEmp(e.statusRaw),
    observacoes: obs.length ? obs.join(" ") : null,
    _grupoFallback: e._grupoFallback,
  };
});

// ---------- Empenhos_Grupos (agregando por empenho+grupo) ----------
const egAgg = new Map();
for (const [i, r] of sheetRows("Empenhos_Grupos").entries()) {
  const numero = s(r["NumeroEmpenho"]);
  if (numero == null || numero.toUpperCase().includes("TOTAL")) continue;
  const g = grupo(r["Grupo"], "Empenhos_Grupos[" + (i + 3) + "]");
  if (!g) continue;
  const k = numero + "|" + g.id;
  let e = egAgg.get(k);
  if (!e) {
    e = { _numeroEmpenho: numero, grupo_id: g.id, valor_alocado: 0, percentual: 0, obs: [] };
    egAgg.set(k, e);
  }
  e.valor_alocado += num(r["ValorAlocado"]) ?? 0;
  e.percentual += num(r["PctGrupo"]) ?? 0;
  const o = s(r["Observacoes"]);
  if (o) e.obs.push(o);
}
const empGrupos = [...egAgg.values()].map((e) => ({
  _numeroEmpenho: e._numeroEmpenho,
  grupo_id: e.grupo_id,
  valor_alocado: round2(e.valor_alocado),
  percentual: e.percentual > 0 ? Math.min(round2(e.percentual), 100) : null,
  observacoes: e.obs.length ? distinct(e.obs).join(" ") : null,
}));

// ---------- Notas Fiscais (consolidando rateios em nf_empenhos) ----------
const nfAgg = new Map();
for (const [i, r] of sheetRows("NotasFiscais").entries()) {
  const numero = s(r["NumeroNF"]);
  if (numero == null) continue;
  const ctx = "NotasFiscais[" + (i + 3) + "]";
  const g = grupo(r["Grupo"], ctx);
  if (!g) continue;
  const k = numero + "|" + g.id;
  let n = nfAgg.get(k);
  if (!n) {
    n = {
      numero, grupo_id: g.id, fornecedor_id: g.fornecedor_id,
      emissoes: [], entregas: [], aberturas: [],
      processos: [], ocorrencias: [], links: [], observ: [],
      statusRaw: null, valor_total: 0, rateios: new Map(), linhas: 0,
      _numeroRecibo: null,
    };
    nfAgg.set(k, n);
  }
  n.linhas++;
  n.emissoes.push(dateStr(r["DataEmissao"]));
  n.entregas.push(dateStr(r["DataEntrega"]));
  n.aberturas.push(dateStr(r["DataAberturaProc"]));
  n.processos.push(s(r["ProcessoPagamento"]));
  n.ocorrencias.push(s(r["Ocorrencias"]));
  n.links.push(s(r["LinkPDF"]));
  n.observ.push(s(r["Observacoes"]));
  n.statusRaw = n.statusRaw ?? s(r["Status"]);
  n._numeroRecibo = n._numeroRecibo ?? s(r["Recibo"]);
  const v = num(r["ValorTotalNF"]) ?? 0;
  n.valor_total += v;
  const emp = s(r["Empenho"]);
  if (emp) n.rateios.set(emp, (n.rateios.get(emp) || 0) + v);
  else problems.push(ctx + ": NF " + numero + " sem empenho na linha");
}
const nfs = [...nfAgg.values()].map((n) => {
  const de = minDate(n.emissoes);
  const dabert = minDate(n.aberturas);
  let dent = minDate(n.entregas);
  const obs = distinct(n.observ);
  if (dent == null) {
    dent = de || dabert;
    if (dent == null) {
      dent = "2025-01-01";
      obs.push("Data de entrega indisponivel na migracao; placeholder 2025-01-01.");
    } else {
      obs.push("Data de entrega estimada na migracao (emissao/abertura do processo).");
    }
  }
  if (n.linhas > 1) {
    obs.push("Consolidada de " + n.linhas + " linhas da planilha (rateio entre empenhos em nf_empenhos).");
  }
  return {
    numero: n.numero,
    data_emissao: de,
    data_entrega: dent,
    grupo_id: n.grupo_id,
    fornecedor_id: n.fornecedor_id,
    valor_total: round2(n.valor_total),
    processo_pagamento: distinct(n.processos).join("; ") || null,
    data_abertura_processo: dabert,
    link_pdf: distinct(n.links)[0] || null,
    ocorrencias: distinct(n.ocorrencias).join(" ") || null,
    observacoes: obs.join(" ") || null,
    status: stNF(n.statusRaw),
    _rateios: [...n.rateios.entries()].map(([emp, v]) => ({ numeroEmpenho: emp, valor: round2(v) })),
    _numeroRecibo: n._numeroRecibo,
  };
});

// ---------- Recibos ----------
const recibos = [];
for (const [i, r] of sheetRows("Recibos").entries()) {
  const numero = s(r["NumeroRecibo"]);
  if (numero == null) continue;
  const ctx = "Recibos[" + (i + 3) + "]";
  const g = grupo(r["Grupo"], ctx);
  const c = campus(r["Campus"], ctx);
  if (!g || !c) continue;
  recibos.push({
    numero,
    data_recebimento: dateStr(r["DataRecebimento"]) || "2026-01-01",
    campus_id: c,
    grupo_id: g.id,
    fornecedor_id: fornecedor(r["Fornecedor"]) || g.fornecedor_id,
    _numeroNF: s(r["NumeroNFAssoc"]),
    link_pdf: s(r["LinkPDFRecibo"]),
    observacoes: s(r["Observacoes"]),
    status: stRec(r["Status"]),
  });
}

// ---------- empenhos placeholder ----------
// NFs migradas podem referenciar empenhos ausentes da aba Empenhos (ex.:
// 2023NE000344). Criamos placeholder com valor 0 e status esgotado para nao
// perder o rateio; o valor empenhado real deve ser completado depois (SIAFI).
const conhecidos = new Set(empenhos.map((e) => e.numero));
const faltantes = new Map();
for (const n of nfs) {
  for (const rat of n._rateios) {
    if (!conhecidos.has(rat.numeroEmpenho)) {
      let f = faltantes.get(rat.numeroEmpenho);
      if (!f) { f = { grupoIds: new Set(), soma: 0, qtd: 0 }; faltantes.set(rat.numeroEmpenho, f); }
      f.grupoIds.add(n.grupo_id);
      f.soma += rat.valor;
      f.qtd++;
    }
  }
}
for (const [numero, f] of faltantes) {
  const ano = numero.match(/^(\d{4})NE/);
  const gid = [...f.grupoIds][0];
  const g = gq.rows.find((x) => x.id === gid) || null;
  empenhos.push({
    numero,
    data_emissao: (ano ? ano[1] : "2023") + "-01-01",
    fornecedor_id: g ? g.fornecedor_id : null,
    valor_inicial: 0, reforco: 0, cancelamento: 0, anulacao: 0,
    status: "esgotado",
    observacoes: "Empenho criado na migracao: referenciado por " + f.qtd +
      " rateios de NF (R$ " + f.soma.toFixed(2) + ") mas ausente da aba Empenhos. " +
      "Data estimada; valor empenhado a completar (consultar SIAFI).",
    _grupoFallback: g,
  });
  console.log("placeholder de empenho: " + numero + " (" + f.qtd + " rateios, R$ " + f.soma.toFixed(2) + ")");
}

// ---------- relatorio ----------
const totalRateios = nfs.reduce((a, n) => a + n._rateios.length, 0);
console.log("");
console.log("== Estatisticas da carga ==");
console.log("itens:           " + itens.length);
console.log("empenhos:        " + empenhos.length + " (consolidados de " + empLinhas.length + " linhas)");
console.log("empenhos_grupos: " + empGrupos.length);
console.log("notas_fiscais:   " + nfs.length + " (consolidadas de " + [...nfAgg.values()].reduce((a, n) => a + n.linhas, 0) + " linhas)");
console.log("nf_empenhos:     " + totalRateios + " rateios");
console.log("recibos:         " + recibos.length);
const somaNF = nfs.reduce((a, n) => a + (n.valor_total || 0), 0);
const somaRat = nfs.reduce((a, n) => a + n._rateios.reduce((b, r) => b + r.valor, 0), 0);
const somaEmp = empenhos.reduce((a, e) => a + e.valor_inicial + e.reforco - e.cancelamento - e.anulacao, 0);
console.log("soma valor_total NFs:  R$ " + somaNF.toFixed(2));
console.log("soma rateios:          R$ " + somaRat.toFixed(2) + " (deve igualar a soma das NFs)");
console.log("soma liquida empenhos: R$ " + somaEmp.toFixed(2));

if (unknownStatus.size) {
  console.log("\n!! STATUS DESCONHECIDOS (mapeados para fallback):");
  for (const u of unknownStatus) console.log("   - " + u);
}
if (problems.length) {
  console.log("\n!! PROBLEMAS (" + problems.length + "):");
  for (const p of problems.slice(0, 40)) console.log("   - " + p);
  if (problems.length > 40) console.log("   ... e mais " + (problems.length - 40));
}

if (DRY) {
  console.log("\n--dry-run: nada gravado.");
  await client.end();
  process.exit(0);
}
if (problems.length || unknownStatus.size) {
  console.error("\nABORTADO: resolva os problemas acima (ou ajuste o script) antes de importar.");
  await client.end();
  process.exit(1);
}

// ---------- gravacao ----------
const moveTables = ["nf_empenhos", "nf_itens", "recibos_itens", "notas_fiscais", "recibos", "empenhos_grupos", "empenhos", "itens"];

const counts = await client.query(
  "select " + moveTables.map((t) => "(select count(*) from public." + t + ") as " + t).join(", ")
);
const nonEmpty = moveTables.filter((t) => Number(counts.rows[0][t]) > 0);
if (nonEmpty.length && !FORCE) {
  console.error("\nABORTADO: tabelas nao vazias: " + nonEmpty.join(", ") + ". Use --force para limpar e reimportar.");
  await client.end();
  process.exit(1);
}

async function insertChunked(table, cols, rows, returning) {
  const out = [];
  const CH = 400;
  for (let off = 0; off < rows.length; off += CH) {
    const chunk = rows.slice(off, off + CH);
    const params = [];
    const tuples = chunk.map((row, ri) => {
      const ph = cols.map((c, ci) => {
        params.push(row[c]);
        return "$" + (ri * cols.length + ci + 1);
      });
      return "(" + ph.join(",") + ")";
    });
    const sql =
      "insert into public." + table + " (" + cols.join(",") + ") values " +
      tuples.join(",") + (returning ? " returning " + returning : "");
    const r = await client.query(sql, params);
    if (returning) out.push(...r.rows);
  }
  return out;
}

try {
  await client.query("begin");

  if (FORCE && nonEmpty.length) {
    for (const t of moveTables) await client.query("delete from public." + t);
    console.log("\ntabelas de movimento limpas (--force).");
  }

  await insertChunked("itens",
    ["grupo_id", "descricao", "codigo_catmat", "unidade", "preco_unitario", "quantidade_ata", "status"],
    itens);

  const empRows = await insertChunked("empenhos",
    ["numero", "data_emissao", "fornecedor_id", "valor_inicial", "reforco", "cancelamento", "anulacao", "status", "observacoes"],
    empenhos, "id, numero");
  const empByNumero = new Map(empRows.map((r) => [r.numero, r.id]));

  const egRows = [];
  const covered = new Set();
  for (const eg of empGrupos) {
    const empId = empByNumero.get(eg._numeroEmpenho);
    if (!empId) { console.log("aviso: Empenhos_Grupos referencia empenho inexistente: " + eg._numeroEmpenho); continue; }
    covered.add(eg._numeroEmpenho);
    egRows.push({ empenho_id: empId, grupo_id: eg.grupo_id, valor_alocado: eg.valor_alocado, percentual: eg.percentual, observacoes: eg.observacoes });
  }
  for (const e of empenhos) {
    if (!covered.has(e.numero) && e._grupoFallback) {
      egRows.push({
        empenho_id: empByNumero.get(e.numero),
        grupo_id: e._grupoFallback.id,
        valor_alocado: round2(e.valor_inicial + e.reforco - e.cancelamento - e.anulacao),
        percentual: 100,
        observacoes: "Alocacao derivada da aba Empenhos (ausente em Empenhos_Grupos).",
      });
    }
  }
  await insertChunked("empenhos_grupos",
    ["empenho_id", "grupo_id", "valor_alocado", "percentual", "observacoes"], egRows);

  const nfRows = await insertChunked("notas_fiscais",
    ["numero", "data_emissao", "data_entrega", "grupo_id", "fornecedor_id", "valor_total",
     "processo_pagamento", "data_abertura_processo", "link_pdf", "ocorrencias", "observacoes", "status"],
    nfs, "id, numero, grupo_id");
  const nfByKey = new Map(nfRows.map((r) => [r.numero + "|" + r.grupo_id, r.id]));

  const rateioRows = [];
  for (const n of nfs) {
    const nfId = nfByKey.get(n.numero + "|" + n.grupo_id);
    for (const rat of n._rateios) {
      const empId = empByNumero.get(rat.numeroEmpenho);
      if (!empId) { console.log("aviso: NF " + n.numero + " rateia empenho inexistente: " + rat.numeroEmpenho); continue; }
      rateioRows.push({ nf_id: nfId, empenho_id: empId, valor_debitado: rat.valor, observacoes: null });
    }
  }
  await insertChunked("nf_empenhos",
    ["nf_id", "empenho_id", "valor_debitado", "observacoes"], rateioRows);

  const recInsert = recibos.map((r) => ({
    ...r,
    nf_id: r._numeroNF ? nfByKey.get(r._numeroNF + "|" + r.grupo_id) || null : null,
  }));
  await insertChunked("recibos",
    ["numero", "data_recebimento", "campus_id", "grupo_id", "fornecedor_id", "nf_id", "link_pdf", "observacoes", "status"],
    recInsert);

  await client.query("commit");
  console.log("\nIMPORTACAO CONCLUIDA.");
} catch (e) {
  await client.query("rollback");
  console.error("\nROLLBACK por erro: " + (e.message || e));
  process.exitCode = 1;
} finally {
  const final = await client.query(
    "select " + moveTables.map((t) => "(select count(*) from public." + t + ") as " + t).join(", ")
  );
  console.log("contagens no banco:", JSON.stringify(final.rows[0]));
  await client.end();
}
