import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import type { Papel } from "@/types/database";

declare module "vue-router" {
  interface RouteMeta {
    /** Rota acessível sem login. */
    public?: boolean;
    /** Restringe a rota a determinados papéis (admin sempre passa). */
    roles?: Papel[];
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "home",
    component: () => import("@/views/HomeView.vue"),
    meta: { public: true },
  },
  {
    path: "/login",
    name: "login",
    component: () => import("@/views/LoginView.vue"),
    meta: { public: true },
  },
  {
    path: "/dashboard",
    name: "dashboard",
    component: () => import("@/views/DashboardView.vue"),
  },
  {
    path: "/recibos",
    name: "recibos",
    component: () => import("@/views/RecibosView.vue"),
  },
  {
    path: "/recibos/novo",
    name: "recibo-novo",
    component: () => import("@/views/ReciboFormView.vue"),
    meta: { roles: ["campus", "sane"] },
  },
  {
    path: "/empenhos",
    name: "empenhos",
    component: () => import("@/views/EmpenhosView.vue"),
  },
  {
    path: "/empenhos/novo",
    name: "empenho-novo",
    component: () => import("@/views/EmpenhoFormView.vue"),
    meta: { roles: ["sane"] },
  },
  {
    path: "/empenhos/:id",
    name: "empenho-editar",
    component: () => import("@/views/EmpenhoFormView.vue"),
    meta: { roles: ["sane"] },
  },
  {
    path: "/nfs",
    name: "nfs",
    component: () => import("@/views/NotasFiscaisView.vue"),
  },
  {
    path: "/nfs/nova",
    name: "nf-nova",
    component: () => import("@/views/NFFormView.vue"),
    meta: { roles: ["sane"] },
  },
  {
    path: "/nfs/:id",
    name: "nf-editar",
    component: () => import("@/views/NFFormView.vue"),
    meta: { roles: ["sane"] },
  },
  {
    path: "/solicitar-nf",
    name: "solicitar-nf",
    component: () => import("@/views/SolicitarNFView.vue"),
    meta: { roles: ["sane"] },
  },
  {
    path: "/grupos",
    name: "grupos",
    component: () => import("@/views/GruposView.vue"),
  },
  {
    path: "/grupos/novo",
    name: "grupo-novo",
    component: () => import("@/views/GrupoFormView.vue"),
    meta: { roles: ["sane"] },
  },
  {
    path: "/grupos/:id",
    name: "grupo-editar",
    component: () => import("@/views/GrupoFormView.vue"),
    meta: { roles: ["sane"] },
  },
  {
    path: "/recibos/:id",
    name: "recibo-editar",
    component: () => import("@/views/ReciboFormView.vue"),
  },
  {
    path: "/ateste",
    name: "ateste",
    component: () => import("@/views/AtesteView.vue"),
    meta: { roles: ["sane"] },
  },
  {
    path: "/admin",
    name: "admin",
    component: () => import("@/views/AdminView.vue"),
    meta: { roles: [] }, // somente admin
  },
  {
    path: "/admin/usuarios",
    redirect: { name: "admin" },
  },
  {
    path: "/:pathMatch(.*)*",
    name: "not-found",
    component: () => import("@/views/NotFoundView.vue"),
    meta: { public: true },
  },
];

// Hash history evita 404 do GitHub Pages em refresh.
export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.ensureInit();

  if (to.meta.public) return true;
  if (!auth.isAuthenticated) {
    return { name: "login", query: { redirect: to.fullPath } };
  }
  if (to.meta.roles) {
    const papel = auth.papel;
    const permitido = papel === "admin" || (papel != null && to.meta.roles.includes(papel));
    if (!permitido) return { name: "dashboard" };
  }
  return true;
});
