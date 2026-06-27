const { bearer, getUser, userClient } = require("./supa");

function json(status, body) {
  return { status, jsonBody: body };
}

// Wrapper para endpoints autenticados. Valida o token, monta o client no contexto
// do usuário (RLS) e injeta { user, supa } no handler. Captura erros como 500.
function withAuth(handler) {
  return async (request, context) => {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return json(500, { error: "API sem SUPABASE_URL/ANON_KEY configurados." });
    }
    const token = bearer(request);
    if (!token) return json(401, { error: "Autenticação necessária." });
    const user = await getUser(token);
    if (!user) return json(401, { error: "Token inválido ou expirado." });
    const supa = userClient(token);
    try {
      return await handler({ request, context, user, supa, token });
    } catch (e) {
      context.error("Erro no handler:", e);
      return json(500, { error: (e && e.message) || "Erro interno." });
    }
  };
}

// Lê parâmetros de query com defaults.
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
