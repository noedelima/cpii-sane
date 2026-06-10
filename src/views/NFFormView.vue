<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { fmtMoney } from "@/lib/format";
import PdfUpload from "@/components/PdfUpload.vue";
import type { Grupo, NFEmpenho, NotaFiscal, VwEmpenhoSaldo } from "@/types/database";

type RateioRow = NFEmpenho & { empenhos?: { numero: string } | null };

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const nfId = computed(() => (route.params.id ? Number(route.params.id) : null));
const editMode = computed(() => nfId.value != null);

const grupos = ref<Grupo[]>([]);
const empenhosDoGrupo = ref<VwEmpenhoSaldo[]>([]);

const numero = ref("");
const grupoId = ref<number | null>(null);
const dataEmissao = ref<string>("");
const dataEntrega = ref(new Date().toISOString().slice(0, 10));
const valorTotal = ref<number | null>(null);
const processoPagamento = ref("");
const dataAberturaProcesso = ref<string>("");
const status = ref<NotaFiscal["status"]>("pendente");
const ocorrencias = ref("");
const observacoes = ref("");
const linkPdf = ref<string | null>(null);

const rateios = ref<RateioRow[]>([]);
const rateioEmpenhoId = ref<number | null>(null);
const rateioValor = ref<number | null>(null);

const loading = ref(false);
const saving = ref(false);
const distribuindo = ref(false);
const error = ref<string | null>(null);
const aviso = ref<string | null>(null);

const grupoAtual = computed(() => grupos.value.find((g) => g.id === grupoId.value));
const somaRateada = computed(() =>
  rateios.value.reduce((a, r) => a + Number(r.valor_debitado), 0)
);
const faltaRatear = computed(() => (valorTotal.value ?? 0) - somaRateada.value);

async function loadRefs() {
  const { data } = await supabase.from("grupos").select("*").order("numero_arabico");
  grupos.value = (data as Grupo[] | null) ?? [];
}

async function loadEmpenhosDoGrupo() {
  empenhosDoGrupo.value = [];
  rateioEmpenhoId.value = null;
  if (!grupoId.value) return;
  // empenhos alocados ao grupo, com saldo calculado pela view
  const { data: ids } = await supabase
    .from("empenhos_grupos")
    .select("empenho_id")
    .eq("grupo_id", grupoId.value);
  const lista = ((ids as { empenho_id: number }[] | null) ?? []).map((x) => x.empenho_id);
  if (!lista.length) return;
  const { data } = await supabase
    .from("vw_empenho_saldos")
    .select("*")
    .in("id", lista)
    .order("data_emissao");
  empenhosDoGrupo.value = (data as VwEmpenhoSaldo[] | null) ?? [];
}

async function loadRateios() {
  if (!nfId.value) return;
  const { data, error: err } = await supabase
    .from("nf_empenhos")
    .select("*, empenhos (numero)")
    .eq("nf_id", nfId.value)
    .order("id");
  if (err) {
    error.value = err.message;
    return;
  }
  rateios.value = (data as RateioRow[] | null) ?? [];
}

async function loadNF() {
  if (!nfId.value) return;
  loading.value = true;
  const { data, error: err } = await supabase
    .from("notas_fiscais")
    .select("*")
    .eq("id", nfId.value)
    .single();
  if (err) {
    error.value = err.message;
    loading.value = false;
    return;
  }
  const nf = data as NotaFiscal;
  numero.value = nf.numero;
  grupoId.value = nf.grupo_id;
  dataEmissao.value = nf.data_emissao ?? "";
  dataEntrega.value = nf.data_entrega;
  valorTotal.value = nf.valor_total == null ? null : Number(nf.valor_total);
  processoPagamento.value = nf.processo_pagamento ?? "";
  dataAberturaProcesso.value = nf.data_abertura_processo ?? "";
  status.value = nf.status;
  ocorrencias.value = nf.ocorrencias ?? "";
  observacoes.value = nf.observacoes ?? "";
  linkPdf.value = nf.link_pdf;
  await Promise.all([loadEmpenhosDoGrupo(), loadRateios()]);
  loading.value = false;
}

