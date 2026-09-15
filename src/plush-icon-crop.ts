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
