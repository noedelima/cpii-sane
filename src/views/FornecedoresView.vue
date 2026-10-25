<script setup lang="ts">
import { onMounted, ref } from "vue";
import FornecedorForm from "@/components/FornecedorForm.vue";
import { supabase } from "@/lib/supabase";
import { msgErro } from "@/lib/erro";
import { mensagemErroExclusao, motivoBloqueio, type Dependencia } from "@/lib/exclusao";
import type { Fornecedor } from "@/types/database";

const fornecedores = ref<Fornecedor[]>([]);
const loading = ref(true);
const error = ref("");
const criando = ref(false);
const success = ref("");
async function load() {
  loading.value = true;
  error.value = "";
  try {
    const { data, error: err } = await supabase.from("fornecedores").select("*").order("codigo");
    if (err) throw err;
    fornecedores.value = (data as Fornecedor[]) ?? [];
  } catch (err) {
    error.value = msgErro(err, "Falha ao carregar fornecedores.");
  } finally {
    loading.value = false;
  }
}
function cadastrado(fornecedor: Fornecedor) {
  criando.value = false;
  success.value = `Fornecedor ${fornecedor.codigo} cadastrado com sucesso.`;
  void load();
}

// ---- Exclusao de fornecedor -------------------------------------------
//
// A verificacao cobre as SEIS tabelas que referenciam fornecedor e a exclusao
// so e oferecida com todas zeradas. Serve para explicar o motivo antes do
// clique; a garantia vem do ON DELETE RESTRICT das chaves (secao 36.1 do
// schema).
//
// Historico que vale lembrar: quatro dessas chaves estavam em ON DELETE SET
// NULL ate 10/2025, e nesse periodo o banco NAO protegia - excluir um
// fornecedor em uso teria apagado o vinculo em silencio, deixando grupos e NFs
// sem empresa. Se alguem reverter a secao 36.1, esta checagem volta a ser a
// unica barreira.
const excluindoId = ref<number | null>(null);

async function contarDependencias(id: number): Promise<Dependencia[]> {
  const conta = async (tabela: string, rotulo: string): Promise<Dependencia> => {
    const { count } = await supabase
      .from(tabela)
      .select("id", { count: "exact", head: true })
      .eq("fornecedor_id", id);
    return { rotulo, quantidade: count ?? 0 };
  };
  return Promise.all([
    conta("grupos", "grupos"),
    conta("empenhos", "empenhos"),
    conta("recibos", "recibos"),
    conta("notas_fiscais", "notas fiscais"),
    conta("atestes", "atestes"),
    conta("solicitacoes_nf", "solicitações de NF"),
  ]);
}

async function excluir(f: Fornecedor) {
  error.value = "";
  success.value = "";
  excluindoId.value = f.id;
  try {
    const bloqueio = motivoBloqueio(await contarDependencias(f.id));
    if (bloqueio) {
      error.value = bloqueio;
      return;
    }
    if (
      !confirm(
        `Excluir o fornecedor "${f.codigo} — ${f.razao_social}"?\n\n` +
          "Não há grupo, empenho, recibo, NF, ateste ou solicitação ligado a ele. " +
          "A ação fica registrada no log de auditoria."
      )
    )
      return;
    const { error: err } = await supabase.from("fornecedores").delete().eq("id", f.id);
    if (err) throw err;
    success.value = `Fornecedor ${f.codigo} excluído.`;
    await load();
  } catch (err) {
    error.value = mensagemErroExclusao(err);
  } finally {
    excluindoId.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold">Fornecedores</h1>
      <button v-if="!criando" class="btn-primary" @click="criando = true; success = ''">+ Novo fornecedor</button>
    </div>
    <FornecedorForm v-if="criando" @saved="cadastrado" @cancel="criando = false" />
    <p v-if="success" role="status" class="text-green-700 dark:text-green-300">{{ success }}</p>
    <div v-if="error" role="alert" class="text-red-700 dark:text-red-300">
      {{ error }} <button class="btn-ghost" @click="load">Tentar novamente</button>
    </div>
    <div class="card overflow-x-auto">
      <p v-if="loading" class="p-6">Carregando…</p>
      <p v-else-if="!error && !fornecedores.length" class="p-6">Nenhum fornecedor cadastrado.</p>
      <table v-else-if="!error" class="w-full text-sm">
        <thead class="bg-slate-50 dark:bg-slate-700/50"><tr>
          <th class="p-3 text-left">Código</th><th class="p-3 text-left">Razão social</th>
          <th class="p-3 text-left">CNPJ</th><th class="p-3 text-left">Status</th>
          <th class="p-3"></th>
        </tr></thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
          <tr v-for="f in fornecedores" :key="f.id">
            <td class="p-3">{{ f.codigo }}</td><td class="p-3">{{ f.razao_social }}</td>
            <td class="p-3">{{ f.cnpj || "—" }}</td><td class="p-3 capitalize">{{ f.status }}</td>
            <td class="p-3 text-right">
              <button
                type="button"
                class="text-xs text-red-600 hover:underline disabled:cursor-wait disabled:text-slate-400 dark:text-red-400"
                :disabled="excluindoId === f.id"
                @click="excluir(f)"
              >
                {{ excluindoId === f.id ? "Verificando…" : "excluir" }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
