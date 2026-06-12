<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { supabase } from "@/lib/supabase";
import { fmtMoney } from "@/lib/format";
import type { Fornecedor, Grupo, Item } from "@/types/database";

interface LinhaItem extends Item {
  _saving?: boolean;
  _savedAt?: number;
}

const route = useRoute();
const router = useRouter();

const grupoId = computed(() => (route.params.id ? Number(route.params.id) : null));
const editMode = computed(() => grupoId.value != null);

const fornecedores = ref<Fornecedor[]>([]);

const nome = ref("");
const numeroArabico = ref<number | null>(null);
const numeroRomano = ref("");
const categoria = ref("");
const fornecedorId = ref<number | null>(null);
const numeroAta = ref("");
const numeroTc = ref("");
const numeroPregao = ref("");
const vigenciaInicio = ref("");
const vigenciaFim = ref("");
const status = ref<Grupo["status"]>("vigente");

const itens = ref<LinhaItem[]>([]);
const buscaItem = ref("");

const novoItem = ref({ codigo_catmat: "", descricao: "", unidade: "kg", preco_unitario: null as number | null });

const loading = ref(false);
const saving = ref(false);
const addingItem = ref(false);
const error = ref<string | null>(null);

// reajuste contratual (apostilamento)
const reajPercentual = ref<number | null>(null);
const reajDataBase = ref(new Date().toISOString().slice(0, 10));
const reajReferencia = ref("");
const reajAplicando = ref(false);
const reajResultado = ref<string | null>(null);

async function aplicarReajuste() {
  error.value = null;
  reajResultado.value = null;
  if (!grupoId.value || reajPercentual.value == null || !reajDataBase.value) {
    error.value = "Informe o percentual e a data-base do reajuste.";
    return;
  }
  const ok = confirm(
    `Aplicar reajuste de ${reajPercentual.value}% sobre TODOS os itens ativos deste grupo, ` +
      `com data-base ${reajDataBase.value.split("-").reverse().join("/")}?\n\n` +
      `Os preços vigentes serão atualizados e o histórico preservado. ` +
      `ATENÇÃO: aplicar duas vezes acumula o percentual.`
  );
  if (!ok) return;
  reajAplicando.value = true;
  try {
    const { data, error: err } = await supabase.rpc("aplicar_reajuste_grupo", {
      p_grupo_id: grupoId.value,
      p_percentual: reajPercentual.value,
      p_data_base: reajDataBase.value,
      p_referencia: reajReferencia.value.trim() || null,
    });
    if (err) throw err;
    type R = { item_ref: string; preco_antigo: number; preco_novo: number };
    const rows = ((data as unknown as R[]) ?? []);
    reajResultado.value =
      `Reajuste aplicado a ${rows.length} item(ns). ` +
      (rows.length
        ? `Ex.: ${rows[0].item_ref}: ${fmtMoney(rows[0].preco_antigo)} → ${fmtMoney(rows[0].preco_novo)}.`
        : "");
    reajPercentual.value = null;
    reajReferencia.value = "";
    await loadGrupo();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Falha ao aplicar o reajuste.";
  } finally {
    reajAplicando.value = false;
  }
}

const romanos = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];

function sugerirRomano() {
  if (numeroArabico.value && numeroArabico.value >= 1 && numeroArabico.value <= 20 && !numeroRomano.value) {
    numeroRomano.value = romanos[numeroArabico.value - 1];
  }
}

const itensFiltrados = computed(() => {
  const q = buscaItem.value.trim().toLowerCase();
  if (!q) return itens.value;
  return itens.value.filter(
    (i) =>
      (i.codigo_catmat ?? "").toLowerCase().includes(q) ||
      i.descricao.toLowerCase().includes(q)
  );
});

async function loadRefs() {
  const { data } = await supabase
    .from("fornecedores")
    .select("*")
    .eq("status", "ativo")
    .order("codigo");
  fornecedores.value = (data as Fornecedor[] | null) ?? [];
}

