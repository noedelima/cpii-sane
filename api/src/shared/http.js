const { bearer, getUser, rest, SUPABASE_URL, SUPABASE_ANON_KEY } = require("./supa");

function json(status, body) {
  return { status, jsonBody: body };
}

// Wrapper para endpoints autenticados. Valida o token, injeta { user, token, db }
// no handler (db = atalho para o PostgREST sob a RLS do usuário) e captura erros.
function withAuth(handler) {
  return async (request, context) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return json(500, { error: "API sem SUPABASE_URL/ANON_KEY configurados." });
    }
    const token = bearer(request);
    if (!token) return json(401, { error: "Autenticação necessária." });
    const user = await getUser(token);
    if (!user) return json(401, { error: "Token inválido ou expirado." });
    try {
      return await handler({
        request,
        context,
        user,
        token,
        db: (query, opts) => rest(token, query, opts),
      });
    } catch (e) {
      context.error("Erro no handler:", e);
      return json(500, { error: (e && e.message) || "Erro interno." });
    }
  };
}

function qInt(request, name, def) {
  const v = request.query.get(name);
  const n = v == null ? NaN : parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}
function qStr(request, name, def = null) {
  const v = request.query.get(name);
  return v == null || v === "" ? def : v;
}

module.exports = { json, withAuth, qInt, qStr };
