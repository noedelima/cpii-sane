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

// --- definição de senha (admin) ---
const pwdUser = ref<LinhaPerfil | null>(null);
const pwdValue = ref("");
const pwdSaving = ref(false);
const pwdError = ref<string | null>(null);
const pwdDone = ref(false);
const copiado = ref(false);

function gerarSenha(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alfabeto[b % alfabeto.length]).join("");
}

function abrirPwd(linha: LinhaPerfil) {
  pwdUser.value = linha;
  pwdValue.value = gerarSenha();
  pwdError.value = null;
  pwdDone.value = false;
  copiado.value = false;
}

async function copiarSenha() {
  try {
    await navigator.clipboard.writeText(pwdValue.value);
    copiado.value = true;
    setTimeout(() => (copiado.value = false), 1500);
  } catch {
    /* clipboard indisponível: usuário copia manualmente */
  }
}

async function confirmarPwd() {
  if (!pwdUser.value) return;
  pwdError.value = null;
  if (pwdValue.value.length < 10) {
    pwdError.value = "Use ao menos 10 caracteres.";
    return;
  }
  pwdSaving.value = true;
  const { error: err } = await supabase.rpc("admin_set_user_password", {
    target_user_id: pwdUser.value.id,
    new_password: pwdValue.value,
  });
  pwdSaving.value = false;
  if (err) {
    pwdError.value = err.message;
    return;
  }
  pwdDone.value = true;
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
      matricula_siape: linha.matricula_siape?.trim() || null,
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
      <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
        Novos usuários entram como <strong>Outros</strong> (somente visualização) ao se
        cadastrarem pelo login. Defina aqui o papel, a matrícula SIAPE (usada na
        assinatura do ateste) e, para o papel Campus, o campus vinculado.
      </p>
    </div>

    <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300 mb-4">
      {{ error }}
    </div>

    <div class="card overflow-x-auto">
      <div v-if="loading" class="p-6 text-center text-slate-500 dark:text-slate-400">Carregando…</div>
      <div v-else-if="!perfis.length" class="p-6 text-center text-slate-500 dark:text-slate-400">
        Nenhum usuário cadastrado ainda.
      </div>
      <table v-else class="w-full text-sm min-w-[44rem]">
        <thead class="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 uppercase text-xs">
          <tr>
            <th class="px-4 py-2 text-left">Nome</th>
            <th class="px-4 py-2 text-left">E-mail</th>
            <th class="px-4 py-2 text-left">SIAPE</th>
            <th class="px-4 py-2 text-left">Papel</th>
            <th class="px-4 py-2 text-left">Campus</th>
            <th class="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
          <tr v-for="p in perfis" :key="p.id" class="hover:bg-slate-50 dark:hover:bg-slate-700/40 align-top">
            <td class="px-4 py-2 min-w-[12rem]">
              <input v-model="p.nome" type="text" class="input" />
            </td>
            <td class="px-4 py-2 text-slate-600 dark:text-slate-300">{{ p.email ?? "—" }}</td>
            <td class="px-4 py-2 w-32">
              <input
                v-model="p.matricula_siape"
                type="text"
                class="input"
                placeholder="—"
                title="Matrícula SIAPE (sai na assinatura do ateste)"
              />
            </td>
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
            <td class="px-4 py-2 text-right whitespace-nowrap space-x-2">
              <button class="btn-ghost" @click="abrirPwd(p)">Definir senha</button>
              <button class="btn-secondary" :disabled="p._saving" @click="salvar(p)">
                {{ p._saving ? "Salvando…" : p._savedAt ? "Salvo ✓" : "Salvar" }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="text-xs text-slate-500 dark:text-slate-400 mt-3">
      O cadastro de novos usuários é feito pelo próprio servidor na tela de login
      (link por e-mail) ou pelo administrador no painel do Supabase. Como o e-mail
      institucional nem sempre recebe o link, use <strong>Definir senha</strong> para
      liberar o acesso por senha.
    </p>

    <!-- Modal: definir senha de usuário -->
    <div
      v-if="pwdUser"
      class="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 dark:bg-black/70 px-4"
      @click.self="pwdUser = null"
    >
      <div class="card w-full max-w-md p-5 space-y-4">
        <h2 class="font-semibold text-slate-800 dark:text-slate-100">
          Definir senha — {{ pwdUser.nome }}
        </h2>
        <p class="text-sm text-slate-600 dark:text-slate-300">
          {{ pwdUser.email ?? "—" }}
        </p>

        <template v-if="!pwdDone">
          <div>
            <label class="label">Nova senha (sugerida — pode editar)</label>
            <div class="flex gap-2">
              <input v-model="pwdValue" type="text" class="input font-mono" spellcheck="false" />
              <button type="button" class="btn-secondary shrink-0" @click="pwdValue = gerarSenha()">↻</button>
            </div>
          </div>
          <p class="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-md p-2">
            Anote e repasse a senha ao servidor por canal seguro. Ela não poderá ser
            consultada depois — apenas redefinida. O e-mail é confirmado automaticamente.
          </p>
          <p v-if="pwdError" class="text-sm text-red-600 dark:text-red-400">{{ pwdError }}</p>
          <div class="flex justify-end gap-2">
            <button class="btn-ghost" @click="pwdUser = null">Cancelar</button>
            <button class="btn-primary" :disabled="pwdSaving" @click="confirmarPwd">
              {{ pwdSaving ? "Aplicando…" : "Definir senha" }}
            </button>
          </div>
        </template>

        <template v-else>
          <div class="rounded-md bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 p-3 text-sm text-green-800 dark:text-green-200">
            Senha definida com sucesso. Copie e repasse ao servidor:
            <div class="mt-2 flex items-center gap-2">
              <code class="bg-white dark:bg-slate-800 border border-green-200 dark:border-green-900 rounded px-2 py-1 font-mono text-sm">{{ pwdValue }}</code>
              <button class="btn-secondary" @click="copiarSenha">
                {{ copiado ? "Copiado ✓" : "Copiar" }}
              </button>
            </div>
          </div>
          <div class="flex justify-end">
            <button class="btn-primary" @click="pwdUser = null">Fechar</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
