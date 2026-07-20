<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import type { Campus, Papel, Perfil } from "@/types/database";

interface LinhaPerfil extends Perfil {
  _saving?: boolean;
  _savedAt?: number;
}

const auth = useAuthStore();

const perfis = ref<LinhaPerfil[]>([]);
const campi = ref<Campus[]>([]);
// perfil_id -> campus_ids vinculados (tabela perfis_campi)
const campiPorPerfil = ref<Map<string, number[]>>(new Map());
const loading = ref(true);
const error = ref<string | null>(null);

const papeis: { value: Papel; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "gestão completa, usuários e cadastros" },
  { value: "sane", label: "SANE", hint: "itens, empenhos e notas fiscais" },
  { value: "campus", label: "Campus", hint: "recibos dos campi vinculados" },
  { value: "outros", label: "Outros", hint: "somente visualização" },
];

// Snapshot do que veio do banco: habilita "Salvar" apenas na linha alterada.
const originais = ref<Map<string, string>>(new Map());
const chaveEdicao = (p: LinhaPerfil) =>
  [p.nome ?? "", p.matricula_siape ?? "", p.papel].join("|");
const mudou = (p: LinhaPerfil) => originais.value.get(p.id) !== chaveEdicao(p);

const souEu = (p: LinhaPerfil) => p.id === auth.user?.id;

const campusNome = (id: number) => campi.value.find((c) => c.id === id)?.nome ?? `#${id}`;
function nomesCampi(perfilId: string): string {
  const ids = campiPorPerfil.value.get(perfilId) ?? [];
  if (!ids.length) return "—";
  return ids.map(campusNome).join(", ");
}

// --- busca e filtro ---
const busca = ref("");
const filtroPapel = ref<Papel | "">("");

const perfisFiltrados = computed(() => {
  const t = busca.value.trim().toLowerCase();
  return perfis.value.filter((p) => {
    if (filtroPapel.value && p.papel !== filtroPapel.value) return false;
    if (!t) return true;
    return (
      (p.nome ?? "").toLowerCase().includes(t) ||
      (p.email ?? "").toLowerCase().includes(t) ||
      (p.matricula_siape ?? "").toLowerCase().includes(t)
    );
  });
});

const contagemPapel = computed(() => {
  const m = new Map<string, number>();
  for (const p of perfis.value) m.set(p.papel, (m.get(p.papel) ?? 0) + 1);
  return m;
});

async function load() {
  loading.value = true;
  error.value = null;
  const [p, c, pc] = await Promise.all([
    supabase.from("perfis").select("*").order("nome"),
    supabase.from("campi").select("*").eq("status", "ativo").order("nome"),
    supabase.from("perfis_campi").select("perfil_id, campus_id"),
  ]);
  if (p.error) error.value = p.error.message;
  perfis.value = (p.data as LinhaPerfil[] | null) ?? [];
  originais.value = new Map(perfis.value.map((x) => [x.id, chaveEdicao(x)]));
  campi.value = (c.data as Campus[] | null) ?? [];
  campiPorPerfil.value = new Map();
  for (const r of ((pc.data as { perfil_id: string; campus_id: number }[] | null) ?? [])) {
    const arr = campiPorPerfil.value.get(r.perfil_id) ?? [];
    arr.push(r.campus_id);
    campiPorPerfil.value.set(r.perfil_id, arr);
  }
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
  campi: [] as number[],
  senha: "",
});

function toggleNovoCampus(id: number) {
  const i = novo.value.campi.indexOf(id);
  if (i >= 0) novo.value.campi.splice(i, 1);
  else novo.value.campi.push(id);
}

