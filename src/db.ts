import Dexie, { type EntityTable } from "dexie";
import type { Journal, Plush, Post, PostDraft, Settings } from "./types";
import { DEFAULT_SETTINGS } from "./domain";
class NuitoDatabase extends Dexie {
  posts!: EntityTable<Post, "id">;
  plushes!: EntityTable<Plush, "id">;
  journals!: EntityTable<Journal, "logicalDate">;
  settings!: EntityTable<Settings, "id">;
  postDrafts!: EntityTable<PostDraft, "id">;
  constructor() {
    super("nuito");
    this.version(1).stores({
      posts: "id,createdAt,updatedAt,timeMode,manualLogicalDate",
      plushes: "id,name,hidden",
      journals: "logicalDate,updatedAt",
      settings: "id",
    });
    this.version(2).stores({
      posts: "id,createdAt,updatedAt,timeMode,manualLogicalDate",
      plushes: "id,name,hidden,nfcToken",
      journals: "logicalDate,updatedAt",
      settings: "id",
      postDrafts: "id,updatedAt",
    });
  }
}
export const db = new NuitoDatabase();
export async function getSettings(): Promise<Settings> {
  return (await db.settings.get("settings")) ?? DEFAULT_SETTINGS;
}
export async function initialize() {
  if (!(await db.settings.get("settings")))
    await db.settings.put(DEFAULT_SETTINGS);
}
export async function deleteAllData() {
  await db.transaction(
    "rw",
    db.posts,
    db.plushes,
    db.journals,
    db.settings,
    db.postDrafts,
    async () => {
      await Promise.all([
        db.posts.clear(),
        db.plushes.clear(),
        db.journals.clear(),
        db.settings.clear(),
        db.postDrafts.clear(),
      ]);
      await db.settings.put(DEFAULT_SETTINGS);
    },
  );
}
export async function deletePlush(plushId: string) {
  await db.transaction("rw", db.posts, db.plushes, async () => {
    const posts = await db.posts
      .filter((post) => post.plushIds.includes(plushId))
      .toArray();
    await db.posts.bulkPut(
      posts.map((post) => ({
        ...post,
        plushIds: post.plushIds.filter((id) => id !== plushId),
        updatedAt: new Date().toISOString(),
      })),
    );
    await db.plushes.delete(plushId);
  });
}