async function salvar(voltar = true) {
  error.value = null;
  if (!numero.value.trim() || !grupoId.value || !dataEntrega.value) {
    error.value = "Preencha número, grupo e data de entrega.";
    return false;
  }
  saving.value = true;
  try {
    const payload = {
      numero: numero.value.trim(),
      grupo_id: grupoId.value,
      fornecedor_id: grupoAtual.value?.fornecedor_id ?? null,
      data_emissao: dataEmissao.value || null,
      data_entrega: dataEntrega.value,
      valor_total: valorTotal.value,
      processo_pagamento: processoPagamento.value.trim() || null,
      data_abertura_processo: dataAberturaProcesso.value || null,
      status: status.value,
      ocorrencias: ocorrencias.value.trim() || null,
      observacoes: observacoes.value.trim() || null,
      link_pdf: linkPdf.value,
    };
    if (editMode.value && nfId.value) {
      const { error: err } = await supabase
        .from("notas_fiscais")
        .update(payload)
        .eq("id", nfId.value);
      if (err) throw err;
      if (voltar) router.push("/nfs");
      return true;
    } else {
      const { data, error: err } = await supabase
        .from("notas_fiscais")
        .insert(payload)
        .select("id")
        .single();
      if (err || !data) throw err ?? new Error("Falha ao criar NF.");
      // segue para o modo edição para permitir o rateio
      router.replace(`/nfs/${(data as { id: number }).id}`);
      return true;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Erro ao salvar.";
    return false;
  } finally {
    saving.value = false;
  }
}

async function distribuirFifo() {
  if (!nfId.value) return;
  error.value = null;
  aviso.value = null;
  // garante que o cabeçalho (inclusive valor_total) está gravado antes do rateio
  const ok = await salvar(false);
  if (!ok) return;
  distribuindo.value = true;
  try {
    const { error: err } = await supabase.rpc("distribute_nf_fifo", {
      p_nf_id: nfId.value,
    });
    if (err) throw err;
    await Promise.all([loadRateios(), loadEmpenhosDoGrupo()]);
    aviso.value = "Distribuição FIFO concluída.";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Falha na distribuição FIFO.";
  } finally {
    distribuindo.value = false;
  }
}

async function addRateioManual() {
  if (!nfId.value || !rateioEmpenhoId.value || !rateioValor.value || rateioValor.value <= 0) return;
  error.value = null;
  const { error: err } = await supabase.from("nf_empenhos").insert({
    nf_id: nfId.value,
    empenho_id: rateioEmpenhoId.value,
    valor_debitado: rateioValor.value,
    observacoes: "Rateio manual",
  });
  if (err) {
    error.value = err.message.includes("duplicate")
      ? "Este empenho já está rateado nesta NF — edite o valor existente."
      : err.message;
    return;
  }
  rateioEmpenhoId.value = null;
  rateioValor.value = null;
  await Promise.all([loadRateios(), loadEmpenhosDoGrupo()]);
}

async function salvarRateio(r: RateioRow) {
  error.value = null;
  const { error: err } = await supabase
    .from("nf_empenhos")
    .update({ valor_debitado: r.valor_debitado })
    .eq("id", r.id);
  if (err) error.value = err.message;
  else await loadEmpenhosDoGrupo();
}

async function removerRateio(r: RateioRow) {
  if (!auth.isAdmin) {
    error.value = "Apenas o administrador remove rateios gravados.";
    return;
  }
  if (!confirm(`Remover o débito de ${fmtMoney(r.valor_debitado)}?`)) return;
  const { error: err } = await supabase.from("nf_empenhos").delete().eq("id", r.id);
  if (err) error.value = err.message;
  else await Promise.all([loadRateios(), loadEmpenhosDoGrupo()]);
}

onMounted(async () => {
  await loadRefs();
  await loadNF();
});
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <h1 class="text-2xl font-semibold">
      {{ editMode ? `NF ${numero || "…"}` : "Nova nota fiscal" }}
    </h1>

    <div v-if="loading" class="card p-6 text-center text-slate-500">Carregando…</div>

    <template v-else>
      <div class="card p-5 space-y-4">
        <h2 class="font-medium text-slate-700">Cabeçalho</h2>
        <div class="grid sm:grid-cols-2 gap-4">
          <div>
            <label class="label">Nº da NF</label>
            <input v-model="numero" type="text" class="input" required />
          </div>
          <div>
            <label class="label">Grupo</label>
            <select v-model="grupoId" class="input" required @change="loadEmpenhosDoGrupo">
              <option :value="null" disabled>Selecione…</option>
              <option v-for="g in grupos" :key="g.id" :value="g.id">{{ g.nome }}</option>
            </select>
          </div>
          <div>
            <label class="label">Data de emissão</label>
            <input v-model="dataEmissao" type="date" class="input" />
          </div>
          <div>
            <label class="label">Data de entrega</label>
            <input v-model="dataEntrega" type="date" class="input" required />
          </div>
          <div>
            <label class="label">Valor total (R$)</label>
            <input v-model.number="valorTotal" type="number" step="0.01" min="0" class="input" />
          </div>
          <div>
            <label class="label">Status</label>
            <select v-model="status" class="input">
              <option value="pendente">Pendente</option>
              <option value="confirmado">Confirmado</option>
              <option value="pago">Pago</option>
              <option value="glosado">Glosado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
          <div>
            <label class="label">Processo de pagamento (SUAP)</label>
            <input v-model="processoPagamento" type="text" class="input" placeholder="23040.000000/2026-00" />
          </div>
          <div>
            <label class="label">Abertura do processo</label>
            <input v-model="dataAberturaProcesso" type="date" class="input" />
          </div>
          <PdfUpload v-model="linkPdf" bucket="pdfs-nfs" label="PDF da nota fiscal" />
          <div v-if="grupoAtual" class="text-sm text-slate-600 self-end pb-2">
            Fornecedor do grupo: <strong>{{ grupoAtual.nome.split("-").pop()?.trim() }}</strong>
          </div>
        </div>
        <div class="grid sm:grid-cols-2 gap-4">
          <div>
            <label class="label">Ocorrências</label>
            <textarea v-model="ocorrencias" rows="2" class="input"></textarea>
          </div>
          <div>
            <label class="label">Observações</label>
            <textarea v-model="observacoes" rows="2" class="input"></textarea>
          </div>
        </div>
      </div>

      <div v-if="editMode" class="card p-5 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-medium text-slate-700">Débito em empenhos</h2>
          <button
            type="button"
            class="btn-primary"
            :disabled="distribuindo || !valorTotal"
            @click="distribuirFifo"
          >
            {{ distribuindo ? "Distribuindo…" : "Distribuir FIFO" }}
          </button>
        </div>

        <p class="text-sm text-slate-600">
          Valor da NF: <strong class="tabular-nums">{{ fmtMoney(valorTotal) }}</strong> ·
          Rateado: <strong class="tabular-nums">{{ fmtMoney(somaRateada) }}</strong> ·
          <span :class="Math.abs(faltaRatear) < 0.01 ? 'text-green-700' : 'text-amber-600'">
            {{ Math.abs(faltaRatear) < 0.01 ? "Conciliado ✓" : `Falta ratear ${fmtMoney(faltaRatear)}` }}
          </span>
        </p>

        <table v-if="rateios.length" class="w-full text-sm">
          <thead class="text-xs text-slate-500 uppercase">
            <tr>
              <th class="text-left py-1">Empenho</th>
              <th class="text-right py-1">Valor debitado</th>
              <th class="py-1"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200">
            <tr v-for="r in rateios" :key="r.id">
              <td class="py-2 font-medium">{{ r.empenhos?.numero ?? r.empenho_id }}</td>
              <td class="py-2 text-right w-44">
                <input
                  v-model.number="r.valor_debitado"
                  type="number"
                  step="0.01"
                  min="0"
                  class="input text-right"
                  @change="salvarRateio(r)"
                />
              </td>
              <td class="py-2 text-right w-20">
                <button
                  v-if="auth.isAdmin"
                  class="text-red-600 text-xs hover:underline"
                  @click="removerRateio(r)"
                >remover</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-sm text-slate-500">
          Nenhum débito lançado. Use “Distribuir FIFO” ou adicione manualmente.
        </p>

        <div class="grid sm:grid-cols-12 gap-3 items-end border-t border-slate-200 pt-4">
          <div class="sm:col-span-7">
            <label class="label">Empenho do grupo (saldo)</label>
            <select v-model="rateioEmpenhoId" class="input">
              <option :value="null" disabled>Selecione…</option>
              <option v-for="e in empenhosDoGrupo" :key="e.id" :value="e.id">
                {{ e.numero }} — saldo {{ fmtMoney(e.saldo) }}
              </option>
            </select>
          </div>
          <div class="sm:col-span-3">
            <label class="label">Valor</label>
            <input v-model.number="rateioValor" type="number" step="0.01" min="0" class="input" />
          </div>
          <div class="sm:col-span-2">
            <button type="button" class="btn-secondary w-full" @click="addRateioManual">
              Adicionar
            </button>
          </div>
        </div>
      </div>

      <p v-else class="text-sm text-slate-500">
        Salve a NF para liberar o débito em empenhos (FIFO ou manual).
      </p>

      <div v-if="aviso" class="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">
        {{ aviso }}
      </div>
      <div v-if="error" class="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
        {{ error }}
      </div>

      <div class="flex justify-end gap-2">
        <button @click="router.push('/nfs')" type="button" class="btn-ghost">Voltar</button>
        <button @click="salvar()" :disabled="saving" type="button" class="btn-primary">
          {{ saving ? "Salvando…" : editMode ? "Salvar alterações" : "Criar NF" }}
        </button>
      </div>
    </template>
  </div>
</template>
