import type { PostImage } from "./types";
function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new Error("画像を読み込めませんでした。静止画を選び直してください。"),
      );
    };
    img.src = url;
  });
}
function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("画像を圧縮できませんでした。")),
      "image/webp",
      quality,
    ),
  );
}
export async function optimizePlushIcon(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/"))
    throw new Error("静止画ファイルを選択してください。");
  const img = await loadImage(file);
  const maxEdge = 1024;
  const scale = Math.min(
    1,
    maxEdge / Math.max(img.naturalWidth, img.naturalHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas
    .getContext("2d")!
    .drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvasBlob(canvas, 0.82);
}
export async function optimizeImage(
  file: File,
  maxEdge: number,
  quality: number,
): Promise<PostImage> {
  if (!file.type.startsWith("image/"))
    throw new Error("静止画ファイルを選択してください。");
  const img = await loadImage(file);
  const scale = Math.min(
    1,
    maxEdge / Math.max(img.naturalWidth, img.naturalHeight),
  );
  const width = Math.round(img.naturalWidth * scale),
    height = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
  const full = await canvasBlob(canvas, quality);
  const size = 480;
  const thumb = document.createElement("canvas");
  thumb.width = size;
  thumb.height = size;
  const ctx = thumb.getContext("2d")!;
  const crop = Math.min(width, height),
    sx = (width - crop) / 2,
    sy = (height - crop) / 2;
  ctx.drawImage(canvas, sx, sy, crop, crop, 0, 0, size, size);
  const thumbnail = await canvasBlob(thumb, 0.76);
  return {
    id: crypto.randomUUID(),
    full,
    thumbnail,
    width,
    height,
    mimeType: full.type,
    byteSize: full.size,
    displayOrder: 0,
    isCover: false,
  };
}
