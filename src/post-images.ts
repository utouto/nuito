import type { PostImage } from "./types";

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
