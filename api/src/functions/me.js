const { app } = require("@azure/functions");
const { json, withAuth } = require("../shared/http");

// Perfil do usuário logado (public.perfis), com leitura sob RLS. Prova o pipeline
// de autenticação: front manda o JWT do Supabase, a Function valida e responde.
app.http("me", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "me",
  handler: withAuth(async ({ user, supa }) => {
    const { data, error } = await supa
      .from("perfis")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    if (error) return json(500, { error: error.message });
    return json(200, {
      user: { id: user.id, email: user.email },
      perfil: data,
    });
  }),
});
