<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const logoUrl = import.meta.env.BASE_URL + "cpii-logo.png";

interface CardDef {
  to: string;
  titulo: string;
  acao: string;
  descricao: string;
  visivel: boolean;
}

const cards = computed<CardDef[]>(() => [
  {
    to: "/dashboard",
    titulo: "Dashboard",
    acao: "Acompanhar execução",
    descricao: "Saldos, utilização por grupo e pendências em tempo real.",
    visivel: true,
  },
  {
    to: "/recibos",
    titulo: "Recibos",
    acao: auth.isCampus ? "Cadastrar / Consultar" : "Consultar",
    descricao: "Registro dos recibos de entrega assinados pelos campi.",
    visivel: true,
  },
  {
    to: "/nfs",
    titulo: "Notas Fiscais",
    acao: auth.isSane ? "Cadastrar / Conferir" : "Consultar",
    descricao: "Lançamento, conferência e débito das NFs nos empenhos.",
    visivel: true,
  },
  {
    to: "/empenhos",
    titulo: "Empenhos",
    acao: auth.isSane ? "Gerenciar" : "Consultar",
    descricao: "Notas de empenho, alocação por grupo e saldos.",
    visivel: true,
  },
  {
    to: "/ateste",
    titulo: "Ateste",
    acao: "Gerar documento",
    descricao: "PDF de ateste de recebimento para o processo de pagamento no SUAP.",
    visivel: auth.isSane,
  },
  {
    to: "/admin/usuarios",
    titulo: "Usuários",
    acao: "Administrar",
    descricao: "Papéis de acesso e campus vinculado de cada servidor.",
    visivel: auth.isAdmin,
  },
]);
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10">
    <div v-if="!auth.user" class="card p-10 text-center">
      <img :src="logoUrl" alt="Colégio Pedro II" class="mx-auto h-28 w-28 object-contain mb-5" />
      <h1 class="text-2xl font-semibold mb-3">Controle de Empenhos da SANE</h1>
      <p class="text-slate-600 mb-6 max-w-xl mx-auto">
        Sistema interno do Colégio Pedro II para registro e acompanhamento de empenhos,
        notas fiscais e recibos de gêneros alimentícios.
      </p>
      <RouterLink to="/login" class="btn-primary">Entrar com e-mail @cp2.g12.br</RouterLink>
    </div>

    <div v-else class="space-y-6">
      <div class="flex items-center gap-4">
        <img :src="logoUrl" alt="Colégio Pedro II" class="h-14 w-14 object-contain" />
        <div>
          <h1 class="text-2xl font-semibold leading-tight">Painel</h1>
          <p class="text-sm text-slate-500">
            Olá, {{ auth.perfil?.nome ?? "—" }}. O que vamos fazer hoje?
          </p>
        </div>
      </div>

      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <RouterLink
          v-for="c in cards.filter((x) => x.visivel)"
          :key="c.to"
          :to="c.to"
          class="card p-5 hover:border-cpii-500 hover:shadow-md transition-all block"
        >
          <div class="text-cpii-600 text-sm font-medium mb-1">{{ c.titulo }}</div>
          <div class="text-lg font-semibold">{{ c.acao }}</div>
          <p class="text-sm text-slate-500 mt-1">{{ c.descricao }}</p>
        </RouterLink>
      </div>
    </div>
  </div>
</template>
