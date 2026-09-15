/// <reference types="@cloudflare/workers-types" />

export interface PostsEnv {
  DB: D1Database;
  IMAGES: R2Bucket;
}

type ImageInput = {
  id: string;
  width: number;
  height: number;
  mimeType: string;
  byteSize: number;
  displayOrder: number;
  isCover: boolean;
};

type PlushInput = {
  id: string;
  name: string;
  themeColor?: string;
  hasIcon: boolean;
  iconCrop?: { x: number; y: number; zoom: number };
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
};

type PostInput = {
  id: string;
  body: string;
  plushes: PlushInput[];
  images: ImageInput[];
  timeMode: "known" | "unknown";
  occurredLocalDateTime?: string;
  manualLogicalDate?: string;
  place?: {
    latitude: number;
    longitude: number;
    name: string;
    source: "current" | "map" | "manual";
  };
  createdAt: string;
  updatedAt: string;
};

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const MAX_FULL_BYTES = 12 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;
const MAX_PLUSH_ICON_BYTES = 5 * 1024 * 1024;
const THEME_COLOR = /^(transparent|#[0-9A-Fa-f]{6})$/;

const response = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function validDate(value: string) {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validLocalDateTime(value: string) {
  return LOCAL_DATE_TIME.test(value) && !Number.isNaN(Date.parse(value));
}

function validPost(value: unknown): value is PostInput {
  if (!value || typeof value !== "object") return false;
  const post = value as Partial<PostInput>;
  if (
    typeof post.id !== "string" ||
    !ID.test(post.id) ||
    typeof post.body !== "string" ||
    post.body.length > 300 ||
    !Array.isArray(post.plushes) ||
    !Array.isArray(post.images) ||
    post.images.length > 4 ||
    (!post.body.trim() && post.images.length === 0 && !post.place) ||
    !validTimestamp(post.createdAt) ||
    !validTimestamp(post.updatedAt)
  )
    return false;
  if (
    post.timeMode === "known"
      ? !post.occurredLocalDateTime ||
        !validLocalDateTime(post.occurredLocalDateTime) ||
        post.manualLogicalDate !== undefined
      : post.timeMode !== "unknown" ||
        !post.manualLogicalDate ||
        !validDate(post.manualLogicalDate) ||
        post.occurredLocalDateTime !== undefined
  )
    return false;
  if (
    post.place &&
    (!Number.isFinite(post.place.latitude) ||
      post.place.latitude < -90 ||
      post.place.latitude > 90 ||
      !Number.isFinite(post.place.longitude) ||
      post.place.longitude < -180 ||
      post.place.longitude > 180 ||
      typeof post.place.name !== "string" ||
      post.place.name.length > 200 ||
      !["current", "map", "manual"].includes(post.place.source))
  )
    return false;
  const plushIds = post.plushes.map((plush) => plush?.id);
  if (
    new Set(plushIds).size !== plushIds.length ||
    post.plushes.some(
      (plush) =>
        !plush ||
        typeof plush.id !== "string" ||
        !ID.test(plush.id) ||
        typeof plush.name !== "string" ||
        plush.name.length < 1 ||
        plush.name.length > 60 ||
        (plush.themeColor !== undefined &&
          !THEME_COLOR.test(plush.themeColor)) ||
        typeof plush.hidden !== "boolean" ||
        typeof plush.hasIcon !== "boolean" ||
        (plush.iconCrop !== undefined &&
          (!Number.isFinite(plush.iconCrop.x) ||
            !Number.isFinite(plush.iconCrop.y) ||
            !Number.isFinite(plush.iconCrop.zoom) ||
            plush.iconCrop.zoom < 1 ||
            plush.iconCrop.zoom > 4)) ||
        !validTimestamp(plush.createdAt) ||
        !validTimestamp(plush.updatedAt),
    )
  )
    return false;
  const imageIds = new Set<string>();
  return post.images.every((image, index) => {
    if (
      !image ||
      typeof image.id !== "string" ||
      !ID.test(image.id) ||
      imageIds.has(image.id) ||
      !Number.isInteger(image.width) ||
      image.width < 1 ||
      !Number.isInteger(image.height) ||
      image.height < 1 ||
      typeof image.mimeType !== "string" ||
      !image.mimeType.startsWith("image/") ||
      !Number.isInteger(image.byteSize) ||
      image.byteSize < 1 ||
      image.displayOrder !== index ||
      typeof image.isCover !== "boolean"
    )
      return false;
    imageIds.add(image.id);
    return true;
  });
}

const objectKeys = (
  userId: string,
  postId: string,
  imageId: string,
  version: string,
) => {
  const safeVersion = version.replace(/[^0-9A-Za-z]/g, "");
  return {
    full: `${userId}/posts/${postId}/${imageId}/${safeVersion}/full`,
    thumbnail: `${userId}/posts/${postId}/${imageId}/${safeVersion}/thumbnail`,
  };
};

const plushIconKey = (userId: string, plushId: string, version: string) =>
  `${userId}/plushes/${plushId}/${version.replace(/[^0-9A-Za-z]/g, "")}/icon`;

async function savePost(
  request: Request,
  env: PostsEnv,
  userId: string,
  postId: string,
) {
  if (!ID.test(postId)) return response({ error: "invalid_request" }, 400);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return response({ error: "invalid_request" }, 400);
  }
  let input: unknown;
  try {
    const metadata = form.get("metadata");
    input = JSON.parse(typeof metadata === "string" ? metadata : "");
  } catch {
    return response({ error: "invalid_request" }, 400);
  }
  if (!validPost(input) || input.id !== postId)
    return response({ error: "invalid_request" }, 400);
  const existing = await env.DB.prepare("SELECT user_id FROM posts WHERE id=?")
    .bind(postId)
    .first<{ user_id: string }>();
  if (existing && existing.user_id !== userId)
    return response({ error: "not_found" }, 404);
  for (const plush of input.plushes) {
    const owner = await env.DB.prepare("SELECT user_id FROM plushes WHERE id=?")
      .bind(plush.id)
      .first<{ user_id: string }>();
    if (owner && owner.user_id !== userId)
      return response({ error: "not_found" }, 404);
  }
  for (const image of input.images) {
    const owner = await env.DB.prepare(
      "SELECT p.user_id FROM post_images pi JOIN posts p ON p.id=pi.post_id WHERE pi.id=?",
    )
      .bind(image.id)
      .first<{ user_id: string }>();
    if (owner && owner.user_id !== userId)
      return response({ error: "not_found" }, 404);
  }

  const files = input.images.map((image) => ({
    image,
    full: form.get(`full:${image.id}`),
    thumbnail: form.get(`thumbnail:${image.id}`),
  }));
  if (
    files.some(
      ({ image, full, thumbnail }) =>
        !(full instanceof File) ||
        !(thumbnail instanceof File) ||
        !full.type.startsWith("image/") ||
        !thumbnail.type.startsWith("image/") ||
        full.size < 1 ||
        full.size > MAX_FULL_BYTES ||
        thumbnail.size < 1 ||
        thumbnail.size > MAX_THUMBNAIL_BYTES ||
        full.type !== image.mimeType ||
        full.size !== image.byteSize,
    )
  )
    return response({ error: "invalid_image" }, 400);
  const validatedFiles = files as Array<{
    image: ImageInput;
    full: File;
    thumbnail: File;
  }>;
  const plushIconFiles = input.plushes.map((plush) => ({
    plush,
    icon: form.get(`plushIcon:${plush.id}`),
  }));
  if (
    plushIconFiles.some(
      ({ plush, icon }) =>
        plush.hasIcon !== (icon instanceof File) ||
        (icon instanceof File &&
          (!icon.type.startsWith("image/") ||
            icon.size < 1 ||
            icon.size > MAX_PLUSH_ICON_BYTES)),
    )
  )
    return response({ error: "invalid_image" }, 400);

  const uploaded: string[] = [];
  try {
    for (const { image, full, thumbnail } of validatedFiles) {
      const keys = objectKeys(userId, postId, image.id, input.updatedAt);
      await env.IMAGES.put(keys.full, full.stream(), {
        httpMetadata: { contentType: full.type },
      });
      uploaded.push(keys.full);
      await env.IMAGES.put(keys.thumbnail, thumbnail.stream(), {
        httpMetadata: { contentType: thumbnail.type },
      });
      uploaded.push(keys.thumbnail);
    }
    for (const { plush, icon } of plushIconFiles) {
      if (!(icon instanceof File)) continue;
      const key = plushIconKey(userId, plush.id, plush.updatedAt);
      await env.IMAGES.put(key, icon.stream(), {
        httpMetadata: { contentType: icon.type },
      });
      uploaded.push(key);
    }

    const previous = await env.DB.prepare(
      "SELECT full_object_key,thumbnail_object_key FROM post_images WHERE post_id=?",
    )
      .bind(postId)
      .all<{ full_object_key: string; thumbnail_object_key: string }>();
    const previousPlushIcons = await Promise.all(
      input.plushes.map((plush) =>
        env.DB.prepare(
          "SELECT icon_object_key FROM plushes WHERE id=? AND user_id=?",
        )
          .bind(plush.id, userId)
          .first<{ icon_object_key: string | null }>(),
      ),
    );
    const statements: D1PreparedStatement[] = [
      env.DB.prepare(
        `INSERT INTO posts(id,user_id,body,time_mode,occurred_local_datetime,manual_logical_date,latitude,longitude,place_name,place_source,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET body=excluded.body,time_mode=excluded.time_mode,occurred_local_datetime=excluded.occurred_local_datetime,manual_logical_date=excluded.manual_logical_date,latitude=excluded.latitude,longitude=excluded.longitude,place_name=excluded.place_name,place_source=excluded.place_source,updated_at=excluded.updated_at
         WHERE posts.user_id=excluded.user_id`,
      ).bind(
        input.id,
        userId,
        input.body,
        input.timeMode,
        input.occurredLocalDateTime ?? null,
        input.manualLogicalDate ?? null,
        input.place?.latitude ?? null,
        input.place?.longitude ?? null,
        input.place?.name ?? null,
        input.place?.source ?? null,
        input.createdAt,
        input.updatedAt,
      ),
      env.DB.prepare("DELETE FROM post_plushes WHERE post_id=?").bind(postId),
      env.DB.prepare("DELETE FROM post_images WHERE post_id=?").bind(postId),
    ];
    input.plushes.forEach((plush, index) => {
      statements.push(
        env.DB.prepare(
          `INSERT INTO plushes(id,user_id,name,icon_object_key,theme_color,icon_crop_x,icon_crop_y,icon_crop_zoom,hidden,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET name=excluded.name,icon_object_key=excluded.icon_object_key,theme_color=excluded.theme_color,icon_crop_x=excluded.icon_crop_x,icon_crop_y=excluded.icon_crop_y,icon_crop_zoom=excluded.icon_crop_zoom,hidden=excluded.hidden,updated_at=excluded.updated_at
           WHERE plushes.user_id=excluded.user_id`,
        ).bind(
          plush.id,
          userId,
          plush.name,
          plush.hasIcon
            ? plushIconKey(userId, plush.id, plush.updatedAt)
            : null,
          plush.themeColor ?? null,
          plush.iconCrop?.x ?? null,
          plush.iconCrop?.y ?? null,
          plush.iconCrop?.zoom ?? null,
          plush.hidden ? 1 : 0,
          plush.createdAt,
          plush.updatedAt,
        ),
        env.DB.prepare(
          "INSERT INTO post_plushes(post_id,plush_id,display_order) VALUES(?,?,?)",
        ).bind(postId, plush.id, index),
      );
    });
    input.images.forEach((image) => {
      const keys = objectKeys(userId, postId, image.id, input.updatedAt);
      statements.push(
        env.DB.prepare(
          "INSERT INTO post_images(id,post_id,full_object_key,thumbnail_object_key,display_order,is_cover,width,height,mime_type,byte_size,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        ).bind(
          image.id,
          postId,
          keys.full,
          keys.thumbnail,
          image.displayOrder,
          image.isCover ? 1 : 0,
          image.width,
          image.height,
          image.mimeType,
          image.byteSize,
          input.createdAt,
        ),
      );
    });
    await env.DB.batch(statements);
    const retained = new Set(uploaded);
    await Promise.all(
      [
        ...previous.results.flatMap((image) => [
          image.full_object_key,
          image.thumbnail_object_key,
        ]),
        ...previousPlushIcons.flatMap((plush) =>
          plush?.icon_object_key ? [plush.icon_object_key] : [],
        ),
      ]
        .filter((key) => !retained.has(key))
        .map((key) => env.IMAGES.delete(key)),
    );
    return response({ ok: true });
  } catch {
    await Promise.all(uploaded.map((key) => env.IMAGES.delete(key)));
    return response({ error: "save_failed" }, 503);
  }
}

async function listPosts(env: PostsEnv, userId: string) {
  const [posts, plushes, links, images] = await Promise.all([
    env.DB.prepare("SELECT * FROM posts WHERE user_id=? ORDER BY created_at")
      .bind(userId)
      .all<Record<string, unknown>>(),
    env.DB.prepare(
      "SELECT id,name,icon_object_key IS NOT NULL AS has_icon,theme_color,icon_crop_x,icon_crop_y,icon_crop_zoom,hidden,created_at,updated_at FROM plushes WHERE user_id=?",
    )
      .bind(userId)
      .all<Record<string, unknown>>(),
    env.DB.prepare(
      "SELECT pp.post_id,pp.plush_id,pp.display_order FROM post_plushes pp JOIN posts p ON p.id=pp.post_id WHERE p.user_id=? ORDER BY pp.display_order",
    )
      .bind(userId)
      .all<Record<string, unknown>>(),
    env.DB.prepare(
      "SELECT pi.id,pi.post_id,pi.display_order,pi.is_cover,pi.width,pi.height,pi.mime_type,pi.byte_size FROM post_images pi JOIN posts p ON p.id=pi.post_id WHERE p.user_id=? ORDER BY pi.display_order",
    )
      .bind(userId)
      .all<Record<string, unknown>>(),
  ]);
  return response({
    posts: posts.results,
    plushes: plushes.results,
    postPlushes: links.results,
    images: images.results,
  });
}

async function imageResponse(
  env: PostsEnv,
  userId: string,
  imageId: string,
  variant: "full" | "thumbnail",
) {
  if (!ID.test(imageId)) return response({ error: "not_found" }, 404);
  const image = await env.DB.prepare(
    `SELECT pi.full_object_key,pi.thumbnail_object_key FROM post_images pi
     JOIN posts p ON p.id=pi.post_id WHERE pi.id=? AND p.user_id=?`,
  )
    .bind(imageId, userId)
    .first<{ full_object_key: string; thumbnail_object_key: string }>();
  if (!image) return response({ error: "not_found" }, 404);
  const object = await env.IMAGES.get(
    variant === "full" ? image.full_object_key : image.thumbnail_object_key,
  );
  if (!object) return response({ error: "not_found" }, 404);
  const headers = new Headers({
    "cache-control": "private, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
  });
  object.writeHttpMetadata(headers);
  return new Response(object.body, { headers });
}

async function plushIconResponse(
  env: PostsEnv,
  userId: string,
  plushId: string,
) {
  if (!ID.test(plushId)) return response({ error: "not_found" }, 404);
  const plush = await env.DB.prepare(
    "SELECT icon_object_key FROM plushes WHERE id=? AND user_id=?",
  )
    .bind(plushId, userId)
    .first<{ icon_object_key: string | null }>();
  if (!plush?.icon_object_key) return response({ error: "not_found" }, 404);
  const object = await env.IMAGES.get(plush.icon_object_key);
  if (!object) return response({ error: "not_found" }, 404);
  const headers = new Headers({
    "cache-control": "private, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
  });
  object.writeHttpMetadata(headers);
  return new Response(object.body, { headers });
}

async function deletePost(env: PostsEnv, userId: string, postId: string) {
  if (!ID.test(postId)) return response({ error: "not_found" }, 404);
  const images = await env.DB.prepare(
    "SELECT pi.full_object_key,pi.thumbnail_object_key FROM post_images pi JOIN posts p ON p.id=pi.post_id WHERE p.id=? AND p.user_id=?",
  )
    .bind(postId, userId)
    .all<{ full_object_key: string; thumbnail_object_key: string }>();
  const result = await env.DB.prepare("DELETE FROM posts WHERE id=? AND user_id=?")
    .bind(postId, userId)
    .run();
  if (!result.meta.changes) return response({ error: "not_found" }, 404);
  await Promise.all(
    images.results.flatMap((image) => [
      env.IMAGES.delete(image.full_object_key),
      env.IMAGES.delete(image.thumbnail_object_key),
    ]),
  );
  return response({ ok: true });
}

async function deletePlush(env: PostsEnv, userId: string, plushId: string) {
  if (!ID.test(plushId)) return response({ error: "not_found" }, 404);
  const plush = await env.DB.prepare(
    "SELECT icon_object_key FROM plushes WHERE id=? AND user_id=?",
  )
    .bind(plushId, userId)
    .first<{ icon_object_key: string | null }>();
  if (!plush) return response({ ok: true });
  await env.DB.batch([
    env.DB.prepare("DELETE FROM post_plushes WHERE plush_id=?").bind(plushId),
    env.DB.prepare("DELETE FROM plushes WHERE id=? AND user_id=?").bind(
      plushId,
      userId,
    ),
  ]);
  let cleanupPending = false;
  if (plush.icon_object_key) {
    try {
      await env.IMAGES.delete(plush.icon_object_key);
    } catch {
      cleanupPending = true;
    }
  }
  return response({ ok: true, cleanupPending });
}

async function savePlush(
  request: Request,
  env: PostsEnv,
  userId: string,
  plushId: string,
) {
  if (!ID.test(plushId)) return response({ error: "invalid_request" }, 400);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return response({ error: "invalid_request" }, 400);
  }
  let plush: PlushInput;
  try {
    plush = JSON.parse(String(form.get("metadata"))) as PlushInput;
  } catch {
    return response({ error: "invalid_request" }, 400);
  }
  if (
    plush.id !== plushId ||
    typeof plush.name !== "string" ||
    plush.name.length < 1 ||
    plush.name.length > 60 ||
    typeof plush.hasIcon !== "boolean" ||
    typeof plush.hidden !== "boolean" ||
    (plush.themeColor !== undefined && !THEME_COLOR.test(plush.themeColor)) ||
    (plush.iconCrop !== undefined &&
      (!Number.isFinite(plush.iconCrop.x) ||
        !Number.isFinite(plush.iconCrop.y) ||
        !Number.isFinite(plush.iconCrop.zoom) ||
        plush.iconCrop.zoom < 1 ||
        plush.iconCrop.zoom > 4)) ||
    !validTimestamp(plush.createdAt) ||
    !validTimestamp(plush.updatedAt)
  )
    return response({ error: "invalid_request" }, 400);
  const existing = await env.DB.prepare(
    "SELECT user_id,icon_object_key FROM plushes WHERE id=?",
  )
    .bind(plushId)
    .first<{ user_id: string; icon_object_key: string | null }>();
  if (existing && existing.user_id !== userId)
    return response({ error: "not_found" }, 404);
  const icon = form.get("icon");
  if (
    plush.hasIcon !== (icon instanceof File) ||
    (icon instanceof File &&
      (!icon.type.startsWith("image/") ||
        icon.size < 1 ||
        icon.size > MAX_PLUSH_ICON_BYTES))
  )
    return response({ error: "invalid_image" }, 400);
  const key = plush.hasIcon
    ? plushIconKey(userId, plushId, plush.updatedAt)
    : null;
  try {
    if (icon instanceof File && key)
      await env.IMAGES.put(key, icon.stream(), {
        httpMetadata: { contentType: icon.type },
      });
    await env.DB.prepare(
      `INSERT INTO plushes(id,user_id,name,icon_object_key,theme_color,icon_crop_x,icon_crop_y,icon_crop_zoom,hidden,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,icon_object_key=excluded.icon_object_key,theme_color=excluded.theme_color,icon_crop_x=excluded.icon_crop_x,icon_crop_y=excluded.icon_crop_y,icon_crop_zoom=excluded.icon_crop_zoom,hidden=excluded.hidden,updated_at=excluded.updated_at WHERE plushes.user_id=excluded.user_id`,
    )
      .bind(plush.id, userId, plush.name, key, plush.themeColor ?? null, plush.iconCrop?.x ?? null, plush.iconCrop?.y ?? null, plush.iconCrop?.zoom ?? null, plush.hidden ? 1 : 0, plush.createdAt, plush.updatedAt)
      .run();
    if (existing?.icon_object_key && existing.icon_object_key !== key)
      await env.IMAGES.delete(existing.icon_object_key);
    return response({ ok: true });
  } catch {
    if (key) await env.IMAGES.delete(key).catch(() => undefined);
    return response({ error: "save_failed" }, 503);
  }
}

