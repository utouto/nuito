import { db } from "./db";
import type { Plush, Post, PostImage } from "./types";

type CloudPostRow = {
  id: string;
  body: string;
  time_mode: "known" | "unknown";
  occurred_local_datetime: string | null;
  manual_logical_date: string | null;
  latitude: number | null;
  longitude: number | null;
  place_name: string | null;
  place_source: "current" | "map" | "manual" | null;
  created_at: string;
  updated_at: string;
};

type CloudPlushRow = {
  id: string;
  name: string;
  theme_color: string | null;
  has_icon: number;
  icon_crop_x: number | null;
  icon_crop_y: number | null;
  icon_crop_zoom: number | null;
  hidden: number;
  created_at: string;
  updated_at: string;
};

type CloudPostPlushRow = {
  post_id: string;
  plush_id: string;
  display_order: number;
};

type CloudImageRow = {
  id: string;
  post_id: string;
  display_order: number;
  is_cover: number;
  width: number;
  height: number;
  mime_type: string;
  byte_size: number;
};

type CloudPosts = {
  posts: CloudPostRow[];
  plushes: CloudPlushRow[];
  postPlushes: CloudPostPlushRow[];
  images: CloudImageRow[];
};

const CLOUD_POST_IDS = "nuito.cloudPostIds";

function cloudPostIds() {
  try {
    const value = JSON.parse(localStorage.getItem(CLOUD_POST_IDS) ?? "[]");
    return new Set<string>(
      Array.isArray(value)
        ? value.filter((id): id is string => typeof id === "string")
        : [],
    );
  } catch {
    return new Set<string>();
  }
}

function rememberCloudPostIds(ids: Iterable<string>) {
  try {
    localStorage.setItem(CLOUD_POST_IDS, JSON.stringify([...ids]));
  } catch {
    // IndexedDBの投稿保存は継続できるため、補助的な同期管理情報の失敗は許容する。
  }
}

async function checkedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  if (response.status === 401 || response.status === 501) return undefined;
  if (!response.ok) throw new Error(`cloud_request_failed:${response.status}`);
  return response;
}

export async function saveCloudPost(post: Post, plushes: Plush[]) {
  const form = new FormData();
  const companions = post.plushIds
    .map((id) => plushes.find((plush) => plush.id === id))
    .filter((plush): plush is Plush => Boolean(plush));
  form.set(
    "metadata",
    JSON.stringify({
      ...post,
      plushes: companions.map((plush) => ({
        id: plush.id,
        name: plush.name,
        themeColor: plush.themeColor,
        hasIcon: Boolean(plush.icon),
        iconCrop: plush.iconCrop,
        hidden: plush.hidden,
        createdAt: plush.createdAt,
        updatedAt: plush.updatedAt,
      })),
      plushIds: undefined,
      images: post.images.map((image) => ({
        id: image.id,
        width: image.width,
        height: image.height,
        mimeType: image.mimeType,
        byteSize: image.byteSize,
        displayOrder: image.displayOrder,
        isCover: image.isCover,
      })),
    }),
  );
  post.images.forEach((image) => {
    form.set(`full:${image.id}`, image.full, `${image.id}-full`);
    form.set(
      `thumbnail:${image.id}`,
      image.thumbnail,
      `${image.id}-thumbnail`,
    );
  });
  companions.forEach((plush) => {
    if (plush.icon)
      form.set(`plushIcon:${plush.id}`, plush.icon, `${plush.id}-icon`);
  });
  const saved = Boolean(
    await checkedFetch(`/api/posts/${encodeURIComponent(post.id)}`, {
      method: "PUT",
      body: form,
    }),
  );
  if (saved) {
    const ids = cloudPostIds();
    ids.add(post.id);
    rememberCloudPostIds(ids);
  }
  return saved;
}

export async function deleteCloudPost(postId: string) {
  const deleted = Boolean(
    await checkedFetch(`/api/posts/${encodeURIComponent(postId)}`, {
      method: "DELETE",
    }),
  );
  if (deleted) {
    const ids = cloudPostIds();
    ids.delete(postId);
    rememberCloudPostIds(ids);
  }
  return deleted;
}

export async function deleteCloudPlush(plushId: string) {
  return Boolean(
    await checkedFetch(`/api/plushes/${encodeURIComponent(plushId)}`, {
      method: "DELETE",
    }),
  );
}

