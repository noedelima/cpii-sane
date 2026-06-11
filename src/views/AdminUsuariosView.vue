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

// --- novo usuário (admin) ---
const novoOpen = ref(false);
const novoSaving = ref(false);
const novoError = ref<string | null>(null);
const novoDone = ref(false);
const novoCopiado = ref(false);
const novo = ref({
  nome: "",
  email: "",
  matricula: "",
  papel: "outros" as Papel,
  campus_id: null as number | null,
  senha: "",
});

function abrirNovo() {
  novo.value = {
    nome: "",
    email: "",
    matricula: "",
    papel: "outros",
    campus_id: null,
    senha: gerarSenha(),
  };
  novoError.value = null;
  novoDone.value = false;
  novoCopiado.value = false;
  novoOpen.value = true;
}

async function criarUsuario() {
  novoError.value = null;
  const n = novo.value;
  if (!n.nome.trim() || !n.email.trim()) {
    novoError.value = "Preencha nome e e-mail.";
    return;
  }
  if (n.senha.length < 10) {
    novoError.value = "A senha deve ter ao menos 10 caracteres.";
    return;
  }
  if (n.papel === "campus" && !n.campus_id) {
    novoError.value = "Selecione o campus para o papel Campus.";
    return;
  }
  novoSaving.value = true;
  const { error: err } = await supabase.rpc("admin_create_user", {
    p_email: n.email.trim(),
    p_password: n.senha,
    p_nome: n.nome.trim(),
    p_papel: n.papel,
    p_campus_id: n.campus_id,
    p_matricula: n.matricula.trim() || null,
  });
  novoSaving.value = false;
  if (err) {
    novoError.value = err.message;
    return;
  }
  novoDone.value = true;
  await load();
}

async function copiarNovaSenha() {
  try {
    await navigator.clipboard.writeText(novo.value.senha);
    novoCopiado.value = true;
    setTimeout(() => (novoCopiado.value = false), 1500);
  } catch {
    /* clipboard indisponível */
  }
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
    <div class="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
      <h1 class="text-2xl font-semibold">Usuários</h1>
      <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
        Novos usuários entram como <strong>Outros</strong> (somente visualização) ao se
        cadastrarem pelo login. Defina aqui o papel, a matrícula SIAPE (usada na
        assinatura do ateste) e, para o papel Campus, o campus vinculado.
      </p>
      </div>
      <button class="btn-primary" @click="abrirNovo">+ Novo usuário</button>
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
      Use <strong>+ Novo usuário</strong> para cadastrar um servidor com senha inicial
      (nenhum e-mail é enviado). <strong>Definir senha</strong> redefine o acesso de quem
      já existe — útil porque o e-mail institucional nem sempre recebe o link de login.
    </p>

    <!-- Modal: novo usuário -->
    <div
      v-if="novoOpen"
      class="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 dark:bg-black/70 px-4"
      @click.self="novoOpen = false"
    >
      <div class="card w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 class="font-semibold text-slate-800 dark:text-slate-100">Novo usuário</h2>

        <template v-if="!novoDone">
          <div class="grid sm:grid-cols-2 gap-4">
            <div class="sm:col-span-2">
              <label class="label">Nome completo</label>
              <input v-model="novo.nome" type="text" class="input" />
            </div>
            <div>
              <label class="label">E-mail institucional</label>
              <input v-model="novo.email" type="email" class="input" placeholder="servidor@cp2.g12.br" />
            </div>
            <div>
              <label class="label">Matrícula SIAPE (opcional)</label>
              <input v-model="novo.matricula" type="text" class="input" />
            </div>
            <div>
              <label class="label">Papel</label>
              <select v-model="novo.papel" class="input">
                <option v-for="op in papeis" :key="op.value" :value="op.value">
                  {{ op.label }} — {{ op.hint }}
                </option>
              </select>
            </div>
            <div>
              <label class="label">Campus</label>
              <select v-model="novo.campus_id" class="input" :disabled="novo.papel !== 'campus'">
                <option :value="null">—</option>
                <option v-for="c in campi" :key="c.id" :value="c.id">{{ c.nome }}</option>
              </select>
            </div>
            <div class="sm:col-span-2">
              <label class="label">Senha inicial (sugerida — pode editar)</label>
              <div class="flex gap-2">
                <input v-model="novo.senha" type="text" class="input font-mono" spellcheck="false" />
                <button type="button" class="btn-secondary shrink-0" @click="novo.senha = gerarSenha()">↻</button>
              </div>
            </div>
          </div>
          <p class="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-md p-2">
            A conta já nasce com o e-mail confirmado — nenhum e-mail é enviado.
            Anote a senha e repasse ao servidor por canal seguro.
          </p>
          <p v-if="novoError" class="text-sm text-red-600 dark:text-red-400">{{ novoError }}</p>
          <div class="flex justify-end gap-2">
            <button class="btn-ghost" @click="novoOpen = false">Cancelar</button>
            <button class="btn-primary" :disabled="novoSaving" @click="criarUsuario">
              {{ novoSaving ? "Criando…" : "Criar usuário" }}
            </button>
          </div>
        </template>

        <template v-else>
          <div class="rounded-md bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 p-3 text-sm text-green-800 dark:text-green-200">
            Usuário <strong>{{ novo.nome }}</strong> criado ({{ novo.email }}).
            Copie e repasse a senha inicial:
            <div class="mt-2 flex items-center gap-2">
              <code class="bg-white dark:bg-slate-800 border border-green-200 dark:border-green-900 rounded px-2 py-1 font-mono text-sm">{{ novo.senha }}</code>
              <button class="btn-secondary" @click="copiarNovaSenha">
                {{ novoCopiado ? "Copiado ✓" : "Copiar" }}
              </button>
            </div>
          </div>
          <div class="flex justify-end">
            <button class="btn-primary" @click="novoOpen = false">Fechar</button>
          </div>
        </template>
      </div>
    </div>

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
