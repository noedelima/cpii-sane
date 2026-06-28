const { app } = require("@azure/functions");
const { json, withAuth, qInt, qStr } = require("../shared/http");

const PAGE = 50;

// Lista paginada de recibos (espelha o RecibosView): filtros por número (ilike),
// campus, grupo e status; ordenada por data e id desc; com total exato. RLS do usuário.
app.http("recibos", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "recibos",
  handler: withAuth(async ({ request, db }) => {
    const page = qInt(request, "page", 0);
    const busca = qStr(request, "busca");
    const campus = qStr(request, "campus");
    const grupo = qStr(request, "grupo");
    const status = qStr(request, "status");
    const excluidos = qStr(request, "excluidos");

    let q = "recibos?select=*,campi(nome),grupos(nome)&order=data_recebimento.desc,id.desc";
    q += `&limit=${PAGE}&offset=${page * PAGE}`;
    if (busca) q += `&numero=ilike.*${encodeURIComponent(busca)}*`;
    if (campus) q += `&campus_id=eq.${encodeURIComponent(campus)}`;
    if (grupo) q += `&grupo_id=eq.${encodeURIComponent(grupo)}`;
    if (status) q += `&status=eq.${encodeURIComponent(status)}`;
    q += excluidos ? "&deleted_at=not.is.null" : "&deleted_at=is.null";

    const r = await db(q, { count: true });
    if (!r.ok) return json(500, { error: r.error });
    return json(200, { data: r.data || [], total: r.count || 0 });
  }),
});
