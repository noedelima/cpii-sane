<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import PdfUpload from "@/components/PdfUpload.vue";
import type { Campus, Grupo, Item } from "@/types/database";

interface LinhaItem {
  item_id: number;
  descricao: string;
  unidade: string;
  quantidade: number;
}

const router = useRouter();
const auth = useAuthStore();

const campi = ref<Campus[]>([]);
const grupos = ref<Grupo[]>([]);
const itensDoGrupo = ref<Item[]>([]);

const numero = ref("");
const dataRecebimento = ref(new Date().toISOString().slice(0, 10));
const campusId = ref<number | null>(null);
const grupoId = ref<number | null>(null);
const observacoes = ref("");
const linkPdf = ref<string | null>(null);

const itemId = ref<number | null>(null);
const quantidade = ref<number | null>(null);

const linhas = ref<LinhaItem[]>([]);

const saving = ref(false);
const error = ref<string | null>(null);

const itemAtual = computed(() => itensDoGrupo.value.find((i) => i.id === itemId.value));

async function loadReferenceData() {
  const [c, g] = await Promise.all([
    supabase.from("campi").select("*").eq("status", "ativo").order("nome"),
    supabase.from("grupos").select("*").eq("status", "vigente").order("numero_arabico"),
  ]);
  campi.value = (c.data as Campus[] | null) ?? [];
  grupos.value = (g.data as Grupo[] | null) ?? [];
  // perfil campus: pré-seleciona (e trava) o próprio campus
  if (auth.papel === "campus" && auth.perfil?.campus_id) {
    campusId.value = auth.perfil.campus_id;
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

function adicionarItem() {
  if (!itemAtual.value || !quantidade.value || quantidade.value <= 0) return;
  linhas.value.push({
    item_id: itemAtual.value.id,
    descricao: itemAtual.value.descricao,
    unidade: itemAtual.value.unidade,
    quantidade: quantidade.value,
  });
  itemId.value = null;
  quantidade.value = null;
}

function removerLinha(idx: number) {
  linhas.value.splice(idx, 1);
}

async function salvar() {
  error.value = null;
  if (!numero.value || !campusId.value || !grupoId.value || linhas.value.length === 0) {
    error.value = "Preencha número, campus, grupo e pelo menos 1 item.";
    return;
  }
  saving.value = true;
  try {
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
        status: "pendente",
      })
      .select("id")
      .single();
    if (e1 || !rec) throw e1 ?? new Error("Falha ao gravar recibo.");

    const reciboId = (rec as { id: number }).id;
    const inserts = linhas.value.map((l) => ({
      recibo_id: reciboId,
      item_id: l.item_id,
      quantidade: l.quantidade,
      unidade: l.unidade,
    }));
    const { error: e2 } = await supabase.from("recibos_itens").insert(inserts);
    if (e2) throw e2;

    router.push("/recibos");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Erro ao salvar.";
  } finally {
    saving.value = false;
  }
}

onMounted(loadReferenceData);
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <h1 class="text-2xl font-semibold">Novo recibo</h1>

    <div class="card p-5 space-y-4">
      <h2 class="font-medium text-slate-700 dark:text-slate-200">Cabeçalho</h2>
      <div class="grid sm:grid-cols-2 gap-4">
        <div>
          <label class="label">Nº do recibo</label>
          <input v-model="numero" type="text" class="input" required />
        </div>
        <div>
          <label class="label">Data do recebimento</label>
          <input v-model="dataRecebimento" type="date" class="input" required />
        </div>
        <div>
          <label class="label">Campus</label>
          <select v-model="campusId" class="input" required :disabled="auth.papel === 'campus'">
            <option :value="null" disabled>Selecione…</option>
            <option v-for="c in campi" :key="c.id" :value="c.id">{{ c.nome }}</option>
          </select>
        </div>
        <div>
          <label class="label">Grupo</label>
          <select v-model="grupoId" class="input" required @change="loadItensDoGrupo">
            <option :value="null" disabled>Selecione…</option>
            <option v-for="g in grupos" :key="g.id" :value="g.id">{{ g.nome }}</option>
          </select>
        </div>
      </div>
      <div>
        <label class="label">Observações (opcional)</label>
        <textarea v-model="observacoes" rows="2" class="input"></textarea>
      </div>
      <PdfUpload v-model="linkPdf" bucket="pdfs-recibos" label="PDF do recibo (opcional)" />
    </div>

    <div class="card p-5 space-y-4">
      <h2 class="font-medium text-slate-700 dark:text-slate-200">Itens entregues</h2>
      <div class="grid sm:grid-cols-12 gap-3 items-end">
        <div class="sm:col-span-6">
          <label class="label">Item</label>
          <select v-model="itemId" class="input" :disabled="!grupoId">
            <option :value="null" disabled>
              {{ grupoId ? "Selecione…" : "Selecione o Grupo primeiro" }}
            </option>
            <option v-for="i in itensDoGrupo" :key="i.id" :value="i.id">{{ i.descricao }}</option>
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

      <div v-if="linhas.length" class="border-t border-slate-200 dark:border-slate-700 pt-4">
        <table class="w-full text-sm">
          <thead class="text-xs text-slate-500 dark:text-slate-400 uppercase">
            <tr>
              <th class="text-left py-1">Item</th>
              <th class="text-right py-1">Qtd</th>
              <th class="text-left py-1 pl-3">Un.</th>
              <th class="py-1"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
            <tr v-for="(l, idx) in linhas" :key="idx">
              <td class="py-2">{{ l.descricao }}</td>
              <td class="py-2 text-right tabular-nums">{{ l.quantidade }}</td>
              <td class="py-2 pl-3">{{ l.unidade }}</td>
              <td class="py-2 text-right">
                <button @click="removerLinha(idx)" class="text-red-600 dark:text-red-400 text-xs hover:underline">remover</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="text-sm text-slate-500 dark:text-slate-400">Nenhum item adicionado.</p>
    </div>

    <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300">{{ error }}</div>

    <div class="flex justify-end gap-2">
      <button @click="router.back()" type="button" class="btn-ghost">Cancelar</button>
      <button @click="salvar" :disabled="saving" type="button" class="btn-primary">
        {{ saving ? "Salvando…" : "Salvar recibo" }}
      </button>
    </div>
  </div>
</template>
