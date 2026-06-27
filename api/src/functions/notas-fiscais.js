const { app } = require("@azure/functions");
const { json, withAuth, qInt, qStr } = require("../shared/http");

const PAGE = 50;

// Lista paginada de notas fiscais (espelha o NotasFiscaisView): filtros por número
// (ilike), grupo e status; ordenada por entrega e id desc; total exato. RLS do usuário.
app.http("notas-fiscais", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "notas-fiscais",
  handler: withAuth(async ({ request, db }) => {
    const page = qInt(request, "page", 0);
    const busca = qStr(request, "busca");
    const grupo = qStr(request, "grupo");
    const status = qStr(request, "status");

    let q = "notas_fiscais?select=*,grupos(nome,numero_romano)&order=data_entrega.desc,id.desc";
    q += `&limit=${PAGE}&offset=${page * PAGE}`;
    if (busca) q += `&numero=ilike.*${encodeURIComponent(busca)}*`;
    if (grupo) q += `&grupo_id=eq.${encodeURIComponent(grupo)}`;
    if (status) q += `&status=eq.${encodeURIComponent(status)}`;

    const r = await db(q, { count: true });
    if (!r.ok) return json(500, { error: r.error });
    return json(200, { data: r.data || [], total: r.count || 0 });
  }),
});
