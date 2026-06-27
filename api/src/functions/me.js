const { app } = require("@azure/functions");
const { json, withAuth } = require("../shared/http");

// Perfil do usuário logado (public.perfis), sob RLS. Prova o pipeline de auth.
app.http("me", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "me",
  handler: withAuth(async ({ user, db }) => {
    const r = await db(`perfis?id=eq.${encodeURIComponent(user.id)}&select=*`);
    if (!r.ok) return json(500, { error: r.error });
    const perfil = Array.isArray(r.data) ? r.data[0] || null : null;
    return json(200, { user: { id: user.id, email: user.email }, perfil });
  }),
});
