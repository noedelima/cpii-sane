<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { fmtDate, fmtMoney } from "@/lib/format";
import PdfUpload from "@/components/PdfUpload.vue";
import type { Campus, Grupo, Item, NotaFiscal, Recibo } from "@/types/database";

interface LinhaItem {
  id?: number;
  item_id: number;
  descricao: string;
  unidade: string;
  quantidade: number;
  preco_unitario: number;
}

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const reciboId = computed(() => (route.params.id ? Number(route.params.id) : null));
const editMode = computed(() => reciboId.value != null);

const campi = ref<Campus[]>([]);
const grupos = ref<Grupo[]>([]);
const itensDoGrupo = ref<Item[]>([]);

const numero = ref("");
const dataRecebimento = ref(new Date().toISOString().slice(0, 10));
const campusId = ref<number | null>(null);
const grupoId = ref<number | null>(null);
const observacoes = ref("");
const linkPdf = ref<string | null>(null);
const status = ref<Recibo["status"]>("pendente");
const responsavelNome = ref<string | null>(null);
const criadoEm = ref<string | null>(null);
const atualizadoEm = ref<string | null>(null);
const dataHora = (ts: string | null) => (ts ? new Date(ts).toLocaleString("pt-BR") : "—");

const itemId = ref<number | null>(null);
const quantidade = ref<number | null>(null);
const linhas = ref<LinhaItem[]>([]);

// vínculo com NF (SANE)
const nfId = ref<number | null>(null);
const nfAtual = ref<NotaFiscal | null>(null);
const nfBusca = ref("");
const nfCandidatas = ref<NotaFiscal[]>([]);
let nfTimer: ReturnType<typeof setTimeout> | null = null;

const loading = ref(false);
const saving = ref(false);
const excluindo = ref(false);
const error = ref<string | null>(null);
const aviso = ref<string | null>(null);

/** Campus dono do recibo (pode incluir itens, não edita o cabeçalho). */
const isCampusDono = computed(
  () =>
    auth.papel === "campus" &&
    campusId.value != null &&
    auth.campiIds.includes(campusId.value)
);
/** Pode editar cabeçalho/status/NF: SANE e admin. */
const podeEditarCabecalho = computed(() => !editMode.value || auth.isSane);
const podeAdicionarItens = computed(() => auth.isSane || isCampusDono.value || !editMode.value);
// Campus so enxerga (e escolhe) os campi vinculados a ele; SANE/admin veem todos.
const campiDisponiveis = computed(() =>
  auth.papel === "campus" ? campi.value.filter((c) => auth.campiIds.includes(c.id)) : campi.value
);

const itemAtual = computed(() => itensDoGrupo.value.find((i) => i.id === itemId.value));
const totalEstimado = computed(() =>
  linhas.value.reduce((a, l) => a + l.quantidade * (l.preco_unitario ?? 0), 0)
);

async function loadReferenceData() {
  const [c, g] = await Promise.all([
    supabase.from("campi").select("*").eq("status", "ativo").order("nome"),
    supabase.from("grupos").select("*").eq("status", "vigente").order("numero_arabico"),
  ]);
  campi.value = (c.data as Campus[] | null) ?? [];
  grupos.value = (g.data as Grupo[] | null) ?? [];
  if (!editMode.value && auth.papel === "campus" && !campusId.value) {
    campusId.value = auth.campiIds[0] ?? auth.perfil?.campus_id ?? null;
  }
}

async function loadItensDoGrupo() {
  itensDoGrupo.value = [];
  itemId.value = null;
  if (!grupoId.value) return;
  const { data } = await supabase
    .from("itens")
    .select("*")
    .eq("grupo_id", grupoId.value)
    .eq("status", "ativo")
    .order("descricao");
  itensDoGrupo.value = (data as Item[] | null) ?? [];
}

