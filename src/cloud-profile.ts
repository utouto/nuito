import { db, getSettings } from "./db";
import type { Journal, Plush, Settings } from "./types";

type ProfileResponse = {
  settings: {
    day_boundary_time: string;
    journal_prompt_time: string;
    timezone: string;
    schema_version: number;
    updated_at: string;
  } | null;
  journals: Array<{
    logical_date: string;
    body: string;
    last_post_change_at_at_save: string | null;
    created_at: string;
    updated_at: string;
  }>;
};

async function request(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  if (response.status === 401 || response.status === 501) return undefined;
  if (!response.ok) throw new Error(`cloud_request_failed:${response.status}`);
  return response;
}

export async function saveCloudSettings(settings: Settings) {
  return Boolean(await request("/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  }));
}

export async function saveCloudJournal(journal: Journal) {
  return Boolean(await request(`/api/journals/${journal.logicalDate}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(journal),
  }));
}

export async function saveCloudPlush(plush: Plush) {
  const form = new FormData();
  form.set("metadata", JSON.stringify({
    ...plush,
    icon: undefined,
    hasIcon: Boolean(plush.icon),
  }));
  if (plush.icon) form.set("icon", plush.icon, `${plush.id}-icon`);
  return Boolean(await request(`/api/plushes/${encodeURIComponent(plush.id)}`, {
    method: "PUT",
    body: form,
  }));
}

export async function syncCloudProfile() {
  const response = await request("/api/profile-data");
  if (!response) return false;
  const cloud = (await response.json()) as ProfileResponse;
  if (!Array.isArray(cloud.journals)) throw new Error("invalid_cloud_response");
  const localSettings = await getSettings();
  if (!cloud.settings || (localSettings.updatedAt && localSettings.updatedAt > cloud.settings.updated_at)) {
    const value = { ...localSettings, updatedAt: localSettings.updatedAt ?? new Date().toISOString() };
    await saveCloudSettings(value);
    await db.settings.put(value);
  } else {
    await db.settings.put({
      ...localSettings,
      dayBoundaryTime: cloud.settings.day_boundary_time,
      journalPromptTime: cloud.settings.journal_prompt_time,
      timezone: cloud.settings.timezone,
      schemaVersion: cloud.settings.schema_version,
      updatedAt: cloud.settings.updated_at,
    });
  }
  const localJournals = new Map((await db.journals.toArray()).map((journal) => [journal.logicalDate, journal]));
  for (const row of cloud.journals) {
    const local = localJournals.get(row.logical_date);
    if (local && local.updatedAt > row.updated_at) await saveCloudJournal(local);
    else await db.journals.put({ logicalDate: row.logical_date, body: row.body, lastPostChangeAtAtSave: row.last_post_change_at_at_save ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at });
    localJournals.delete(row.logical_date);
  }
  for (const journal of localJournals.values()) await saveCloudJournal(journal);
  for (const plush of await db.plushes.toArray()) await saveCloudPlush(plush);
  return true;
}
