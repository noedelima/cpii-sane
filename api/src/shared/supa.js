const { createClient } = require("@supabase/supabase-js");

// Valores PÚBLICOS (anon key + URL), vindos das app settings do Static Web App.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Cliente "anônimo" — usado só para validar o token do usuário.
function anonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Cliente no contexto do usuário: todas as queries rodam com o JWT dele, então a
// RLS do banco continua sendo a autoridade (a API não usa service_role).
function userClient(token) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

// Extrai o Bearer token do cabeçalho Authorization.
function bearer(request) {
  const h =
    request.headers.get("authorization") ||
    request.headers.get("Authorization") ||
    "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : null;
}

// Valida o token no Supabase Auth e devolve o usuário (ou null).
async function getUser(token) {
  const { data, error } = await anonClient().auth.getUser(token);
  if (error || !data || !data.user) return null;
  return data.user;
}

module.exports = { anonClient, userClient, bearer, getUser, SUPABASE_URL, SUPABASE_ANON_KEY };
