const { app } = require("@azure/functions");
const { json, withAuth } = require("../shared/http");

// Lista de empenhos com saldos (vw_empenho_saldos). Os filtros (busca/status) são
// aplicados no cliente, então devolvemos a lista completa ordenada. RLS do usuário.
app.http("empenhos", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "empenhos",
  handler: withAuth(async ({ request, db }) => {
    const excluidos = qStr(request, "excluidos");
    let q = "vw_empenho_saldos?select=*&order=data_emissao.desc,numero";
    q += excluidos ? "&deleted_at=not.is.null" : "&deleted_at=is.null";
    const r = await db(q);
    if (!r.ok) return json(500, { error: r.error });
    return json(200, { data: r.data || [] });
  }),
});
