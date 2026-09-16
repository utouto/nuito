/// <reference types="@cloudflare/workers-types" />

export interface ProfileDataEnv { DB: D1Database }
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
const timestamp = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));
const validDate = (value: string) => {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};
async function readJson(request: Request) { try { return (await request.json()) as Record<string, unknown>; } catch { return undefined; } }

async function listProfileData(env: ProfileDataEnv, userId: string) {
  const [settings, journals] = await Promise.all([
    env.DB.prepare("SELECT day_boundary_time,journal_prompt_time,show_map_companion_icons,timezone,schema_version,updated_at FROM user_settings WHERE user_id=?").bind(userId).first<Record<string, unknown>>(),
    env.DB.prepare("SELECT logical_date,body,last_post_change_at_at_save,created_at,updated_at FROM daily_journals WHERE user_id=? ORDER BY logical_date").bind(userId).all<Record<string, unknown>>(),
  ]);
  return response({ settings: settings ?? null, journals: journals.results });
}

async function saveSettings(request: Request, env: ProfileDataEnv, userId: string) {
  const value = await readJson(request);
  if (!value || typeof value.dayBoundaryTime !== "string" || !TIME.test(value.dayBoundaryTime) || typeof value.journalPromptTime !== "string" || !TIME.test(value.journalPromptTime) || (value.showMapCompanionIcons !== undefined && typeof value.showMapCompanionIcons !== "boolean") || typeof value.timezone !== "string" || value.timezone.length < 1 || value.timezone.length > 100 || !Number.isInteger(value.schemaVersion) || Number(value.schemaVersion) < 1 || Number(value.schemaVersion) > 100 || !timestamp(value.updatedAt)) return response({ error: "invalid_request" }, 400);
  await env.DB.prepare(`INSERT INTO user_settings(user_id,day_boundary_time,journal_prompt_time,show_map_companion_icons,timezone,schema_version,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET day_boundary_time=excluded.day_boundary_time,journal_prompt_time=excluded.journal_prompt_time,show_map_companion_icons=excluded.show_map_companion_icons,timezone=excluded.timezone,schema_version=excluded.schema_version,updated_at=excluded.updated_at`).bind(userId, value.dayBoundaryTime, value.journalPromptTime, value.showMapCompanionIcons === false ? 0 : 1, value.timezone, value.schemaVersion, value.updatedAt).run();
  return response({ ok: true });
}

async function saveJournal(request: Request, env: ProfileDataEnv, userId: string, logicalDate: string) {
  const value = await readJson(request);
  if (!validDate(logicalDate) || !value || value.logicalDate !== logicalDate || typeof value.body !== "string" || value.body.length > 1000 || (value.lastPostChangeAtAtSave !== undefined && !timestamp(value.lastPostChangeAtAtSave)) || !timestamp(value.createdAt) || !timestamp(value.updatedAt)) return response({ error: "invalid_request" }, 400);
  await env.DB.prepare(`INSERT INTO daily_journals(user_id,logical_date,body,last_post_change_at_at_save,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,logical_date) DO UPDATE SET body=excluded.body,last_post_change_at_at_save=excluded.last_post_change_at_at_save,updated_at=excluded.updated_at`).bind(userId, logicalDate, value.body, value.lastPostChangeAtAtSave ?? null, value.createdAt, value.updatedAt).run();
  return response({ ok: true });
}

export async function handleProfileData(request: Request, env: ProfileDataEnv, userId: string) {
  const url = new URL(request.url);
  if (url.pathname === "/api/profile-data" && request.method === "GET") return listProfileData(env, userId);
  if (url.pathname === "/api/settings" && request.method === "PUT") return saveSettings(request, env, userId);
  const journal = url.pathname.match(/^\/api\/journals\/(\d{4}-\d{2}-\d{2})$/);
  if (journal && request.method === "PUT") return saveJournal(request, env, userId, journal[1]);
  return response({ error: "not_found" }, 404);
}