async function loadRecibo() {
  if (!reciboId.value) return;
  loading.value = true;
  const [r, ri] = await Promise.all([
    supabase.from("recibos").select("*").eq("id", reciboId.value).single(),
    supabase
      .from("recibos_itens")
      .select("*, itens (descricao, unidade, preco_unitario)")
      .eq("recibo_id", reciboId.value)
      .order("id"),
  ]);
  if (r.error) {
    error.value = r.error.message;
    loading.value = false;
    return;
  }
  const rec = r.data as Recibo;
  numero.value = rec.numero;
  dataRecebimento.value = rec.data_recebimento;
  campusId.value = rec.campus_id;
  grupoId.value = rec.grupo_id;
  observacoes.value = rec.observacoes ?? "";
  linkPdf.value = rec.link_pdf;
  status.value = rec.status;
  nfId.value = rec.nf_id;
  responsavelNome.value = rec.responsavel_nome;
  criadoEm.value = rec.created_at;
  atualizadoEm.value = rec.updated_at;

  type RIRow = {
    id: number; item_id: number; quantidade: number; unidade: string | null;
    itens: { descricao: string; unidade: string; preco_unitario: number } | null;
  };
  linhas.value = ((ri.data as unknown as (RIRow[] | null)) ?? []).map((x) => ({
    id: x.id,
    item_id: x.item_id,
    descricao: x.itens?.descricao ?? "—",
    unidade: x.unidade ?? x.itens?.unidade ?? "",
    quantidade: Number(x.quantidade),
    preco_unitario: Number(x.itens?.preco_unitario ?? 0),
  }));

  await Promise.all([loadItensDoGrupo(), loadNFAtual(), loadNFCandidatas()]);
  loading.value = false;
}

async function loadNFAtual() {
  nfAtual.value = null;
  if (!nfId.value) return;
  const { data } = await supabase
    .from("notas_fiscais")
    .select("*")
    .eq("id", nfId.value)
    .maybeSingle();
  nfAtual.value = (data as NotaFiscal | null) ?? null;
}

async function loadNFCandidatas() {
  nfCandidatas.value = [];
  if (!grupoId.value || !campusId.value) return;
  let q = supabase
    .from("notas_fiscais")
    .select("*")
    .eq("grupo_id", grupoId.value)
    .or(`campus_id.is.null,campus_id.eq.${campusId.value}`)
    .order("data_entrega", { ascending: false })
    .limit(30);
  if (nfBusca.value.trim()) q = q.ilike("numero", `%${nfBusca.value.trim()}%`);
  const { data } = await q;
  nfCandidatas.value = (data as NotaFiscal[] | null) ?? [];
}

watch(nfBusca, () => {
  if (nfTimer) clearTimeout(nfTimer);
  nfTimer = setTimeout(loadNFCandidatas, 350);
});

async function vincularNF(nf: NotaFiscal | null) {
  if (!reciboId.value) return;
  error.value = null;
  const { error: err } = await supabase
    .from("recibos")
    .update({ nf_id: nf?.id ?? null })
    .eq("id", reciboId.value);
  if (err) {
    error.value = err.message;
    return;
  }
  nfId.value = nf?.id ?? null;
  nfAtual.value = nf;
  aviso.value = nf ? `NF ${nf.numero} vinculada ao recibo.` : "NF desvinculada.";
  setTimeout(() => (aviso.value = null), 2500);
}

function adicionarItemLocal() {
  if (!itemAtual.value || !quantidade.value || quantidade.value <= 0) return;
  linhas.value.push({
    item_id: itemAtual.value.id,
    descricao: itemAtual.value.descricao,
    unidade: itemAtual.value.unidade,
    quantidade: quantidade.value,
    preco_unitario: Number(itemAtual.value.preco_unitario),
  });
  itemId.value = null;
  quantidade.value = null;
}

async function adicionarItem() {
  if (!editMode.value) {
    adicionarItemLocal();
    return;
  }
  // em edição o item é gravado imediatamente (campus dono pode, pela RLS)
  if (!itemAtual.value || !quantidade.value || quantidade.value <= 0 || !reciboId.value) return;
  error.value = null;
  const { data, error: err } = await supabase
    .from("recibos_itens")
    .insert({
      recibo_id: reciboId.value,
      item_id: itemAtual.value.id,
      quantidade: quantidade.value,
      unidade: itemAtual.value.unidade,
    })
    .select("id")
    .single();
  if (err) {
    error.value = err.message;
    return;
  }
  linhas.value.push({
    id: (data as { id: number }).id,
    item_id: itemAtual.value.id,
    descricao: itemAtual.value.descricao,
    unidade: itemAtual.value.unidade,
    quantidade: quantidade.value,
    preco_unitario: Number(itemAtual.value.preco_unitario),
  });
  itemId.value = null;
  quantidade.value = null;
}