export async function handlePosts(
  request: Request,
  env: PostsEnv,
  userId: string,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/posts" && request.method === "GET")
    return listPosts(env, userId);
  const postMatch = url.pathname.match(/^\/api\/posts\/([^/]+)$/);
  if (postMatch && request.method === "PUT")
    return savePost(request, env, userId, postMatch[1]);
  if (postMatch && request.method === "DELETE")
    return deletePost(env, userId, postMatch[1]);
  const plushMatch = url.pathname.match(/^\/api\/plushes\/([^/]+)$/);
  if (plushMatch && request.method === "PUT")
    return savePlush(request, env, userId, plushMatch[1]);
  if (plushMatch && request.method === "DELETE")
    return deletePlush(env, userId, plushMatch[1]);
  const imageMatch = url.pathname.match(
    /^\/api\/post-images\/([^/]+)\/(full|thumbnail)$/,
  );
  if (imageMatch && request.method === "GET")
    return imageResponse(
      env,
      userId,
      imageMatch[1],
      imageMatch[2] as "full" | "thumbnail",
    );
  const plushIconMatch = url.pathname.match(/^\/api\/plush-icons\/([^/]+)$/);
  if (plushIconMatch && request.method === "GET")
    return plushIconResponse(env, userId, plushIconMatch[1]);
  return response({ error: "not_found" }, 404);
}
