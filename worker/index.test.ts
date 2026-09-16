import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "./index";
import { handlePosts } from "./posts";
import { handleProfileData } from "./profile-data";

const env = (fails = false) => ({
  DB: {
    prepare: () => ({
      bind() {
        return this;
      },
      first: fails
        ? vi.fn().mockRejectedValue(new Error())
        : vi.fn().mockResolvedValue({ ok: 1 }),
      all: vi.fn().mockResolvedValue({ results: [] }),
      run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
    }),
    batch: vi.fn().mockResolvedValue([]),
  },
  IMAGES: {
    list: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  },
  ENVIRONMENT: "local",
});

describe("Cloudflare API", () => {
  it("D1とR2が利用できるとhealthを返す", async () => {
    const response = await handleRequest(
      new Request("http://local/api/health"),
      env() as never,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      environment: "local",
    });
  });
  it("保存APIを認証なしで公開しない", async () => {
    const response = await handleRequest(
      new Request("http://local/api/posts"),
      env() as never,
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    const settingsResponse = await handleRequest(
      new Request("http://local/api/settings", { method: "PUT" }),
      env() as never,
    );
    expect(settingsResponse.status).toBe(401);
  });
  it("認証開始の不正なJSONを400で拒否する", async () => {
    const response = await handleRequest(
      new Request("http://local/api/auth/line/start", {
        method: "POST",
        body: "{",
      }),
      env() as never,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  });
  it("OAuth state cookieがないcallbackを拒否する", async () => {
    const response = await handleRequest(
      new Request("http://local/api/auth/line/callback?code=code&state=state"),
      { ...env(), APP_ORIGIN: "http://localhost:5173" } as never,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost:5173/?auth=failed",
    );
  });
  it("binding障害時は詳細を漏らさず503を返す", async () => {
    const response = await handleRequest(
      new Request("http://local/api/health"),
      env(true) as never,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });
});

describe("投稿保存API", () => {
  const post = {
    id: "post-1",
    body: "公園へ行った",
    plushes: [
      {
        id: "plush-1",
        name: "くま",
        hasIcon: false,
        hidden: false,
        createdAt: "2026-09-15T00:00:00.000Z",
        updatedAt: "2026-09-15T00:00:00.000Z",
      },
    ],
    images: [
      {
        id: "image-1",
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
    place: {
      latitude: 35.6812,
      longitude: 139.7671,
      name: "東京駅",
      source: "map",
    },
    createdAt: "2026-09-15T12:31:00.000Z",
    updatedAt: "2026-09-15T12:31:00.000Z",
  } as const;

  it("検証済みの投稿をD1へ、画像を非公開R2へ保存する", async () => {
    const bindings = env();
    bindings.DB.prepare = vi.fn((sql: string) => ({
      bind() {
        return this;
      },
      first: vi.fn().mockResolvedValue(null),
      all: vi.fn().mockResolvedValue({ results: [] }),
      run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
      sql,
    })) as never;
    const form = new FormData();
    form.set("metadata", JSON.stringify(post));
    form.set("full:image-1", new File(["full"], "full.webp", { type: "image/webp" }));
    form.set(
      "thumbnail:image-1",
      new File(["thumb"], "thumbnail.webp", { type: "image/webp" }),
    );

    const response = await handlePosts(
      new Request("http://local/api/posts/post-1", {
        method: "PUT",
        body: form,
      }),
      bindings as never,
      "user-1",
    );

    expect(response.status).toBe(200);
    expect(bindings.IMAGES.put).toHaveBeenCalledTimes(2);
    expect(bindings.IMAGES.put).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\/posts\/post-1\/image-1\/.+\/full$/),
      expect.anything(),
      expect.objectContaining({ httpMetadata: { contentType: "image/webp" } }),
    );
    expect(bindings.DB.batch).toHaveBeenCalledOnce();
  });

  it("投稿編集時は変更していない画像をR2へ再アップロードしない", async () => {
    const bindings = env();
    bindings.DB.prepare = vi.fn((sql: string) => ({
      bind() {
        return this;
      },
      first: vi.fn().mockResolvedValue(
        sql.includes("SELECT user_id FROM posts")
          ? { user_id: "user-1" }
          : null,
      ),
      all: vi.fn().mockResolvedValue(
        sql.includes("SELECT id,full_object_key,thumbnail_object_key")
          ? {
              results: [
                {
                  id: "image-1",
                  full_object_key: "user-1/posts/post-1/image-1/old/full",
                  thumbnail_object_key:
                    "user-1/posts/post-1/image-1/old/thumbnail",
                  width: 1200,
                  height: 800,
                  mime_type: "image/webp",
                  byte_size: 4,
                },
              ],
            }
          : { results: [] },
      ),
      run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
      sql,
    })) as never;
    const form = new FormData();
    form.set(
      "metadata",
      JSON.stringify({
        ...post,
        body: "本文だけ変更",
        images: post.images.map((image) => ({ ...image, upload: false })),
      }),
    );

    const response = await handlePosts(
      new Request("http://local/api/posts/post-1", {
        method: "PUT",
        body: form,
      }),
      bindings as never,
      "user-1",
    );

    expect(response.status).toBe(200);
    expect(bindings.IMAGES.put).not.toHaveBeenCalled();
    expect(bindings.IMAGES.delete).not.toHaveBeenCalledWith(
      "user-1/posts/post-1/image-1/old/full",
    );
    expect(bindings.IMAGES.delete).not.toHaveBeenCalledWith(
      "user-1/posts/post-1/image-1/old/thumbnail",
    );
    expect(bindings.DB.batch).toHaveBeenCalledOnce();
  });

  it("未保存の画像を再利用しようとする投稿編集を拒否する", async () => {
    const bindings = env();
    bindings.DB.prepare = vi.fn((sql: string) => ({
      bind() {
        return this;
      },
      first: vi.fn().mockResolvedValue(
        sql.includes("SELECT user_id FROM posts")
          ? { user_id: "user-1" }
          : null,
      ),
      all: vi.fn().mockResolvedValue({ results: [] }),
      run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
    })) as never;
    const form = new FormData();
    form.set(
      "metadata",
      JSON.stringify({
        ...post,
        images: post.images.map((image) => ({ ...image, upload: false })),
      }),
    );

    const response = await handlePosts(
      new Request("http://local/api/posts/post-1", {
        method: "PUT",
        body: form,
      }),
      bindings as never,
      "user-1",
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_image" });
    expect(bindings.DB.batch).not.toHaveBeenCalled();
  });

  it("画像が5枚ある投稿を拒否する", async () => {
    const input = {
      ...post,
      images: Array.from({ length: 5 }, (_, index) => ({
        ...post.images[0],
        id: `image-${index}`,
        displayOrder: index,
      })),
    };
    const form = new FormData();
    form.set("metadata", JSON.stringify(input));

    const response = await handlePosts(
      new Request("http://local/api/posts/post-1", {
        method: "PUT",
        body: form,
      }),
      env() as never,
      "user-1",
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  });

  it("別ユーザーが所有する投稿IDの更新を404で拒否する", async () => {
    const bindings = env();
    bindings.DB.prepare = vi.fn(() => ({
      bind() {
        return this;
      },
      first: vi.fn().mockResolvedValue({ user_id: "other-user" }),
      all: vi.fn().mockResolvedValue({ results: [] }),
      run: vi.fn().mockResolvedValue({ meta: { changes: 0 } }),
    })) as never;
    const input = { ...post, plushes: [], images: [] };
    const form = new FormData();
    form.set("metadata", JSON.stringify(input));

    const response = await handlePosts(
      new Request("http://local/api/posts/post-1", {
        method: "PUT",
        body: form,
      }),
      bindings as never,
      "user-1",
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
    expect(bindings.IMAGES.put).not.toHaveBeenCalled();
    expect(bindings.DB.batch).not.toHaveBeenCalled();
  });

  it("投稿に使われていないぬいを単独で保存する", async () => {
    const bindings = env();
    bindings.DB.prepare = vi.fn(() => ({
      bind() { return this; },
      first: vi.fn().mockResolvedValue(null),
      all: vi.fn().mockResolvedValue({ results: [] }),
      run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
    })) as never;
    const form = new FormData();
    form.set("metadata", JSON.stringify({ id: "plush-standalone", name: "くま", hasIcon: false, hidden: false, createdAt: "2026-09-15T10:00:00.000Z", updatedAt: "2026-09-15T11:00:00.000Z" }));
    const response = await handlePosts(new Request("http://local/api/plushes/plush-standalone", { method: "PUT", body: form }), bindings as never, "user-1");
    expect(response.status).toBe(200);
    expect(bindings.DB.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO plushes"));
  });
});

describe("データ削除API", () => {
  it("ぬいと投稿との関連を削除してアイコンをR2から除く", async () => {
    const bindings = env();
    bindings.DB.prepare = vi.fn(() => ({
      bind() {
        return this;
      },
      first: vi.fn().mockResolvedValue({ icon_object_key: "user-1/plush/icon" }),
      all: vi.fn().mockResolvedValue({ results: [] }),
      run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
    })) as never;

    const response = await handlePosts(
      new Request("http://local/api/plushes/plush-1", { method: "DELETE" }),
      bindings as never,
      "user-1",
    );

    expect(response.status).toBe(200);
    expect(bindings.DB.batch).toHaveBeenCalledOnce();
    expect(bindings.IMAGES.delete).toHaveBeenCalledWith("user-1/plush/icon");
  });

  it("アカウントと所有するR2オブジェクトを削除してsessionを破棄する", async () => {
    const bindings = env();
    bindings.DB.prepare = vi.fn((sql: string) => ({
      bind() {
        return this;
      },
      first: vi
        .fn()
        .mockResolvedValue(
          sql.includes("SELECT user_id FROM sessions")
            ? { user_id: "user-1" }
            : null,
        ),
      all: vi.fn().mockResolvedValue({ results: [] }),
      run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
    })) as never;
    bindings.IMAGES.list = vi.fn().mockResolvedValue({
      objects: [{ key: "user-1/posts/post-1/image" }],
      truncated: false,
    });

    const response = await handleRequest(
      new Request("http://local/api/account", {
        method: "DELETE",
        headers: { cookie: "nuito_session=session" },
      }),
      bindings as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      "nuito_session=; Path=/; HttpOnly;",
    );
    expect(bindings.IMAGES.delete).toHaveBeenCalledWith([
      "user-1/posts/post-1/image",
    ]);
  });
});

describe("プロフィールデータAPI", () => {
  it("設定と日記を所有者ID付きで保存する", async () => {
    const bindings = env();
    const settings = await handleProfileData(new Request("http://local/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ dayBoundaryTime: "04:00", journalPromptTime: "21:00", timezone: "Asia/Tokyo", schemaVersion: 1, updatedAt: "2026-09-15T10:00:00.000Z" }) }), bindings as never, "user-1");
    const journal = await handleProfileData(new Request("http://local/api/journals/2026-09-15", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ logicalDate: "2026-09-15", body: "日記", createdAt: "2026-09-15T10:00:00.000Z", updatedAt: "2026-09-15T11:00:00.000Z" }) }), bindings as never, "user-1");
    expect(settings.status).toBe(200);
    expect(journal.status).toBe(200);
  });

  it("1001文字の日記を拒否する", async () => {
    const response = await handleProfileData(new Request("http://local/api/journals/2026-09-15", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ logicalDate: "2026-09-15", body: "a".repeat(1001), createdAt: "2026-09-15T10:00:00.000Z", updatedAt: "2026-09-15T11:00:00.000Z" }) }), env() as never, "user-1");
    expect(response.status).toBe(400);
  });
});