async function loadGrupo() {
  if (!grupoId.value) return;
  loading.value = true;
  const [g, i] = await Promise.all([
    supabase.from("grupos").select("*").eq("id", grupoId.value).single(),
    supabase.from("itens").select("*").eq("grupo_id", grupoId.value).order("descricao"),
  ]);
  if (g.error) {
    error.value = g.error.message;
    loading.value = false;
    return;
  }
  const gr = g.data as Grupo;
  nome.value = gr.nome;
  numeroArabico.value = gr.numero_arabico;
  numeroRomano.value = gr.numero_romano;
  categoria.value = gr.categoria;
  fornecedorId.value = gr.fornecedor_id;
  numeroAta.value = gr.numero_ata ?? "";
  numeroTc.value = gr.numero_tc ?? "";
  numeroPregao.value = gr.numero_pregao ?? "";
  vigenciaInicio.value = gr.vigencia_inicio ?? "";
  vigenciaFim.value = gr.vigencia_fim ?? "";
  status.value = gr.status;
  itens.value = ((i.data as LinhaItem[] | null) ?? []).map((x) => ({
    ...x,
    preco_unitario: Number(x.preco_unitario),
  }));
  loading.value = false;
}

async function salvarGrupo() {
  error.value = null;
  if (!nome.value.trim() || !numeroArabico.value || !numeroRomano.value.trim() || !categoria.value.trim()) {
    error.value = "Preencha nome, número (arábico e romano) e categoria.";
    return;
  }
  saving.value = true;
  try {
    const payload = {
      nome: nome.value.trim(),
      numero_arabico: numeroArabico.value,
      numero_romano: numeroRomano.value.trim().toUpperCase(),
      categoria: categoria.value.trim(),
      fornecedor_id: fornecedorId.value,
      numero_ata: numeroAta.value.trim() || null,
      numero_tc: numeroTc.value.trim() || null,
      numero_pregao: numeroPregao.value.trim() || null,
      vigencia_inicio: vigenciaInicio.value || null,
      vigencia_fim: vigenciaFim.value || null,
      status: status.value,
    };
    if (editMode.value && grupoId.value) {
      const { error: err } = await supabase.from("grupos").update(payload).eq("id", grupoId.value);
      if (err) throw err;
      router.push("/grupos");
    } else {
      const { data, error: err } = await supabase
        .from("grupos")
        .insert(payload)
        .select("id")
        .single();
      if (err || !data) throw err ?? new Error("Falha ao criar grupo.");
      // segue para a edição para liberar o cadastro de itens
      router.replace(`/grupos/${(data as { id: number }).id}`);
      await loadGrupo();
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Erro ao salvar.";
  } finally {
    saving.value = false;
  }
}

async function addItem() {
  error.value = null;
  const n = novoItem.value;
  if (!n.descricao.trim() || !n.unidade.trim() || n.preco_unitario == null) {
    error.value = "Preencha descrição, unidade e valor unitário do item.";
    return;
  }
  addingItem.value = true;
  const { error: err } = await supabase.from("itens").insert({
    grupo_id: grupoId.value,
    codigo_catmat: n.codigo_catmat.trim() || null,
    descricao: n.descricao.trim(),
    unidade: n.unidade.trim(),
    preco_unitario: n.preco_unitario,
    status: "ativo",
  });
  addingItem.value = false;
  if (err) {
    error.value = err.message.includes("uq_itens_grupo_catmat")
      ? `Já existe item com o CatMat ${n.codigo_catmat} neste grupo.`
      : err.message;
    return;
  }
  novoItem.value = { codigo_catmat: "", descricao: "", unidade: n.unidade, preco_unitario: null };
  await loadGrupo();
}

async function salvarItem(l: LinhaItem) {
  l._saving = true;
  error.value = null;
  const { error: err } = await supabase
    .from("itens")
    .update({
      codigo_catmat: l.codigo_catmat?.trim() || null,
      descricao: l.descricao.trim(),
      unidade: l.unidade.trim(),
      preco_unitario: l.preco_unitario,
      status: l.status,
    })
    .eq("id", l.id);
  l._saving = false;
  if (err) {
    error.value = err.message.includes("uq_itens_grupo_catmat")
      ? `CatMat ${l.codigo_catmat} já usado em outro item deste grupo.`
      : err.message;
    return;
  }
  l._savedAt = Date.now();
  setTimeout(() => (l._savedAt = undefined), 1500);
}

onMounted(async () => {
  await loadRefs();
  await loadGrupo();
});
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <h1 class="text-2xl font-semibold">
      {{ editMode ? `Grupo ${numeroRomano || "…"} — ${categoria || ""}` : "Novo grupo" }}
    </h1>

    <div v-if="loading" class="card p-6 text-center text-slate-500 dark:text-slate-400">Carregando…</div>

    <template v-else>
      <div class="card p-5 space-y-4">
        <h2 class="font-medium text-slate-700 dark:text-slate-200">Identificação do contrato</h2>
        <div class="grid sm:grid-cols-2 gap-4">
          <div class="sm:col-span-2">
            <label class="label">Nome do grupo</label>
            <input v-model="nome" type="text" class="input" placeholder="Grupo XI - Categoria - FORNECEDOR" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">Nº (arábico)</label>
              <input v-model.number="numeroArabico" type="number" min="1" class="input" @change="sugerirRomano" />
            </div>
            <div>
              <label class="label">Nº (romano)</label>
              <input v-model="numeroRomano" type="text" class="input" />
            </div>
          </div>
          <div>
            <label class="label">Categoria</label>
            <input v-model="categoria" type="text" class="input" placeholder="Hortifruti, Carnes, Estocáveis…" />
          </div>
          <div>
            <label class="label">Fornecedor</label>
            <select v-model="fornecedorId" class="input">
              <option :value="null">—</option>
              <option v-for="f in fornecedores" :key="f.id" :value="f.id">
                {{ f.codigo }} — {{ f.razao_social }}
              </option>
            </select>
          </div>
          <div>
            <label class="label">Status</label>
            <select v-model="status" class="input">
              <option value="vigente">Vigente</option>
              <option value="suspenso">Suspenso</option>
              <option value="encerrado">Encerrado</option>
            </select>
          </div>
          <div>
            <label class="label">Nº da Ata</label>
            <input v-model="numeroAta" type="text" class="input" />
          </div>
          <div>
            <label class="label">Nº do TC</label>
            <input v-model="numeroTc" type="text" class="input" />
          </div>
          <div>
            <label class="label">Nº do Pregão</label>
            <input v-model="numeroPregao" type="text" class="input" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">Vigência início</label>
              <input v-model="vigenciaInicio" type="date" class="input" />
            </div>
            <div>
              <label class="label">Vigência fim</label>
              <input v-model="vigenciaFim" type="date" class="input" />
            </div>
          </div>
        </div>
        <div class="flex justify-end gap-2">
          <button @click="router.push('/grupos')" type="button" class="btn-ghost">Voltar</button>
          <button @click="salvarGrupo" :disabled="saving" type="button" class="btn-primary">
            {{ saving ? "Salvando…" : editMode ? "Salvar grupo" : "Criar grupo e cadastrar itens" }}
          </button>
        </div>
      </div>

      <div v-if="editMode" class="card overflow-hidden">
        <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 class="font-medium text-slate-700 dark:text-slate-200">Itens do grupo ({{ itens.length }})</h2>
          <input
            v-model="buscaItem"
            type="search"
            placeholder="Buscar por CatMat ou nome…"
            class="input max-w-xs"
          />
        </div>

        <!-- novo item -->
        <div class="grid sm:grid-cols-12 gap-3 items-end px-5 py-4 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
          <div class="sm:col-span-2">
            <label class="label">CatMat</label>
            <input v-model="novoItem.codigo_catmat" type="text" class="input" placeholder="000000" />
          </div>
          <div class="sm:col-span-5">
            <label class="label">Nome (descrição)</label>
            <input v-model="novoItem.descricao" type="text" class="input" />
          </div>
          <div class="sm:col-span-1">
            <label class="label">Un.</label>
            <input v-model="novoItem.unidade" type="text" class="input" />
          </div>
          <div class="sm:col-span-2">
            <label class="label">Valor unit. (R$)</label>
            <input v-model.number="novoItem.preco_unitario" type="number" step="0.0001" min="0" class="input" />
          </div>
          <div class="sm:col-span-2">
            <button class="btn-primary w-full" :disabled="addingItem" @click="addItem">
              {{ addingItem ? "Adicionando…" : "+ Adicionar" }}
            </button>
          </div>
        </div>

        <div v-if="!itensFiltrados.length" class="p-6 text-center text-slate-500 dark:text-slate-400">
          {{ itens.length ? "Nenhum item corresponde à busca." : "Nenhum item cadastrado ainda." }}
        </div>
        <div v-else class="max-h-[30rem] overflow-y-auto">
          <table class="w-full text-sm min-w-[52rem]">
            <thead class="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 uppercase text-xs sticky top-0">
              <tr>
                <th class="px-4 py-2 text-left w-28">CatMat</th>
                <th class="px-4 py-2 text-left">Nome</th>
                <th class="px-4 py-2 text-left w-20">Un.</th>
                <th class="px-4 py-2 text-right w-32">Valor unit.</th>
                <th class="px-4 py-2 text-left w-28">Status</th>
                <th class="px-4 py-2 w-28"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
              <tr v-for="l in itensFiltrados" :key="l.id" class="align-top hover:bg-slate-50 dark:hover:bg-slate-700/40">
                <td class="px-4 py-2">
                  <input v-model="l.codigo_catmat" type="text" class="input" />
                </td>
                <td class="px-4 py-2">
                  <input v-model="l.descricao" type="text" class="input" />
                </td>
                <td class="px-4 py-2">
                  <input v-model="l.unidade" type="text" class="input" />
                </td>
                <td class="px-4 py-2">
                  <input v-model.number="l.preco_unitario" type="number" step="0.0001" min="0" class="input text-right" />
                </td>
                <td class="px-4 py-2">
                  <select v-model="l.status" class="input">
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </td>
                <td class="px-4 py-2 text-right">
                  <button class="btn-secondary" :disabled="l._saving" @click="salvarItem(l)">
                    {{ l._saving ? "…" : l._savedAt ? "Salvo ✓" : "Salvar" }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="px-5 py-3 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700">
          O CatMat identifica o item no grupo (não pode repetir). Para tirar um item de
          circulação, use o status <em>Inativo</em> — os lançamentos antigos são preservados.
        </p>
      </div>

      <div v-if="editMode" class="card p-5 space-y-4">
        <h2 class="font-medium text-slate-700 dark:text-slate-200">Reajuste contratual (apostilamento)</h2>
        <p class="text-sm text-slate-500 dark:text-slate-400">
          Aplica o percentual sobre o preço vigente de todos os itens ativos do grupo a
          partir da data-base, preservando o histórico de preços. As NEs antigas não são
          alteradas: o saldo delas é convertido automaticamente ao novo preço na fila
          (regra de três), pois o valor empenhado não muda.
        </p>
        <div class="grid sm:grid-cols-12 gap-3 items-end">
          <div class="sm:col-span-2">
            <label class="label">Percentual (%)</label>
            <input v-model.number="reajPercentual" type="number" step="0.0001" class="input" placeholder="ex.: 4,5" />
          </div>
          <div class="sm:col-span-3">
            <label class="label">Data-base</label>
            <input v-model="reajDataBase" type="date" class="input" />
          </div>
          <div class="sm:col-span-4">
            <label class="label">Referência (nº do apostilamento)</label>
            <input v-model="reajReferencia" type="text" class="input" placeholder="ex.: 1º Termo de Apostilamento ao TC 005/2025" />
          </div>
          <div class="sm:col-span-3">
            <button
              type="button"
              class="btn-primary w-full"
              :disabled="reajAplicando || reajPercentual == null"
              @click="aplicarReajuste"
            >{{ reajAplicando ? "Aplicando…" : "Aplicar reajuste" }}</button>
          </div>
        </div>
        <p v-if="reajResultado" class="rounded-md bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 p-3 text-sm text-green-800 dark:text-green-200">
          {{ reajResultado }}
        </p>
      </div>
    </template>

    <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300">
      {{ error }}
    </div>
  </div>
</template>
