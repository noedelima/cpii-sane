// Cliente da camada de API (Azure Functions servidas em /api/* pelo Static Web App).
//
// Estrangulamento por flag de build: quando VITE_USE_API="1" (ligado no build do
// Azure SWA; desligado no GitHub Pages), as views passam a usar estes métodos em
// vez de chamar o supabase-js direto. Cada chamada manda o JWT do Supabase no
// header Authorization; a Function valida e consulta o banco sob a RLS do usuário.
import { supabase } from "@/lib/supabase";

export const USE_API = import.meta.env.VITE_USE_API === "1";

const BASE = "/api";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { ...(await authHeaders()) };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      const b = await res.json();
      if (b && b.error) msg = b.error;
    } catch {
      /* corpo não-JSON */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface DashboardResp {
  resumo: Record<string, unknown>[];
  recibosPendentes: number;
  nfsPendentes: number;
}

export interface ListResp<T> {
  data: T[];
  total: number;
}

export const api = {
  me: () => request<{ user: { id: string; email?: string }; perfil: Record<string, unknown> | null }>("GET", "/me"),
  dashboard: () => request<DashboardResp>("GET", "/dashboard"),
};
