import * as colors from "https://deno.land/std@0.78.0/fmt/colors.ts";
import * as oak from "https://deno.land/x/oak@v6.5.0/mod.ts";
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

export const responseTimeHeaderName = "X-Response-Time";

export interface AccessReport {
  readonly responseTime: number;
}

export interface AccessReporter {
  (ctx: oak.Context<Record<string, unknown>>, report: AccessReport): void;
}

export function defaultAccessReporter(
  ctx: oak.Context<Record<string, unknown>>,
  report: AccessReport,
): void {
  console.log(
    `${colors.green(ctx.request.method)} ${
      colors.brightBlue(ctx.response.status.toString())
    } ${colors.yellow(ctx.request.url.toString())} - ${
      colors.gray(report.responseTime.toString())
    }`,
  );
}

export interface TypicalMiddlewareOptions {
  readonly accessReporter?: AccessReporter;
}

export function registerTypicalMiddleware(
  app: oak.Application,
  options?: {
    accessReporter?: AccessReporter;
  },
): void {
  if (options?.accessReporter) {
    const reporter = options?.accessReporter;
    app.use(async (ctx, next) => {
      await next();
      reporter(
        ctx,
        {
          responseTime: Number.parseInt(
            ctx.response.headers.get(responseTimeHeaderName) || "-1",
          ),
        },
      );
    });
  }

  app.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    const responseTime = Date.now() - start;
    ctx.response.headers.set(responseTimeHeaderName, `${responseTime}`);
  });
}
