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
const STORAGEV1 = url + "/storage/v1/";
// O Storage tambem pode passar pela camada de API (upload/download de PDFs),
// atras de uma flag separada (off por padrao). O download por URL assinada e
// anonimo e segue direto ao Supabase, entao nao depende disto.
const PROXY_STORAGE = import.meta.env.VITE_PROXY_STORAGE === "1";

// Quando a camada de API está ligada (build do Azure SWA), as chamadas REST/PostgREST
// do supabase-js (leituras, escritas e RPC) são roteadas para /api/rest/* — mesma
// RLS, com o token do usuário em x-sb-token (o SWA consome o header Authorization).
// Auth e Storage continuam falando direto com o Supabase.
//
// Se o token tiver expirado (aba aberta/ociosa por muito tempo), o PostgREST responde
// 401 "JWT expired". Nesse caso renovamos a sessão e repetimos a requisição uma vez —
// assim um salvamento nunca falha só porque o token venceu enquanto a tela estava aberta.
const apiFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const u =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const isRest = USE_API && u.startsWith(RESTV1);
  const isStorage = USE_API && PROXY_STORAGE && u.startsWith(STORAGEV1);
  if (!isRest && !isStorage) return fetch(input, init);

  const target = isRest
    ? "/api/rest/" + u.slice(RESTV1.length)
    : "/api/storage/" + u.slice(STORAGEV1.length);
  const buildHeaders = (token: string | null): Headers => {
    const headers = new Headers(init?.headers);
    headers.delete("Authorization");
    headers.delete("apikey");
    if (token) headers.set("x-sb-token", token);
    return headers;
  };

  const authHeader = new Headers(init?.headers).get("Authorization");
  const token = authHeader ? authHeader.replace(/^Bearer\s+/i, "") : null;

  let res = await fetch(target, { ...init, headers: buildHeaders(token) });
  if (res.status === 401) {
    const { data } = await supabase.auth.refreshSession();
    const fresh = data.session?.access_token ?? null;
    if (fresh && fresh !== token) {
      res = await fetch(target, { ...init, headers: buildHeaders(fresh) });
    }
  }
  return res;
};

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: USE_API ? { fetch: apiFetch } : undefined,
});
