import * as oak from "https://deno.land/x/oak@v6.3.2/mod.ts";
import * as health from "./health.ts";

// TODO: add https://github.com/marcopacini/ts-prometheus based /metrics route
// TODO: add https://github.com/singhcool/deno-swagger-doc based OpenAPI generator

export interface HealthRouteSupplier {
  readonly serviceVersion: () => string;
  readonly endpoint: () => Promise<health.HealthServiceStatusEndpoint>;
}

export function registerHealthRoute(
  app: oak.Application,
  supplier: HealthRouteSupplier,
): void {
  const router = new oak.Router()
    .get("/health", async (ctx) => {
      const ep = await supplier.endpoint();
      Object.entries(ep.headers).forEach((e) =>
        ctx.response.headers.set(e[0], e[1])
      );
      ctx.response.body = ep.body;
    })
    .get("/health/version", (ctx) => {
      ctx.response.body = supplier.serviceVersion;
    });
  app.use(router.routes());
}
