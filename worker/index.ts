/// <reference types="@cloudflare/workers-types" />

import { handlePosts } from "./posts";

interface Env {
  DB: D1Database;
  IMAGES: R2Bucket;
  ENVIRONMENT: string;
  APP_ORIGIN: string;
  LINE_CHANNEL_ID: string;
  LINE_CHANNEL_SECRET: string;
  INVITE_PHRASE: string;
}
type LineToken = { id_token?: string };
type LineIdentity = {
  sub?: string;
  name?: string;
  picture?: string;
  nonce?: string;
  aud?: string;
};
const enc = new TextEncoder();
const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
const b64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const random = (size = 32) => b64(crypto.getRandomValues(new Uint8Array(size)));
const sha256 = async (value: string) =>
  b64(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value))));
async function sameSecret(a: string, b: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode("nuito-invite-comparison"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const [x, y] = await Promise.all(
    [a, b].map((v) => crypto.subtle.sign("HMAC", key, enc.encode(v))),
  );
  const xa = new Uint8Array(x),
    ya = new Uint8Array(y);
  if (xa.length !== ya.length) return false;
  let diff = 0;
  for (let i = 0; i < xa.length; i++) diff |= xa[i] ^ ya[i];
  return diff === 0;
}
const cookie = (name: string, token: string, maxAge: number, env: Env) =>
  `${name}=${token}; Path=/; HttpOnly; ${env.ENVIRONMENT === "local" ? "" : "Secure; "}SameSite=Lax; Max-Age=${maxAge}`;
function sessionToken(request: Request) {
  return request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)nuito_session=([^;]+)/)?.[1];
}
function oauthState(request: Request) {
  return request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)nuito_oauth_state=([^;]+)/)?.[1];
}
async function startLogin(request: Request, env: Env) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const phrase =
    typeof input === "object" &&
    input &&
    "invitePhrase" in input &&
    typeof input.invitePhrase === "string"
      ? input.invitePhrase
      : "";
  if (phrase) {
    const client = request.headers.get("cf-connecting-ip") ?? "local";
    const clientHash = await sha256(`${env.INVITE_PHRASE}:${client}`);
    const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
    await env.DB.prepare("DELETE FROM invite_attempts WHERE created_at<?")
      .bind(cutoff)
      .run();
    const attempts = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM invite_attempts WHERE client_hash=? AND created_at>?",
    )
      .bind(clientHash, cutoff)
      .first<{ count: number }>();
    if ((attempts?.count ?? 0) >= 5)
      return json({ error: "rate_limited" }, 429);
    await env.DB.prepare(
      "INSERT INTO invite_attempts(id,client_hash,created_at) VALUES(?,?,?)",
    )
      .bind(crypto.randomUUID(), clientHash, new Date().toISOString())
      .run();
  }
  const canRegister =
    phrase.length > 0 &&
    phrase.length <= 128 &&
    (await sameSecret(phrase, env.INVITE_PHRASE));
  const state = random(),
    nonce = random(),
    verifier = random(48),
    now = new Date(),
    expires = new Date(now.getTime() + 10 * 60_000).toISOString();
  await env.DB.prepare("DELETE FROM auth_attempts WHERE expires_at < ?")
    .bind(now.toISOString())
    .run();
  await env.DB.prepare(
    "INSERT INTO auth_attempts(state_hash,nonce,code_verifier,can_register,expires_at,created_at) VALUES(?,?,?,?,?,?)",
  )
    .bind(
      await sha256(state),
      nonce,
      verifier,
      canRegister ? 1 : 0,
      expires,
      now.toISOString(),
    )
    .run();
  const challenge = await sha256(verifier);
  const redirect = `${env.APP_ORIGIN}/api/auth/line/callback`;
  const url = new URL("https://access.line.me/oauth2/v2.1/authorize");
  for (const [k, v] of Object.entries({
    response_type: "code",
    client_id: env.LINE_CHANNEL_ID,
    redirect_uri: redirect,
    state,
    scope: "openid profile",
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }))
    url.searchParams.set(k, v);
  return json({ authorizationUrl: url.toString() }, 200, {
    "set-cookie": cookie("nuito_oauth_state", await sha256(state), 600, env),
  });
}
async function callback(request: Request, env: Env) {
  const url = new URL(request.url),
    code = url.searchParams.get("code"),
    state = url.searchParams.get("state");
  if (!code || !state)
    return Response.redirect(`${env.APP_ORIGIN}/?auth=cancelled`, 302);
  const stateHash = await sha256(state);
  if (oauthState(request) !== stateHash)
    return Response.redirect(`${env.APP_ORIGIN}/?auth=failed`, 302);
  const attempt = await env.DB.prepare(
    "SELECT nonce,code_verifier,can_register,expires_at FROM auth_attempts WHERE state_hash=?",
  )
    .bind(stateHash)
    .first<{
      nonce: string;
      code_verifier: string;
      can_register: number;
      expires_at: string;
    }>();
  await env.DB.prepare("DELETE FROM auth_attempts WHERE state_hash=?")
    .bind(stateHash)
    .run();
  if (!attempt || attempt.expires_at < new Date().toISOString())
    return Response.redirect(`${env.APP_ORIGIN}/?auth=expired`, 302);
  const redirect = `${env.APP_ORIGIN}/api/auth/line/callback`;
  const tokenResponse = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirect,
      client_id: env.LINE_CHANNEL_ID,
      client_secret: env.LINE_CHANNEL_SECRET,
      code_verifier: attempt.code_verifier,
    }),
  });
  if (!tokenResponse.ok)
    return Response.redirect(`${env.APP_ORIGIN}/?auth=failed`, 302);
  const token = await tokenResponse.json<LineToken>();
  if (!token.id_token)
    return Response.redirect(`${env.APP_ORIGIN}/?auth=failed`, 302);
  const verifyResponse = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      id_token: token.id_token,
      client_id: env.LINE_CHANNEL_ID,
      nonce: attempt.nonce,
    }),
  });
  if (!verifyResponse.ok)
    return Response.redirect(`${env.APP_ORIGIN}/?auth=failed`, 302);
  const identity = await verifyResponse.json<LineIdentity>();
  if (
    !identity.sub ||
    identity.aud !== env.LINE_CHANNEL_ID ||
    identity.nonce !== attempt.nonce
  )
    return Response.redirect(`${env.APP_ORIGIN}/?auth=failed`, 302);
  let user = await env.DB.prepare(
    "SELECT id FROM users WHERE provider='line' AND provider_subject=?",
  )
    .bind(identity.sub)
    .first<{ id: string }>();
  if (!user) {
    if (!attempt.can_register)
      return Response.redirect(
        `${env.APP_ORIGIN}/?auth=registration_closed`,
        302,
      );
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO users(id,provider,provider_subject,display_name,picture_url,created_at,updated_at) VALUES(?,'line',?,?,?,?,?)",
    )
      .bind(
        id,
        identity.sub,
        identity.name ?? null,
        identity.picture ?? null,
        now,
        now,
      )
      .run();
    user = { id };
  }
  const raw = random(48),
    now = new Date(),
    maxAge = 60 * 60 * 24 * 30;
  await env.DB.prepare(
    "INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)",
  )
    .bind(
      await sha256(raw),
      user.id,
      new Date(now.getTime() + maxAge * 1000).toISOString(),
      now.toISOString(),
    )
    .run();
  return new Response(null, {
    status: 302,
    headers: {
      location: `${env.APP_ORIGIN}/?auth=success`,
      "set-cookie": cookie("nuito_session", raw, maxAge, env),
      "cache-control": "no-store",
    },
  });
}
async function currentUser(request: Request, env: Env) {
  const token = sessionToken(request);
  if (!token) return json({ authenticated: false });
  const user = await env.DB.prepare(
    "SELECT users.id,users.display_name AS displayName,users.picture_url AS pictureUrl FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?",
  )
    .bind(await sha256(token), new Date().toISOString())
    .first();
  return json(user ? { authenticated: true, user } : { authenticated: false });
}
async function authenticatedUserId(request: Request, env: Env) {
  const token = sessionToken(request);
  if (!token) return undefined;
  const session = await env.DB.prepare(
    "SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?",
  )
    .bind(await sha256(token), new Date().toISOString())
    .first<{ user_id: string }>();
  return session?.user_id;
}
async function logout(request: Request, env: Env) {
  const token = sessionToken(request);
  if (token)
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(await sha256(token))
      .run();
  return json({ ok: true }, 200, {
    "set-cookie": cookie("nuito_session", "", 0, env),
  });
}
async function deleteAccount(env: Env, userId: string) {
  const keys: string[] = [];
  let cursor: string | undefined;
  try {
    do {
      const page = await env.IMAGES.list({ prefix: `${userId}/`, cursor });
      keys.push(...page.objects.map((object) => object.key));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  } catch {
    return json({ error: "service_unavailable" }, 503);
  }
  await env.DB.prepare("DELETE FROM users WHERE id=?").bind(userId).run();
  let cleanupPending = false;
  try {
    for (let index = 0; index < keys.length; index += 1000)
      await env.IMAGES.delete(keys.slice(index, index + 1000));
  } catch {
    cleanupPending = true;
  }
  return json({ ok: true, cleanupPending }, 200, {
    "set-cookie": cookie("nuito_session", "", 0, env),
  });
}
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
  if (url.pathname === "/api/auth/line/start" && request.method === "POST")
    return startLogin(request, env);
  if (url.pathname === "/api/auth/line/callback" && request.method === "GET")
    return callback(request, env);
  if (url.pathname === "/api/auth/session" && request.method === "GET")
    return currentUser(request, env);
  if (url.pathname === "/api/auth/logout" && request.method === "POST")
    return logout(request, env);
  if (url.pathname === "/api/account" && request.method === "DELETE") {
    try {
      const userId = await authenticatedUserId(request, env);
      if (!userId) return json({ error: "unauthorized" }, 401);
      return deleteAccount(env, userId);
    } catch {
      return json({ error: "service_unavailable" }, 503);
    }
  }
  if (
    url.pathname === "/api/posts" ||
    url.pathname.startsWith("/api/posts/") ||
    url.pathname.startsWith("/api/post-images/") ||
    url.pathname.startsWith("/api/plushes/") ||
    url.pathname.startsWith("/api/plush-icons/")
  ) {
    try {
      const userId = await authenticatedUserId(request, env);
      if (!userId) return json({ error: "unauthorized" }, 401);
      return handlePosts(request, env, userId);
    } catch {
      return json({ error: "service_unavailable" }, 503);
    }
  }
  if (url.pathname.startsWith("/api/"))
    return json({ error: "not_implemented" }, 501);
  return json({ error: "not_found" }, 404);
}
export default { fetch: handleRequest } satisfies ExportedHandler<Env>;
