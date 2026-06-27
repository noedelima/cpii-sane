const { app } = require("@azure/functions");

// Endpoint de verificação da camada de API. Não acessa banco nem exige auth —
// serve só para provar que as Azure Functions sobem e respondem em /api/health.
app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: async () => ({
    status: 200,
    jsonBody: {
      ok: true,
      service: "cpii-sane-api",
      runtime: "azure-functions",
      time: new Date().toISOString(),
    },
  }),
});
