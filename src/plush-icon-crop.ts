import type { PlushIconCrop } from "./types";

export const DEFAULT_PLUSH_ICON_CROP: PlushIconCrop = {
  x: 50,
  y: 50,
  zoom: 1,
};

export function clampPlushIconCrop(crop: PlushIconCrop): PlushIconCrop {
  return {
    x: Math.min(100, Math.max(0, crop.x)),
    y: Math.min(100, Math.max(0, crop.y)),
    zoom: Math.min(3, Math.max(1, crop.zoom)),
  };
}

export function adjustPlushIconCrop(
  crop: PlushIconCrop,
  movement: { x: number; y: number },
  viewport: { width: number; height: number },
  scale = 1,
): PlushIconCrop {
  const zoom = crop.zoom * scale;
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  return clampPlushIconCrop({
    x: crop.x - (movement.x / (width * zoom)) * 100,
    y: crop.y - (movement.y / (height * zoom)) * 100,
    zoom,
  });
}
