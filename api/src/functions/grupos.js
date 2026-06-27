const { app } = require("@azure/functions");
const { json, withAuth } = require("../shared/http");

// Grupos de fornecimento com código do fornecedor e contagem de itens. RLS do usuário.
app.http("grupos", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "grupos",
  handler: withAuth(async ({ db }) => {
    const r = await db("grupos?select=*,fornecedores(codigo),itens(count)&order=numero_arabico");
    if (!r.ok) return json(500, { error: r.error });
    return json(200, { data: r.data || [] });
  }),
});
