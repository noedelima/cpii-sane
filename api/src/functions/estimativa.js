const { app } = require("@azure/functions");
const { json, withAuth } = require("../shared/http");

// Estimativa de consumo anual por item (base para a próxima ATA / ETP),
// a partir da view vw_estimativa_ata. Sob a RLS do usuário.
app.http("estimativa", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "estimativa",
  handler: withAuth(async ({ db }) => {
    const r = await db(
      "vw_estimativa_ata?select=item_id,descricao,grupo,grupo_nome,unidade," +
        "quantidade_ata,consumido_melhor,meses_ref,estimativa_anual,pct_anual_vs_ata" +
        "&order=grupo,descricao"
    );
    if (!r.ok) return json(500, { error: r.error });
    return json(200, { data: r.data || [] });
  }),
});
