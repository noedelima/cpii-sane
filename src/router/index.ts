import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "home",
    component: () => import("@/views/HomeView.vue"),
  },
  {
    path: "/login",
    name: "login",
    component: () => import("@/views/LoginView.vue"),
    meta: { public: true },
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
