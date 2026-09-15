import type { Post } from "./types";
export const DEFAULT_SETTINGS = {
  id: "settings" as const,
  dayBoundaryTime: "00:00",
  journalPromptTime: "21:00",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  imageMaxLongEdge: 2048,
  imageQuality: 0.82,
  schemaVersion: 1,
  started: false,
};
const pad = (n: number) => String(n).padStart(2, "0");
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localDateTime = (d = new Date()) =>
  `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export function addDays(value: string, days: number) {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d + days, 12);
  return localDate(date);
}
export function logicalDateForDateTime(value: string, boundary: string) {
  return value.slice(11, 16) >= boundary
    ? value.slice(0, 10)
    : addDays(value.slice(0, 10), -1);
}
export function effectiveLogicalDate(post: Post, boundary: string) {
  return post.timeMode === "known" && post.occurredLocalDateTime
    ? logicalDateForDateTime(post.occurredLocalDateTime, boundary)
    : post.manualLogicalDate!;
}
export function todayLogicalDate(boundary: string, now = new Date()) {
  return logicalDateForDateTime(localDateTime(now), boundary);
}
export function sortPosts(posts: Post[]) {
  return [...posts].sort((a, b) => {
    if (a.timeMode !== b.timeMode) return a.timeMode === "known" ? -1 : 1;
    if (a.timeMode === "known") {
      const cmp = (a.occurredLocalDateTime ?? "").localeCompare(
        b.occurredLocalDateTime ?? "",
      );
      if (cmp) return cmp;
    }
    return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  });
}
export function shouldPromptJournal(
  now: Date,
  boundary: string,
  prompt: string,
) {
  const current = now.getHours() * 60 + now.getMinutes();
  const b = Number(boundary.slice(0, 2)) * 60 + Number(boundary.slice(3));
  const p = Number(prompt.slice(0, 2)) * 60 + Number(prompt.slice(3));
  const elapsed = (current - b + 1440) % 1440;
  const promptElapsed = (p - b + 1440) % 1440;
  return elapsed >= promptElapsed;
}
export const formatDate = (v: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${v}T12:00`));
