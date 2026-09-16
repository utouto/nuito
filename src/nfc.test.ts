import { describe, expect, it, vi } from "vitest";
import {
  nfcLink,
  nfcTokenFromUrl,
  removeNfcTokenFromUrl,
  supportsWebNfc,
  writeNfcLink,
} from "./nfc";

const token = "123e4567-e89b-42d3-a456-426614174000";

describe("NFCタグ用リンク", () => {
  it("ぬいを識別するHTTPS URLを生成して読み取る", () => {
    const link = nfcLink(token, "https://app.nuito.workers.dev");

    expect(link).toBe(`https://app.nuito.workers.dev/?nfc=${token}`);
    expect(nfcTokenFromUrl(link)).toBe(token);
    expect(removeNfcTokenFromUrl(`${link}&auth=success`)).toBe(
      "/?auth=success",
    );
  });

  it("不正な識別子を受け付けない", () => {
    expect(nfcTokenFromUrl("https://example.com/?nfc=plush-1")).toBeNull();
    expect(nfcTokenFromUrl("https://example.com/")).toBeUndefined();
  });

  it("対応環境ではURLレコードをNFCタグへ書き込む", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const target = {
      NDEFReader: class {
        write = write;
      },
    } as unknown as Window;

    expect(supportsWebNfc(target)).toBe(true);
    await writeNfcLink("https://example.com/?nfc=token", target);
    expect(write).toHaveBeenCalledWith({
      records: [
        { recordType: "url", data: "https://example.com/?nfc=token" },
      ],
    });
  });
});
