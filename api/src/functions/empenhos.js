const { app } = require("@azure/functions");
const { json, withAuth } = require("../shared/http");

// Lista de empenhos com saldos (vw_empenho_saldos). Os filtros (busca/status) são
// aplicados no cliente, então devolvemos a lista completa ordenada. RLS do usuário.
app.http("empenhos", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "empenhos",
  handler: withAuth(async ({ db }) => {
    const r = await db("vw_empenho_saldos?select=*&order=data_emissao.desc,numero");
    if (!r.ok) return json(500, { error: r.error });
    return json(200, { data: r.data || [] });
  }),
});
