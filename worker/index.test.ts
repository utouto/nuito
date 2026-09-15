import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "./index";

const env = (fails = false) => ({
  DB: {
    prepare: () => ({
      first: fails
        ? vi.fn().mockRejectedValue(new Error())
        : vi.fn().mockResolvedValue({ ok: 1 }),
    }),
  },
  IMAGES: {
    list: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
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
    expect(response.status).toBe(501);
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
