import { afterEach, describe, expect, it, vi } from "vitest";
import { saveCloudJournal, saveCloudPlush, saveCloudSettings } from "./cloud-profile";

afterEach(() => vi.unstubAllGlobals());

describe("クラウドプロフィールクライアント", () => {
  it("設定、日記、投稿未使用のぬいを専用APIへ保存する", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await saveCloudSettings({ id: "settings", dayBoundaryTime: "04:00", journalPromptTime: "21:00", timezone: "Asia/Tokyo", imageMaxLongEdge: 2048, imageQuality: 0.82, schemaVersion: 1, started: true, updatedAt: "2026-09-15T10:00:00.000Z" });
    await saveCloudJournal({ logicalDate: "2026-09-15", body: "日記", createdAt: "2026-09-15T10:00:00.000Z", updatedAt: "2026-09-15T11:00:00.000Z" });
    await saveCloudPlush({ id: "plush-1", name: "くま", icon: new Blob(["icon"], { type: "image/webp" }), hidden: false, createdAt: "2026-09-15T10:00:00.000Z", updatedAt: "2026-09-15T11:00:00.000Z" });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/settings", "/api/journals/2026-09-15", "/api/plushes/plush-1"]);
    expect((fetch.mock.calls[2][1].body as FormData).get("icon")).toBeInstanceOf(File);
  });

  it("未認証はローカル保存へフォールバックできる", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status: 401 })));
    await expect(saveCloudJournal({ logicalDate: "2026-09-15", body: "", createdAt: "2026-09-15T10:00:00.000Z", updatedAt: "2026-09-15T11:00:00.000Z" })).resolves.toBe(false);
  });
});
