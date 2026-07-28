import { defineMiddleware } from "astro:middleware";
import { assertProductionEnv, ProductionEnvError } from "./lib/portal/env";

export const onRequest = defineMiddleware(async ({ request }, next) => {
  try {
    assertProductionEnv();
  } catch (error) {
    if (error instanceof ProductionEnvError) {
      console.error(error.message);
      const isApiRequest = new URL(request.url).pathname.startsWith("/api/");
      const body = isApiRequest
        ? JSON.stringify({ error: "Production configuration error. Check server logs." })
        : "Production configuration error. Check server logs.";
      return new Response(body, {
        status: 500,
        headers: {
          "Content-Type": isApiRequest ? "application/json" : "text/plain; charset=utf-8",
        },
      });
    }
    throw error;
  }

  return next();
});
