const NFC_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function nfcLink(token: string, origin = location.origin) {
  const url = new URL("/", origin);
  url.searchParams.set("nfc", token);
  return url.toString();
}

export function nfcTokenFromUrl(url: string) {
  const value = new URL(url).searchParams.get("nfc");
  if (value === null) return undefined;
  return NFC_TOKEN.test(value) ? value : null;
}

export function removeNfcTokenFromUrl(url: string) {
  const value = new URL(url);
  value.searchParams.delete("nfc");
  return `${value.pathname}${value.search}${value.hash}`;
}

type WebNfcReader = {
  write(message: {
    records: Array<{ recordType: "url"; data: string }>;
  }): Promise<void>;
};

type WebNfcWindow = Window & {
  NDEFReader?: new () => WebNfcReader;
};

export function supportsWebNfc(target: Window = window) {
  return typeof (target as WebNfcWindow).NDEFReader === "function";
}

export async function writeNfcLink(url: string, target: Window = window) {
  const Reader = (target as WebNfcWindow).NDEFReader;
  if (!Reader) throw new Error("unsupported");
  await new Reader().write({
    records: [{ recordType: "url", data: url }],
  });
}
