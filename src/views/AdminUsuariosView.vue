<script setup lang="ts">
import { onMounted, ref } from "vue";
import { supabase } from "@/lib/supabase";
import type { Campus, Papel, Perfil } from "@/types/database";

interface LinhaPerfil extends Perfil {
  _saving?: boolean;
  _savedAt?: number;
}

const perfis = ref<LinhaPerfil[]>([]);
const campi = ref<Campus[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const papeis: { value: Papel; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "gestão completa, usuários e cadastros" },
  { value: "sane", label: "SANE", hint: "itens, empenhos e notas fiscais" },
  { value: "campus", label: "Campus", hint: "recibos do próprio campus" },
  { value: "outros", label: "Outros", hint: "somente visualização" },
];

async function load() {
  loading.value = true;
  error.value = null;
  const [p, c] = await Promise.all([
    supabase.from("perfis").select("*").order("nome"),
    supabase.from("campi").select("*").eq("status", "ativo").order("nome"),
  ]);
  if (p.error) error.value = p.error.message;
  perfis.value = (p.data as LinhaPerfil[] | null) ?? [];
  campi.value = (c.data as Campus[] | null) ?? [];
  loading.value = false;
}

async function salvar(linha: LinhaPerfil) {
  linha._saving = true;
  error.value = null;
  const { error: err } = await supabase
    .from("perfis")
    .update({
      papel: linha.papel,
      campus_id: linha.papel === "campus" ? linha.campus_id : linha.campus_id ?? null,
      nome: linha.nome,
    })
    .eq("id", linha.id);
  linha._saving = false;
  if (err) {
    error.value = `Falha ao salvar ${linha.email ?? linha.nome}: ${err.message}`;
    return;
  }
  linha._savedAt = Date.now();
  setTimeout(() => (linha._savedAt = undefined), 2000);
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
    <div class="mb-6">
      <h1 class="text-2xl font-semibold">Usuários</h1>
      <p class="text-sm text-slate-500 mt-1">
        Novos usuários entram como <strong>Outros</strong> (somente visualização) ao se
        cadastrarem pelo login. Defina aqui o papel e, para o papel Campus, o campus vinculado.
      </p>
    </div>

    <div v-if="error" class="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-4">
      {{ error }}
    </div>

    <div class="card overflow-x-auto">
      <div v-if="loading" class="p-6 text-center text-slate-500">Carregando…</div>
      <div v-else-if="!perfis.length" class="p-6 text-center text-slate-500">
        Nenhum usuário cadastrado ainda.
      </div>
      <table v-else class="w-full text-sm min-w-[44rem]">
        <thead class="bg-slate-50 text-slate-600 uppercase text-xs">
          <tr>
            <th class="px-4 py-2 text-left">Nome</th>
            <th class="px-4 py-2 text-left">E-mail</th>
            <th class="px-4 py-2 text-left">Papel</th>
            <th class="px-4 py-2 text-left">Campus</th>
            <th class="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          <tr v-for="p in perfis" :key="p.id" class="hover:bg-slate-50 align-top">
            <td class="px-4 py-2 min-w-[12rem]">
              <input v-model="p.nome" type="text" class="input" />
            </td>
            <td class="px-4 py-2 text-slate-600">{{ p.email ?? "—" }}</td>
            <td class="px-4 py-2">
              <select v-model="p.papel" class="input">
                <option v-for="op in papeis" :key="op.value" :value="op.value">
                  {{ op.label }} — {{ op.hint }}
                </option>
              </select>
            </td>
            <td class="px-4 py-2 min-w-[11rem]">
              <select v-model="p.campus_id" class="input" :disabled="p.papel !== 'campus'">
                <option :value="null">—</option>
                <option v-for="c in campi" :key="c.id" :value="c.id">{{ c.nome }}</option>
              </select>
            </td>
            <td class="px-4 py-2 text-right whitespace-nowrap">
              <button class="btn-secondary" :disabled="p._saving" @click="salvar(p)">
                {{ p._saving ? "Salvando…" : p._savedAt ? "Salvo ✓" : "Salvar" }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="text-xs text-slate-500 mt-3">
      O cadastro de novos usuários é feito pelo próprio servidor na tela de login
      (link por e-mail) ou pelo administrador no painel do Supabase.
    </p>
  </div>
</template>
