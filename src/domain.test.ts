import { describe, expect, it } from "vitest";
import {
  logicalDateForDateTime,
  shouldPromptJournal,
  sortPosts,
} from "./domain";
import type { Post } from "./types";
const post = (
  id: string,
  timeMode: "known" | "unknown",
  occurred?: string,
  createdAt = "2026-09-15T12:00:00Z",
): Post => ({
  id,
  body: "x",
  plushIds: [],
  images: [],
  timeMode,
  occurredLocalDateTime: occurred,
  manualLogicalDate: timeMode === "unknown" ? "2026-09-15" : undefined,
  createdAt,
  updatedAt: createdAt,
});
describe("論理日付", () => {
  it("04:00より前は前日に分類する (AC-021)", () => {
    expect(logicalDateForDateTime("2026-09-16T02:00", "04:00")).toBe(
      "2026-09-15",
    );
    expect(logicalDateForDateTime("2026-09-16T04:00", "04:00")).toBe(
      "2026-09-16",
    );
  });
});
describe("投稿順", () => {
  it("時刻ありを昇順にし時間不明を末尾に置く (AC-050)", () => {
    const result = sortPosts([
      post("u", "unknown"),
      post("b", "known", "2026-09-15T12:00"),
      post("a", "known", "2026-09-15T09:00"),
    ]);
    expect(result.map((x) => x.id)).toEqual(["a", "b", "u"]);
  });
});
describe("日記案内", () => {
  it("境界をまたいでも論理日の案内期間を判定する (AC-042)", () => {
    expect(
      shouldPromptJournal(new Date(2026, 8, 16, 2, 0), "04:00", "21:00"),
    ).toBe(true);
    expect(
      shouldPromptJournal(new Date(2026, 8, 15, 20, 59), "04:00", "21:00"),
    ).toBe(false);
  });
});