async function removerLinha(idx: number) {
  const l = linhas.value[idx];
  if (l.id) {
    if (!auth.isSane) {
      error.value = "Apenas a SANE remove itens já gravados.";
      return;
    }
    if (!confirm(`Remover ${l.descricao}?`)) return;
    const { error: err } = await supabase.from("recibos_itens").delete().eq("id", l.id);
    if (err) {
      error.value = err.message;
      return;
    }
  }
  linhas.value.splice(idx, 1);
}

async function excluirRecibo() {
  if (!reciboId.value) return;
  if (!confirm(`Excluir o recibo ${numero.value}?\n\nOs itens do recibo serão removidos junto. Esta ação não pode ser desfeita.`)) return;
  excluindo.value = true;
  error.value = null;
  const { error: err } = await supabase.from("recibos").delete().eq("id", reciboId.value);
  excluindo.value = false;
  if (err) {
    error.value = err.message;
    return;
  }
  router.push("/recibos");
}

async function salvar() {
  error.value = null;
  if (!numero.value || !campusId.value || !grupoId.value || (!editMode.value && linhas.value.length === 0)) {
    error.value = "Preencha número, campus, grupo e pelo menos 1 item.";
    return;
  }
  saving.value = true;
  try {
    if (editMode.value && reciboId.value) {
      const { error: e1 } = await supabase
        .from("recibos")
        .update({
          numero: numero.value,
          data_recebimento: dataRecebimento.value,
          campus_id: campusId.value,
          grupo_id: grupoId.value,
          observacoes: observacoes.value || null,
          link_pdf: linkPdf.value,
          status: status.value,
        })
        .eq("id", reciboId.value);
      if (e1) throw e1;
      router.push("/recibos");
    } else {
      const { data: rec, error: e1 } = await supabase
        .from("recibos")
        .insert({
          numero: numero.value,
          data_recebimento: dataRecebimento.value,
          campus_id: campusId.value,
          grupo_id: grupoId.value,
          observacoes: observacoes.value || null,
          link_pdf: linkPdf.value,
          responsavel_user_id: auth.user?.id ?? null,
          responsavel_nome: auth.perfil?.nome ?? null,
          status: "pendente",
        })
        .select("id")
        .single();
      if (e1 || !rec) throw e1 ?? new Error("Falha ao gravar recibo.");

      const novoId = (rec as { id: number }).id;
      const inserts = linhas.value.map((l) => ({
        recibo_id: novoId,
        item_id: l.item_id,
        quantidade: l.quantidade,
        unidade: l.unidade,
      }));
      const { error: e2 } = await supabase.from("recibos_itens").insert(inserts);
      if (e2) throw e2;
      router.push("/recibos");
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Erro ao salvar.";
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await loadReferenceData();
  await loadRecibo();
});
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">
        {{ editMode ? `Recibo ${numero || "…"}` : "Novo recibo" }}
      </h1>
      <p v-if="editMode" class="text-sm text-slate-500 dark:text-slate-400 mt-1">
        Cadastrado por <strong>{{ responsavelNome ?? "—" }}</strong> em {{ dataHora(criadoEm) }}<span v-if="atualizadoEm && atualizadoEm !== criadoEm"> · atualizado em {{ dataHora(atualizadoEm) }}</span>
      </p>
    </div>

    <div v-if="loading" class="card p-6 text-center text-slate-500 dark:text-slate-400">Carregando…</div>

    <template v-else>
      <div class="card p-5 space-y-4">
        <h2 class="font-medium text-slate-700 dark:text-slate-200">Cabeçalho</h2>
        <div class="grid sm:grid-cols-2 gap-4">
          <div>
            <label class="label">Nº do recibo</label>
            <input v-model="numero" type="text" class="input" required :disabled="!podeEditarCabecalho" />
          </div>
          <div>
            <label class="label">Data do pedido</label>
            <input v-model="dataRecebimento" type="date" class="input" required :disabled="!podeEditarCabecalho" />
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Data do pedido a que o recibo se refere. Se a entrega ocorreu em outro dia, registre nas observações.
            </p>
          </div>
          <div>
            <label class="label">Campus</label>
            <select
              v-model="campusId"
              class="input"
              required
              :disabled="!podeEditarCabecalho || (auth.papel === 'campus' && campiDisponiveis.length <= 1)"
            >
              <option :value="null" disabled>Selecione…</option>
              <option v-for="c in campiDisponiveis" :key="c.id" :value="c.id">{{ c.nome }}</option>
            </select>
          </div>
          <div>
            <label class="label">Grupo</label>
            <select
              v-model="grupoId"
              class="input"
              required
              :disabled="!podeEditarCabecalho"
              @change="loadItensDoGrupo(); loadNFCandidatas();"
            >
              <option :value="null" disabled>Selecione…</option>
              <option v-for="g in grupos" :key="g.id" :value="g.id">{{ g.nome }}</option>
            </select>
          </div>
          <div v-if="editMode">
            <label class="label">Status</label>
            <select v-model="status" class="input" :disabled="!auth.isSane">
              <option value="rascunho">Rascunho</option>
              <option value="pendente">Pendente</option>
              <option value="confirmado">Confirmado</option>
              <option value="pago">Pago</option>
              <option value="glosado">Glosado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
        </div>
        <div>
          <label class="label">Observações (opcional)</label>
          <textarea v-model="observacoes" rows="2" class="input" :disabled="!podeEditarCabecalho && !isCampusDono"></textarea>
        </div>
        <PdfUpload v-model="linkPdf" bucket="pdfs-recibos" label="PDF do recibo (opcional)" />
      </div>

      <!-- Vínculo com NF (SANE) -->
      <div v-if="editMode && auth.isSane" class="card p-5 space-y-4">
        <h2 class="font-medium text-slate-700 dark:text-slate-200">Nota fiscal associada</h2>

        <div v-if="nfAtual" class="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm">
          <span>
            NF <strong>{{ nfAtual.numero }}</strong> · entrega {{ fmtDate(nfAtual.data_entrega) }} ·
            {{ fmtMoney(nfAtual.valor_total) }} · <span class="capitalize">{{ nfAtual.status }}</span>
          </span>
          <RouterLink :to="`/nfs/${nfAtual.id}`" class="text-cpii-600 dark:text-cpii-300 text-xs hover:underline">abrir NF</RouterLink>
          <button class="text-red-600 dark:text-red-400 text-xs hover:underline" @click="vincularNF(null)">desvincular</button>
        </div>
        <p v-else class="text-sm text-slate-500 dark:text-slate-400">
          Nenhuma NF associada. Busque abaixo — já filtrado pelo grupo e campus deste recibo.
        </p>

        <div>
          <label class="label">Buscar NF (número)</label>
          <input v-model="nfBusca" type="search" class="input max-w-xs" placeholder="ex.: 70233" />
        </div>
        <div v-if="nfCandidatas.length" class="max-h-48 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-md">
          <button
            v-for="nf in nfCandidatas"
            :key="nf.id"
            type="button"
            class="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/40 flex items-center justify-between gap-2"
            :class="{ 'bg-cpii-50': nf.id === nfId }"
            @click="vincularNF(nf)"
          >
            <span>
              <strong>{{ nf.numero }}</strong> · {{ fmtDate(nf.data_entrega) }} ·
              {{ fmtMoney(nf.valor_total) }}
            </span>
            <span class="text-xs capitalize text-slate-500 dark:text-slate-400">{{ nf.status }}</span>
          </button>
        </div>
        <p v-else class="text-sm text-slate-500 dark:text-slate-400">Nenhuma NF encontrada para o filtro atual.</p>
      </div>

      <div class="card p-5 space-y-4">
        <h2 class="font-medium text-slate-700 dark:text-slate-200">Itens entregues</h2>
        <div v-if="podeAdicionarItens" class="grid sm:grid-cols-12 gap-3 items-end">
          <div class="sm:col-span-6">
            <label class="label">Item</label>
            <select v-model="itemId" class="input" :disabled="!grupoId">
              <option :value="null" disabled>
                {{ grupoId ? "Selecione…" : "Selecione o Grupo primeiro" }}
              </option>
              <option v-for="i in itensDoGrupo" :key="i.id" :value="i.id">
                {{ i.codigo_catmat ? i.codigo_catmat + " — " : "" }}{{ i.descricao }}
              </option>
            </select>
          </div>
          <div class="sm:col-span-2">
            <label class="label">Unidade</label>
            <input :value="itemAtual?.unidade ?? ''" type="text" class="input bg-slate-50 dark:bg-slate-700/50" disabled />
          </div>
          <div class="sm:col-span-2">
            <label class="label">Quantidade</label>
            <input v-model.number="quantidade" type="number" step="0.001" min="0" class="input" />
          </div>
          <div class="sm:col-span-2">
            <button @click="adicionarItem" type="button" class="btn-secondary w-full">Adicionar</button>
          </div>
        </div>
        <p v-if="itemAtual" class="text-xs text-slate-500 dark:text-slate-400">
          Preço unitário (ref. catálogo):
          <strong>{{ fmtMoney(itemAtual.preco_unitario) }}</strong> por {{ itemAtual.unidade }}
        </p>

        <div v-if="linhas.length" class="border-t border-slate-200 dark:border-slate-700 pt-4">
          <table class="w-full text-sm">
            <thead class="text-xs text-slate-500 dark:text-slate-400 uppercase">
              <tr>
                <th class="text-left py-1">Item</th>
                <th class="text-right py-1">Qtd</th>
                <th class="text-left py-1 pl-3">Un.</th>
                <th class="text-right py-1">Vlr unit. (ref.)</th>
                <th class="text-right py-1">Subtotal (ref.)</th>
                <th class="py-1"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
              <tr v-for="(l, idx) in linhas" :key="l.id ?? `n${idx}`">
                <td class="py-2">{{ l.descricao }}</td>
                <td class="py-2 text-right tabular-nums">{{ l.quantidade }}</td>
                <td class="py-2 pl-3">{{ l.unidade }}</td>
                <td class="py-2 text-right tabular-nums">{{ fmtMoney(l.preco_unitario) }}</td>
                <td class="py-2 text-right tabular-nums">{{ fmtMoney(l.quantidade * (l.preco_unitario ?? 0)) }}</td>
                <td class="py-2 text-right">
                  <button
                    v-if="!l.id || auth.isSane"
                    @click="removerLinha(idx)"
                    class="text-red-600 dark:text-red-400 text-xs hover:underline"
                  >remover</button>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="border-t border-slate-300 dark:border-slate-600 font-medium">
                <td class="py-2" colspan="4">Valor total estimado do recibo</td>
                <td class="py-2 text-right tabular-nums">{{ fmtMoney(totalEstimado) }}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Valor de referência pelo preço vigente do catálogo; o valor faturado é definido na nota fiscal.
          </p>
        </div>
        <p v-else class="text-sm text-slate-500 dark:text-slate-400">Nenhum item adicionado.</p>
      </div>

      <div v-if="aviso" class="rounded-md bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 p-3 text-sm text-green-800 dark:text-green-200">
        {{ aviso }}
      </div>
      <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300">{{ error }}</div>

      <div class="flex justify-between gap-2">
        <button
          v-if="editMode && auth.isSane"
          type="button"
          class="btn bg-red-600 text-white hover:bg-red-700"
          :disabled="excluindo"
          @click="excluirRecibo"
        >{{ excluindo ? "Excluindo…" : "Excluir recibo" }}</button>
        <span v-else></span>
        <div class="flex gap-2">
          <button @click="router.push('/recibos')" type="button" class="btn-ghost">Voltar</button>
          <button
            v-if="podeEditarCabecalho"
            @click="salvar"
            :disabled="saving"
            type="button"
            class="btn-primary"
          >
            {{ saving ? "Salvando…" : editMode ? "Salvar alterações" : "Salvar recibo" }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
