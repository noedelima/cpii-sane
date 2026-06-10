<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { fmtMoney } from "@/lib/format";
import PdfUpload from "@/components/PdfUpload.vue";
import type { Empenho, Fornecedor, Grupo } from "@/types/database";

interface Alocacao {
  id?: number;
  grupo_id: number | null;
  valor_alocado: number | null;
  percentual: number | null;
  observacoes: string | null;
}

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const empenhoId = computed(() =>
  route.params.id ? Number(route.params.id) : null
);
const editMode = computed(() => empenhoId.value != null);

const fornecedores = ref<Fornecedor[]>([]);
const grupos = ref<Grupo[]>([]);

const numero = ref("");
const dataEmissao = ref(new Date().toISOString().slice(0, 10));
const fornecedorId = ref<number | null>(null);
const valorInicial = ref<number | null>(null);
const reforco = ref<number>(0);
const cancelamento = ref<number>(0);
const anulacao = ref<number>(0);
const status = ref<Empenho["status"]>("ativo");
const processoSuap = ref("");
const observacoes = ref("");
const linkPdf = ref<string | null>(null);

const alocacoes = ref<Alocacao[]>([]);

const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);

const valorLiquido = computed(
  () => (valorInicial.value ?? 0) + reforco.value - cancelamento.value - anulacao.value
);
const somaAlocada = computed(() =>
  alocacoes.value.reduce((a, l) => a + (l.valor_alocado ?? 0), 0)
);

async function loadRefs() {
  const [f, g] = await Promise.all([
    supabase.from("fornecedores").select("*").eq("status", "ativo").order("codigo"),
    supabase.from("grupos").select("*").order("numero_arabico"),
  ]);
  fornecedores.value = (f.data as Fornecedor[] | null) ?? [];
  grupos.value = (g.data as Grupo[] | null) ?? [];
}

async function loadEmpenho() {
  if (!empenhoId.value) return;
  loading.value = true;
  const [e, a] = await Promise.all([
    supabase.from("empenhos").select("*").eq("id", empenhoId.value).single(),
    supabase.from("empenhos_grupos").select("*").eq("empenho_id", empenhoId.value).order("id"),
  ]);
  if (e.error) {
    error.value = e.error.message;
    loading.value = false;
    return;
  }
  const emp = e.data as Empenho;
  numero.value = emp.numero;
  dataEmissao.value = emp.data_emissao;
  fornecedorId.value = emp.fornecedor_id;
  valorInicial.value = Number(emp.valor_inicial);
  reforco.value = Number(emp.reforco);
  cancelamento.value = Number(emp.cancelamento);
  anulacao.value = Number(emp.anulacao);
  status.value = emp.status;
  processoSuap.value = emp.processo_suap ?? "";
  observacoes.value = emp.observacoes ?? "";
  linkPdf.value = emp.link_pdf;
  alocacoes.value = ((a.data as Alocacao[] | null) ?? []).map((l) => ({
    ...l,
    valor_alocado: Number(l.valor_alocado),
    percentual: l.percentual == null ? null : Number(l.percentual),
  }));
  loading.value = false;
}

function addAlocacao() {
  alocacoes.value.push({
    grupo_id: null,
    valor_alocado: null,
    percentual: null,
    observacoes: null,
  });
}

async function removeAlocacao(idx: number) {
  const l = alocacoes.value[idx];
  if (l.id) {
    if (!auth.isAdmin) {
      error.value = "Apenas o administrador remove alocações já gravadas.";
      return;
    }
    if (!confirm("Remover esta alocação de grupo?")) return;
    const { error: err } = await supabase.from("empenhos_grupos").delete().eq("id", l.id);
    if (err) {
      error.value = err.message;
      return;
    }
  }
  alocacoes.value.splice(idx, 1);
}

