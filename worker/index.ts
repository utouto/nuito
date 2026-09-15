/// <reference types="@cloudflare/workers-types" />

interface Env {
  DB: D1Database;
  IMAGES: R2Bucket;
  ENVIRONMENT: string;
}

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

export async function handleRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/health" && request.method === "GET") {
    try {
      await env.DB.prepare("SELECT 1 AS ok").first();
      await env.IMAGES.list({ limit: 1 });
      return json({ status: "ok", environment: env.ENVIRONMENT });
    } catch {
      return json({ status: "unavailable" }, 503);
    }
  }
  if (url.pathname.startsWith("/api/")) {
    return json(
      {
        error: "authentication_not_configured",
        message: "クラウド保存APIは認証方式の決定後に有効化します。",
      },
      501,
    );
  }
  return json({ error: "not_found" }, 404);
}

export default { fetch: handleRequest } satisfies ExportedHandler<Env>;
