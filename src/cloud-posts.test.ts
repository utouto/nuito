import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteCloudPost, saveCloudPost } from "./cloud-posts";
import type { Plush, Post } from "./types";

const post: Post = {
  id: "post-1",
  body: "公園へ行った",
  plushIds: ["plush-1"],
  images: [
    {
      id: "image-1",
      full: new Blob(["full"], { type: "image/webp" }),
      thumbnail: new Blob(["thumb"], { type: "image/webp" }),
      width: 1200,
      height: 800,
      mimeType: "image/webp",
      byteSize: 4,
      displayOrder: 0,
      isCover: true,
    },
  ],
  timeMode: "known",
  occurredLocalDateTime: "2026-09-15T12:30",
  createdAt: "2026-09-15T12:31:00.000Z",
  updatedAt: "2026-09-15T12:31:00.000Z",
};

const plush: Plush = {
  id: "plush-1",
  name: "くま",
  hidden: false,
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
};

afterEach(() => vi.unstubAllGlobals());

describe("クラウド投稿クライアント", () => {
  it("投稿メタデータと画像をmultipartで送信する", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);

    await expect(saveCloudPost(post, [plush])).resolves.toBe(true);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/posts/post-1");
    expect(init.method).toBe("PUT");
    const form = init.body as FormData;
    expect(form.get("full:image-1")).toBeInstanceOf(File);
    expect(form.get("thumbnail:image-1")).toBeInstanceOf(File);
    expect(JSON.parse(form.get("metadata") as string)).toMatchObject({
      id: "post-1",
      body: "公園へ行った",
      plushes: [{ id: "plush-1", name: "くま" }],
      images: [{ id: "image-1", byteSize: 4 }],
    });
  });

  it("未ログイン時はローカル保存へフォールバックできる", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ error: "unauthorized" }, { status: 401 }),
      ),
    );

    await expect(saveCloudPost(post, [plush])).resolves.toBe(false);
    await expect(deleteCloudPost(post.id)).resolves.toBe(false);
  });

  it("サーバー障害を保存成功として扱わない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ error: "save_failed" }, { status: 503 }),
      ),
    );

    await expect(saveCloudPost(post, [plush])).rejects.toThrow(
      "cloud_request_failed:503",
    );
  });
});
