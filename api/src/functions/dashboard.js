const { app } = require("@azure/functions");
const { json, withAuth } = require("../shared/http");

// Resumo do Dashboard: execução por grupo (vw_grupo_resumo) + contagens de
// pendentes. Espelha as queries do DashboardView, sob a RLS do usuário.
app.http("dashboard", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "dashboard",
  handler: withAuth(async ({ db }) => {
    const [g, r, n] = await Promise.all([
      db("vw_grupo_resumo?select=*&order=numero_arabico"),
      db("recibos?select=id&status=eq.pendente", { method: "HEAD", count: true }),
      db("notas_fiscais?select=id&status=eq.pendente", { method: "HEAD", count: true }),
    ]);
    if (!g.ok) return json(500, { error: g.error });
    return json(200, {
      resumo: g.data || [],
      recibosPendentes: r.count || 0,
      nfsPendentes: n.count || 0,
    });
  }),
});