export async function deleteCloudAccount() {
  const deleted = Boolean(
    await checkedFetch("/api/account", { method: "DELETE" }),
  );
  if (deleted) rememberCloudPostIds([]);
  return deleted;
}

async function imageBlob(
  imageId: string,
  variant: "full" | "thumbnail" | "plush",
) {
  const response = await checkedFetch(
    variant === "plush"
      ? `/api/plush-icons/${encodeURIComponent(imageId)}`
      : `/api/post-images/${encodeURIComponent(imageId)}/${variant}`,
  );
  if (!response) throw new Error("cloud_session_expired");
  return response.blob();
}

export async function syncCloudPosts() {
  const response = await checkedFetch("/api/posts");
  if (!response) return false;
  const cloud = (await response.json()) as CloudPosts;
  if (
    !Array.isArray(cloud.posts) ||
    !Array.isArray(cloud.plushes) ||
    !Array.isArray(cloud.postPlushes) ||
    !Array.isArray(cloud.images)
  )
    throw new Error("invalid_cloud_response");

  const allLocalPlushes = await db.plushes.toArray();
  const localPlushes = new Map(
    allLocalPlushes.map((plush) => [plush.id, plush]),
  );
  await db.plushes.bulkPut(
    await Promise.all(
      cloud.plushes.map(async (row) => ({
        ...localPlushes.get(row.id),
        id: row.id,
        name: row.name,
        icon: row.has_icon ? await imageBlob(row.id, "plush") : undefined,
        iconCrop:
          row.icon_crop_x !== null &&
          row.icon_crop_y !== null &&
          row.icon_crop_zoom !== null
            ? {
                x: row.icon_crop_x,
                y: row.icon_crop_y,
                zoom: row.icon_crop_zoom,
              }
            : undefined,
        themeColor: row.theme_color ?? undefined,
        hidden: Boolean(row.hidden),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    ),
  );

  const allLocalPosts = await db.posts.toArray();
  const localPosts = new Map(allLocalPosts.map((post) => [post.id, post]));
  const remoteIds = new Set(cloud.posts.map((post) => post.id));
  const previouslyCloud = cloudPostIds();
  const removedRemotely = [...previouslyCloud].filter(
    (id) => !remoteIds.has(id),
  );
  if (removedRemotely.length) await db.posts.bulkDelete(removedRemotely);
  const localOnly = allLocalPosts.filter(
    (post) => !remoteIds.has(post.id) && !previouslyCloud.has(post.id),
  );
  for (const post of localOnly) await saveCloudPost(post, allLocalPlushes);
  const posts = await Promise.all(
    cloud.posts.map(async (row): Promise<Post> => {
      const imageRows = cloud.images
        .filter((image) => image.post_id === row.id)
        .sort((a, b) => a.display_order - b.display_order);
      const local = localPosts.get(row.id);
      const images: PostImage[] =
        local?.updatedAt === row.updated_at &&
        local.images.length === imageRows.length
          ? local.images
          : await Promise.all(
              imageRows.map(async (image) => ({
                id: image.id,
                full: await imageBlob(image.id, "full"),
                thumbnail: await imageBlob(image.id, "thumbnail"),
                width: image.width,
                height: image.height,
                mimeType: image.mime_type,
                byteSize: image.byte_size,
                displayOrder: image.display_order,
                isCover: Boolean(image.is_cover),
              })),
            );
      return {
        id: row.id,
        body: row.body,
        plushIds: cloud.postPlushes
          .filter((link) => link.post_id === row.id)
          .sort((a, b) => a.display_order - b.display_order)
          .map((link) => link.plush_id),
        images,
        timeMode: row.time_mode,
        occurredLocalDateTime: row.occurred_local_datetime ?? undefined,
        manualLogicalDate: row.manual_logical_date ?? undefined,
        place:
          row.latitude !== null &&
          row.longitude !== null &&
          row.place_source !== null
            ? {
                latitude: row.latitude,
                longitude: row.longitude,
                name: row.place_name ?? "",
                source: row.place_source,
              }
            : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }),
  );
  await db.posts.bulkPut(posts);
  rememberCloudPostIds([
    ...remoteIds,
    ...localOnly.map((post) => post.id),
  ]);
  return true;
}