async function salvar() {
  error.value = null;
  if (!numero.value.trim() || !dataEmissao.value || valorInicial.value == null) {
    error.value = "Preencha número, data de emissão e valor inicial.";
    return;
  }
  const linhasValidas = alocacoes.value.filter((l) => l.grupo_id != null);
  if (linhasValidas.some((l) => (l.valor_alocado ?? 0) < 0)) {
    error.value = "Valores de alocação não podem ser negativos.";
    return;
  }
  saving.value = true;
  try {
    const payload = {
      numero: numero.value.trim(),
      data_emissao: dataEmissao.value,
      fornecedor_id: fornecedorId.value,
      valor_inicial: valorInicial.value ?? 0,
      reforco: reforco.value || 0,
      cancelamento: cancelamento.value || 0,
      anulacao: anulacao.value || 0,
      status: status.value,
      processo_suap: processoSuap.value.trim() || null,
      observacoes: observacoes.value.trim() || null,
      link_pdf: linkPdf.value,
    };

    let id = empenhoId.value;
    if (editMode.value && id) {
      const { error: err } = await supabase.from("empenhos").update(payload).eq("id", id);
      if (err) throw err;
    } else {
      const { data, error: err } = await supabase
        .from("empenhos")
        .insert(payload)
        .select("id")
        .single();
      if (err || !data) throw err ?? new Error("Falha ao criar empenho.");
      id = (data as { id: number }).id;
    }

    for (const l of linhasValidas) {
      const linha = {
        empenho_id: id,
        grupo_id: l.grupo_id,
        valor_alocado: l.valor_alocado ?? 0,
        percentual: l.percentual,
        observacoes: l.observacoes,
      };
      if (l.id) {
        const { error: err } = await supabase
          .from("empenhos_grupos")
          .update(linha)
          .eq("id", l.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from("empenhos_grupos").insert(linha);
        if (err) throw err;
      }
    }

    router.push("/empenhos");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Erro ao salvar.";
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await loadRefs();
  await loadEmpenho();
});
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <h1 class="text-2xl font-semibold">
      {{ editMode ? `Empenho ${numero || "…"}` : "Novo empenho" }}
    </h1>

    <div v-if="loading" class="card p-6 text-center text-slate-500">Carregando…</div>

    <template v-else>
      <div class="card p-5 space-y-4">
        <h2 class="font-medium text-slate-700">Identificação</h2>
        <div class="grid sm:grid-cols-2 gap-4">
          <div>
            <label class="label">Nº do empenho (NE)</label>
            <input v-model="numero" type="text" class="input" placeholder="2026NE000123" required />
          </div>
          <div>
            <label class="label">Data de emissão</label>
            <input v-model="dataEmissao" type="date" class="input" required />
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
              <option value="ativo">Ativo</option>
              <option value="esgotado">Esgotado</option>
              <option value="cancelado">Cancelado</option>
              <option value="anulado">Anulado</option>
            </select>
          </div>
          <div>
            <label class="label">Processo SUAP</label>
            <input v-model="processoSuap" type="text" class="input" placeholder="23040.000000/2026-00" />
          </div>
          <PdfUpload v-model="linkPdf" bucket="pdfs-empenhos" label="PDF da nota de empenho" />
        </div>
      </div>

      <div class="card p-5 space-y-4">
        <h2 class="font-medium text-slate-700">Valores</h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label class="label">Valor inicial</label>
            <input v-model.number="valorInicial" type="number" step="0.01" min="0" class="input" required />
          </div>
          <div>
            <label class="label">Reforço</label>
            <input v-model.number="reforco" type="number" step="0.01" min="0" class="input" />
          </div>
          <div>
            <label class="label">Cancelamento</label>
            <input v-model.number="cancelamento" type="number" step="0.01" min="0" class="input" />
          </div>
          <div>
            <label class="label">Anulação</label>
            <input v-model.number="anulacao" type="number" step="0.01" min="0" class="input" />
          </div>
        </div>
        <p class="text-sm text-slate-600">
          Valor líquido: <strong class="tabular-nums">{{ fmtMoney(valorLiquido) }}</strong>
        </p>
      </div>

      <div class="card p-5 space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="font-medium text-slate-700">Alocação por grupo</h2>
          <button type="button" class="btn-secondary" @click="addAlocacao">+ Grupo</button>
        </div>

        <p v-if="!alocacoes.length" class="text-sm text-slate-500">
          Nenhum grupo alocado. Adicione ao menos um para que o empenho apareça
          na distribuição FIFO das notas fiscais.
        </p>

        <div v-for="(l, idx) in alocacoes" :key="l.id ?? `n${idx}`" class="grid sm:grid-cols-12 gap-3 items-end">
          <div class="sm:col-span-6">
            <label class="label">Grupo</label>
            <select v-model="l.grupo_id" class="input">
              <option :value="null" disabled>Selecione…</option>
              <option v-for="g in grupos" :key="g.id" :value="g.id">{{ g.nome }}</option>
            </select>
          </div>
          <div class="sm:col-span-3">
            <label class="label">Valor alocado</label>
            <input v-model.number="l.valor_alocado" type="number" step="0.01" min="0" class="input" />
          </div>
          <div class="sm:col-span-2">
            <label class="label">%</label>
            <input v-model.number="l.percentual" type="number" step="0.001" min="0" max="100" class="input" />
          </div>
          <div class="sm:col-span-1 pb-1.5">
            <button
              type="button"
              class="text-red-600 text-xs hover:underline"
              @click="removeAlocacao(idx)"
            >remover</button>
          </div>
        </div>

        <p v-if="alocacoes.length" class="text-sm text-slate-600">
          Soma alocada: <strong class="tabular-nums">{{ fmtMoney(somaAlocada) }}</strong>
          <span
            v-if="Math.abs(somaAlocada - valorLiquido) > 0.01"
            class="text-amber-600 ml-2"
          >difere do valor líquido ({{ fmtMoney(valorLiquido) }})</span>
        </p>
      </div>

      <div class="card p-5">
        <label class="label">Observações</label>
        <textarea v-model="observacoes" rows="3" class="input"></textarea>
      </div>

      <div v-if="error" class="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
        {{ error }}
      </div>

      <div class="flex justify-end gap-2">
        <button @click="router.back()" type="button" class="btn-ghost">Cancelar</button>
        <button @click="salvar" :disabled="saving" type="button" class="btn-primary">
          {{ saving ? "Salvando…" : editMode ? "Salvar alterações" : "Criar empenho" }}
        </button>
      </div>
    </template>
  </div>
</template>
