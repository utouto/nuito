import { clampPlushIconCrop, DEFAULT_PLUSH_ICON_CROP } from "./plush-icon-crop";
import type { PlushIconCrop, PostImage } from "./types";

export function reorderPostImages(
  images: PostImage[],
  index: number,
  offset: -1 | 1,
): PostImage[] {
  return movePostImage(images, index, index + offset);
}

export function movePostImage(
  images: PostImage[],
  index: number,
  target: number,
): PostImage[] {
  const next = [...images];
  if (
    index < 0 ||
    index >= next.length ||
    target < 0 ||
    target >= next.length ||
    index === target
  )
    return images;
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next.map((image, displayOrder) => ({
    ...image,
    displayOrder,
    isCover: displayOrder === 0,
  }));
}
export function photoPinImageStyle(
  image: Pick<PostImage, "width" | "height">,
  crop: PlushIconCrop = DEFAULT_PLUSH_ICON_CROP,
) {
  const safe = clampPlushIconCrop(crop);
  const adjusted =
    safe.x !== DEFAULT_PLUSH_ICON_CROP.x ||
    safe.y !== DEFAULT_PLUSH_ICON_CROP.y ||
    safe.zoom !== DEFAULT_PLUSH_ICON_CROP.zoom;
  if (adjusted)
    return `width:100%;height:100%;object-fit:cover;object-position:${safe.x}% ${safe.y}%;transform:translate(-50%,-50%) scale(${safe.zoom});transform-origin:${safe.x}% ${safe.y}%`;
  const landscape = image.width >= image.height;
  const width = landscape ? (image.width / image.height) * 100 : 100;
  const height = landscape ? 100 : (image.height / image.width) * 100;
  return `width:${width}%;height:${height}%;object-fit:fill;transform:translate(-${safe.x}%,-${safe.y}%) scale(${safe.zoom});transform-origin:${safe.x}% ${safe.y}%`;
}
