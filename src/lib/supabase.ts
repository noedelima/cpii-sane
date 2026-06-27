import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const USE_API = import.meta.env.VITE_USE_API === "1";

if (!url || !anonKey) {
  console.error(
    "[supabase] Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não estão definidas. " +
      "Crie um arquivo .env.local seguindo .env.example."
  );
}

const RESTV1 = url + "/rest/v1/";

// Quando a camada de API está ligada (build do Azure SWA), as chamadas REST/PostgREST
// do supabase-js (leituras, escritas e RPC) são roteadas para /api/rest/* — mesma
// RLS, com o token do usuário em x-sb-token (o SWA consome o header Authorization).
// Auth e Storage continuam falando direto com o Supabase.
const apiFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const u =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (USE_API && u.startsWith(RESTV1)) {
    const headers = new Headers(init?.headers);
    const auth = headers.get("Authorization");
    const token = auth ? auth.replace(/^Bearer\s+/i, "") : null;
    headers.delete("Authorization");
    headers.delete("apikey");
    if (token) headers.set("x-sb-token", token);
    return fetch("/api/rest/" + u.slice(RESTV1.length), { ...init, headers });
  }
  return fetch(input, init);
};

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: USE_API ? { fetch: apiFetch } : undefined,
});