function abrirNovo() {
  novo.value = {
    nome: "",
    email: "",
    matricula: "",
    papel: "outros",
    campi: [],
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
  if (n.papel === "campus" && n.campi.length === 0) {
    novoError.value = "Selecione ao menos um campus para o papel Campus.";
    return;
  }
  novoSaving.value = true;
  const { data, error: err } = await supabase.rpc("admin_create_user", {
    p_email: n.email.trim(),
    p_password: n.senha,
    p_nome: n.nome.trim(),
    p_papel: n.papel,
    p_campus_id: n.campi[0] ?? null,
    p_matricula: n.matricula.trim() || null,
  });
  if (!err && n.campi.length) {
    const novoId = data as string;
    const { error: e2 } = await supabase
      .from("perfis_campi")
      .insert(n.campi.map((c) => ({ perfil_id: novoId, campus_id: c })));
    if (e2) {
      novoSaving.value = false;
      novoError.value = `Usuário criado, mas falhou ao vincular campi: ${e2.message}`;
      await load();
      return;
    }
  }
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

// --- campi vinculados (admin) ---
const campiUser = ref<LinhaPerfil | null>(null);
const campiSel = ref<Set<number>>(new Set());
const campiSaving = ref(false);
const campiErr = ref<string | null>(null);

function abrirCampi(linha: LinhaPerfil) {
  campiUser.value = linha;
  campiSel.value = new Set(campiPorPerfil.value.get(linha.id) ?? []);
  campiErr.value = null;
}
function toggleCampi(id: number) {
  const s = new Set(campiSel.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  campiSel.value = s;
}
async function salvarCampi() {
  if (!campiUser.value) return;
  campiSaving.value = true;
  campiErr.value = null;
  const id = campiUser.value.id;
  const ids = [...campiSel.value];
  try {
    const { error: e1 } = await supabase.from("perfis_campi").delete().eq("perfil_id", id);
    if (e1) throw e1;
    if (ids.length) {
      const { error: e2 } = await supabase
        .from("perfis_campi")
        .insert(ids.map((c) => ({ perfil_id: id, campus_id: c })));
      if (e2) throw e2;
    }
    // campus principal (compatibilidade) = primeiro vinculado
    const principal = ids[0] ?? null;
    const { error: e3 } = await supabase.from("perfis").update({ campus_id: principal }).eq("id", id);
    if (e3) throw e3;
    campiPorPerfil.value.set(id, ids);
    campiUser.value.campus_id = principal;
    campiUser.value = null;
  } catch (e) {
    campiErr.value = e instanceof Error ? e.message : "Falha ao salvar os campi.";
  } finally {
    campiSaving.value = false;
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

// --- exclusão de usuário (admin) ---
const delUser = ref<LinhaPerfil | null>(null);
const delSaving = ref(false);
const delError = ref<string | null>(null);

function abrirExcluir(linha: LinhaPerfil) {
  delUser.value = linha;
  delError.value = null;
}

async function confirmarExcluir() {
  if (!delUser.value) return;
  delSaving.value = true;
  delError.value = null;
  const { error: err } = await supabase.rpc("admin_delete_user", {
    target_user_id: delUser.value.id,
  });
  delSaving.value = false;
  if (err) {
    delError.value = err.message;
    return;
  }
  delUser.value = null;
  await load();
}

async function salvar(linha: LinhaPerfil) {
  linha._saving = true;
  error.value = null;
  const { error: err } = await supabase
    .from("perfis")
    .update({
      papel: linha.papel,
      nome: linha.nome,
      matricula_siape: linha.matricula_siape?.trim() || null,
    })
    .eq("id", linha.id);
  linha._saving = false;
  if (err) {
    error.value = `Falha ao salvar ${linha.email ?? linha.nome}: ${err.message}`;
    return;
  }
  originais.value.set(linha.id, chaveEdicao(linha));
  linha._savedAt = Date.now();
  setTimeout(() => (linha._savedAt = undefined), 2000);
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
    <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Usuários</h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
          Defina o papel, a matrícula SIAPE (usada na assinatura do ateste) e, para o
          papel Campus, os campi vinculados. Linhas alteradas ficam destacadas até salvar.
        </p>
      </div>
      <button class="btn-primary shrink-0" @click="abrirNovo">+ Novo usuário</button>
    </div>

    <!-- Busca e filtro -->
    <div class="mb-4 flex flex-wrap items-end gap-3">
      <div class="grow max-w-sm">
        <label class="label">Buscar</label>
        <input v-model="busca" type="search" class="input" placeholder="Nome, e-mail ou SIAPE…" />
      </div>
      <div>
        <label class="label">Papel</label>
        <select v-model="filtroPapel" class="input w-44">
          <option value="">Todos</option>
          <option v-for="op in papeis" :key="op.value" :value="op.value">
            {{ op.label }} ({{ contagemPapel.get(op.value) ?? 0 }})
          </option>
        </select>
      </div>
      <p class="pb-2 text-sm text-slate-500 dark:text-slate-400">
        {{ perfisFiltrados.length }} de {{ perfis.length }} usuário(s)
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
      <div v-else-if="!perfisFiltrados.length" class="p-6 text-center text-slate-500 dark:text-slate-400">
        Nenhum usuário para esta busca.
      </div>
      <table v-else class="w-full text-sm min-w-[58rem]">
        <thead class="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 uppercase text-xs">
          <tr>
            <th class="px-3 py-2 text-left">Nome</th>
            <th class="px-3 py-2 text-left">E-mail</th>
            <th class="px-3 py-2 text-left w-24">SIAPE</th>
            <th class="px-3 py-2 text-left w-32">Papel</th>
            <th class="px-3 py-2 text-left">Campi</th>
            <th class="px-3 py-2 text-right">Ações</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
          <tr
            v-for="p in perfisFiltrados"
            :key="p.id"
            class="hover:bg-slate-50 dark:hover:bg-slate-700/40"
            :class="mudou(p) ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''"
          >
            <td class="px-3 py-2 min-w-[12rem]">
              <input v-model="p.nome" type="text" class="input" />
              <span v-if="souEu(p)" class="text-xs text-gold-700 dark:text-gold-400 font-medium">você</span>
            </td>
            <td class="px-3 py-2 text-slate-600 dark:text-slate-300 break-all">{{ p.email ?? "—" }}</td>
            <td class="px-3 py-2">
              <input
                v-model="p.matricula_siape"
                type="text"
                class="input"
                placeholder="—"
                title="Matrícula SIAPE (sai na assinatura do ateste)"
              />
            </td>
            <td class="px-3 py-2">
              <select v-model="p.papel" class="input">
                <option v-for="op in papeis" :key="op.value" :value="op.value">{{ op.label }}</option>
              </select>
            </td>
            <td class="px-3 py-2 min-w-[11rem]">
              <div class="flex items-center gap-2">
                <span class="text-slate-600 dark:text-slate-300 truncate max-w-[9rem]" :title="nomesCampi(p.id)">
                  {{ nomesCampi(p.id) }}
                </span>
                <button class="btn-ghost text-xs shrink-0" @click="abrirCampi(p)">Editar</button>
              </div>
            </td>
            <td class="px-3 py-2 text-right whitespace-nowrap">
              <div class="inline-flex items-center gap-3">
                <button class="text-xs text-cpii-600 dark:text-cpii-300 hover:underline" @click="abrirPwd(p)">
                  Senha
                </button>
                <button
                  class="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                  :disabled="souEu(p)"
                  :title="souEu(p) ? 'Você não pode excluir o próprio usuário' : 'Excluir usuário'"
                  @click="abrirExcluir(p)"
                >
                  Excluir
                </button>
                <button class="btn-secondary text-xs" :disabled="p._saving || !mudou(p)" @click="salvar(p)">
                  {{ p._saving ? "Salvando…" : p._savedAt ? "Salvo ✓" : "Salvar" }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">
      <p>
        <strong>Papéis:</strong>
        <span v-for="(op, i) in papeis" :key="op.value">{{ i ? " · " : " " }}{{ op.label }} — {{ op.hint }}</span>
      </p>
      <p>
        <strong>+ Novo usuário</strong> cadastra com senha inicial (nenhum e-mail é enviado).
        <strong>Senha</strong> redefine o acesso de quem já existe. O sistema sempre exige ao
        menos um administrador.
      </p>
    </div>

    <!-- Modal: excluir usuário -->
    <div
      v-if="delUser"
      class="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 dark:bg-black/70 px-4"
      @click.self="delUser = null"
    >
      <div class="card w-full max-w-md p-5 space-y-4">
        <h2 class="font-semibold text-red-700 dark:text-red-400">Excluir usuário</h2>
        <p class="text-sm text-slate-700 dark:text-slate-200">
          Excluir definitivamente <strong>{{ delUser.nome }}</strong>
          ({{ delUser.email ?? "sem e-mail" }})?
        </p>
        <ul class="text-xs text-slate-600 dark:text-slate-300 list-disc pl-5 space-y-1">
          <li>A conta perde o acesso imediatamente e <strong>não pode ser desfeito</strong>.</li>
          <li>
            O histórico é preservado: recibos, NFs e atestes continuam registrados, com o
            nome e a matrícula já gravados nos documentos.
          </li>
          <li>Se este for o único administrador, o sistema bloqueará a exclusão.</li>
        </ul>
        <p v-if="delError" class="text-sm text-red-600 dark:text-red-400">{{ delError }}</p>
        <div class="flex justify-end gap-2">
          <button class="btn-ghost" @click="delUser = null">Cancelar</button>
          <button
            class="btn bg-red-600 text-white hover:bg-red-700"
            :disabled="delSaving"
            @click="confirmarExcluir"
          >
            {{ delSaving ? "Excluindo…" : "Excluir definitivamente" }}
          </button>
        </div>
      </div>
    </div>

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
              <label class="label">Senha inicial (sugerida — pode editar)</label>
              <div class="flex gap-2">
                <input v-model="novo.senha" type="text" class="input font-mono" spellcheck="false" />
                <button type="button" class="btn-secondary shrink-0" @click="novo.senha = gerarSenha()">↻</button>
              </div>
            </div>
            <div class="sm:col-span-2">
              <label class="label">Campi vinculados {{ novo.papel === "campus" ? "(obrigatório)" : "(opcional)" }}</label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="c in campi"
                  :key="c.id"
                  type="button"
                  class="rounded-full border px-3 py-1 text-sm transition-colors"
                  :class="novo.campi.includes(c.id)
                    ? 'bg-cpii-600 text-white border-cpii-600'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-cpii-500'"
                  @click="toggleNovoCampus(c.id)"
                >{{ c.nome }}</button>
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

    <!-- Modal: campi vinculados -->
    <div
      v-if="campiUser"
      class="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 dark:bg-black/70 px-4"
      @click.self="campiUser = null"
    >
      <div class="card w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 class="font-semibold text-slate-800 dark:text-slate-100">
          Campi vinculados — {{ campiUser.nome }}
        </h2>
        <p class="text-sm text-slate-600 dark:text-slate-300">
          Marque os campi sob responsabilidade deste usuário. O primeiro selecionado é o
          campus principal.
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="c in campi"
            :key="c.id"
            type="button"
            class="rounded-full border px-3 py-1 text-sm transition-colors"
            :class="campiSel.has(c.id)
              ? 'bg-cpii-600 text-white border-cpii-600'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-cpii-500'"
            @click="toggleCampi(c.id)"
          >{{ c.nome }}</button>
        </div>
        <p v-if="campiErr" class="text-sm text-red-600 dark:text-red-400">{{ campiErr }}</p>
        <div class="flex justify-end gap-2">
          <button class="btn-ghost" @click="campiUser = null">Cancelar</button>
          <button class="btn-primary" :disabled="campiSaving" @click="salvarCampi">
            {{ campiSaving ? "Salvando…" : "Salvar campi" }}
          </button>
        </div>
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
