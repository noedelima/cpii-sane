const { app } = require("@azure/functions");
const { json, withAuth } = require("../shared/http");

// Inteligência de consumo para o Dashboard: séries das views analíticas
// (consumo mensal, item x ATA reconciliado, curva ABC, campus, fornecedor).
// Tudo sob a RLS do usuário (SANE/admin veem tudo; campus vê o próprio recorte).
app.http("analytics", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "analytics",
  handler: withAuth(async ({ db }) => {
    const [mensal, itens, abc, campus, fornecedor] = await Promise.all([
      db("vw_consumo_mensal?select=mes,nfs,valor,futuro&order=mes"),
      db(
        "vw_item_consumo?select=item_id,descricao,grupo,unidade,quantidade_ata," +
          "consumido_fisico,consumido_faturado,consumido_melhor,valor_melhor," +
          "pct_ata_melhor,saldo_ata&order=pct_ata_melhor.desc.nullslast"
      ),
      db("vw_item_abc?select=descricao,grupo,valor,share_pct,acum_pct,classe&order=valor.desc"),
      db("vw_consumo_campus?select=campus,recibos,valor_estimado&order=valor_estimado.desc"),
      db("vw_fornecedor_consumo?select=fornecedor,grupos,utilizado,share_pct&order=utilizado.desc"),
    ]);
    const err = [mensal, itens, abc, campus, fornecedor].find((r) => !r.ok);
    if (err) return json(500, { error: err.error });
    return json(200, {
      mensal: mensal.data || [],
      itens: itens.data || [],
      abc: abc.data || [],
      campus: campus.data || [],
      fornecedor: fornecedor.data || [],
    });
  }),
});
