import type { PostImage } from "./types";

export function reorderPostImages(
  images: PostImage[],
  index: number,
  offset: -1 | 1,
): PostImage[] {
  const next = [...images];
  const target = index + offset;
  if (target < 0 || target >= next.length) return images;
  [next[index], next[target]] = [next[target], next[index]];
  return next.map((image, displayOrder) => ({
    ...image,
    displayOrder,
    isCover: displayOrder === 0,
  }));
}
