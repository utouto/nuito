import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import L from "leaflet";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import BookRoundedIcon from "@mui/icons-material/BookRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import MyLocationRoundedIcon from "@mui/icons-material/MyLocationRounded";
import PetsRoundedIcon from "@mui/icons-material/PetsRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import TodayRoundedIcon from "@mui/icons-material/TodayRounded";
import { db, deleteAllData, getSettings } from "./db";
import {
  effectiveLogicalDate,
  formatDate,
  localDateTime,
  shouldPromptJournal,
  sortPosts,
  todayLogicalDate,
} from "./domain";
import { optimizeImage, optimizePlushIcon } from "./image";
import { LegalPage, type LegalKind } from "./legal";
import {
  DEFAULT_PLUSH_THEME_COLOR,
  PlushIcon,
  PlushIconEditor,
} from "./plush-icon";
import { DEFAULT_PLUSH_ICON_CROP } from "./plush-icon-crop";
import type { Journal, Place, Plush, Post, PostImage, Settings } from "./types";
type View =
  | "today"
  | "history"
  | "plushes"
  | "settings"
  | "editor"
  | "journal"
  | LegalKind;
const tileUrl = import.meta.env.VITE_MAP_TILE_URL as string;
const attribution = import.meta.env.VITE_MAP_ATTRIBUTION as string;
const geolocationOptions: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
};
const defaultPlaceName = "ここで遊んだよ";
const emptyPosts: Post[] = [];

function placeFromPosition(position: GeolocationPosition): Place {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    name: defaultPlaceName,
    source: "current",
  };
}

function postMarkerBackground(post: Post, plushes: Plush[]): string {
  const colors = post.plushIds
    .map((id) => plushes.find((plush) => plush.id === id)?.themeColor)
    .filter((color): color is string =>
      Boolean(color && /^#[0-9a-f]{6}$/i.test(color)),
    );
  if (!colors.length) return "#687076";
  if (colors.length === 1) return colors[0];
  return `linear-gradient(135deg, ${colors.join(", ")})`;
}

function curvedRoute(points: L.LatLngTuple[]): L.LatLngTuple[] {
  if (points.length < 2) return points;
  const curved: L.LatLngTuple[] = [points[0]];
  points.slice(1).forEach((end, index) => {
    const start = points[index];
    const latitudeDelta = end[0] - start[0];
    const longitudeDelta = end[1] - start[1];
    const bend = 0.12 * (index % 2 ? -1 : 1);
    const control: L.LatLngTuple = [
      (start[0] + end[0]) / 2 - longitudeDelta * bend,
      (start[1] + end[1]) / 2 + latitudeDelta * bend,
    ];
    for (let step = 1; step <= 8; step += 1) {
      const t = step / 8;
      const inverse = 1 - t;
      curved.push([
        inverse * inverse * start[0] +
          2 * inverse * t * control[0] +
          t * t * end[0],
        inverse * inverse * start[1] +
          2 * inverse * t * control[1] +
          t * t * end[1],
      ]);
    }
  });
  return curved;
}

function BlobImage({
  blob,
  alt,
  className,
}: {
  blob: Blob;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return <img src={url} alt={alt} className={className} />;
}
function ImageLightbox({
  image,
  imageNumber,
  onClose,
  returnFocusTo,
}: {
  image: PostImage;
  imageNumber: number;
  onClose: () => void;
  returnFocusTo: HTMLElement | null;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        event.preventDefault();
        closeButton.current?.focus();
      }
    };
    document.addEventListener("keydown", keyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keyDown);
      returnFocusTo?.focus();
    };
  }, [onClose, returnFocusTo]);
  return (
    <div
      className="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`投稿写真 ${imageNumber}の拡大表示`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button
        ref={closeButton}
        type="button"
        className="lightbox-close"
        onClick={onClose}
        aria-label="拡大表示を閉じる"
      >
        <CloseRoundedIcon aria-hidden="true" />
      </button>
      <BlobImage
        blob={image.full}
        alt={`拡大した投稿写真 ${imageNumber}`}
        className="lightbox-image"
      />
    </div>
  );
}
export function DayMap({
  posts,
  plushes = [],
  pick,
  onPick,
  control,
  className,
  centerOnCurrentWhenEmpty = false,
}: {
  posts: Post[];
  plushes?: Plush[];
  pick?: Place;
  onPick?: (p: Place) => void;
  control?: ReactNode;
  className?: string;
  centerOnCurrentWhenEmpty?: boolean;
}) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!element.current) return;
    const located = posts.filter((p) => p.place);
    const all = [
      ...located.map(
        (p) => [p.place!.latitude, p.place!.longitude] as L.LatLngTuple,
      ),
      ...(pick ? [[pick.latitude, pick.longitude] as L.LatLngTuple] : []),
    ];
    const map = L.map(element.current, { scrollWheelZoom: false }).setView(
      all[0] ?? [35.6812, 139.7671],
      all.length ? 13 : 5,
    );
    if (className === "today-map") {
      map.attributionControl.setPosition("topright");
      map.zoomControl.setPosition("topright");
    }
    let active = true;
    if (
      centerOnCurrentWhenEmpty &&
      !all.length &&
      navigator.geolocation &&
      navigator.permissions
    ) {
      void navigator.permissions
        .query({ name: "geolocation" })
        .then((permission) => {
          if (!active || permission.state !== "granted") return;
          navigator.geolocation.getCurrentPosition(
            (position) => {
              if (active)
                map.setView(
                  [position.coords.latitude, position.coords.longitude],
                  13,
                );
            },
            () => undefined,
            geolocationOptions,
          );
        })
        .catch(() => undefined);
    }
    if (tileUrl && navigator.onLine)
      L.tileLayer(tileUrl, { attribution }).addTo(map);
    const route = sortPosts(located.filter((p) => p.timeMode === "known")).map(
      (p) => [p.place!.latitude, p.place!.longitude] as L.LatLngTuple,
    );
    if (route.length > 1)
      L.polyline(curvedRoute(route), {
        dashArray: "7 10",
        color: "#8b5e3c",
        weight: 4,
      }).addTo(map);
    located.forEach((p) => {
      const background = postMarkerBackground(p, plushes);
      L.marker([p.place!.latitude, p.place!.longitude], {
        icon: L.divIcon({
          className: "post-map-marker",
          html: `<span style="background:${background}"><i style="background:${background}"></i></span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      })
        .bindTooltip(p.place!.name || "記録した場所")
        .addTo(map);
    });
    if (pick) {
      const pin = L.marker([pick.latitude, pick.longitude], {
        draggable: Boolean(onPick),
        title: onPick ? "選択中の場所。ドラッグして移動" : "選択中の場所",
        alt: "選択中の場所",
      }).addTo(map);
      if (onPick)
        pin.on("dragend", () => {
          const position = pin.getLatLng();
          onPick({
            ...pick,
            latitude: position.lat,
            longitude: position.lng,
            source: "map",
          });
        });
    }
    if (all.length > 1)
      map.fitBounds(L.latLngBounds(all), { padding: [24, 24], maxZoom: 15 });
    if (onPick)
      map.on("click", (e) =>
        onPick({
          latitude: e.latlng.lat,
          longitude: e.latlng.lng,
          name: defaultPlaceName,
          source: "map",
        }),
      );
    return () => {
      active = false;
      map.remove();
    };
  }, [posts, plushes, pick, onPick, className, centerOnCurrentWhenEmpty]);
  return (
    <div className={className ? `map-wrap ${className}` : "map-wrap"}>
      <div className="map-stage">
        <div
          ref={element}
          className="map"
          aria-label={onPick ? "場所を選択する地図" : "日別地図"}
        />
        {control ? <div className="map-control">{control}</div> : null}
      </div>
      {!navigator.onLine ? (
        <p className="map-note">
          オフラインのため背景地図を表示できません。記録済み地点のみ表示します。
        </p>
      ) : null}
      <p className="map-note">
        点線は実際の移動経路ではなく、思い出の順番です。
      </p>
    </div>
  );
}
export function PostCard({
  post,
  plushes,
  onEdit,
}: {
  post: Post;
  plushes: Plush[];
  onEdit: () => void;
}) {
  const [expandedImage, setExpandedImage] = useState<{
    image: PostImage;
    imageNumber: number;
  }>();
  const imageTrigger = useRef<HTMLButtonElement>(null);
  const closeExpandedImage = () => setExpandedImage(undefined);
  const companions = post.plushIds
    .map((id) => plushes.find((p) => p.id === id))
    .filter((plush): plush is Plush => Boolean(plush));
  return (
    <article className="post-card">
      <button className="card-action" onClick={onEdit} aria-label="投稿を編集">
        編集
      </button>
      <p className="post-time">
        {post.timeMode === "known"
          ? post.occurredLocalDateTime!.slice(11, 16)
          : "時間不明"}
        {post.place ? ` · ${post.place.name || "場所あり"}` : ""}
      </p>
      {post.images.length ? (
        <div className="photos">
          {post.images.map((image, i) => (
            <button
              key={image.id}
              type="button"
              className="photo-expand"
              aria-label={`投稿写真 ${i + 1}を拡大`}
              onClick={(event) => {
                imageTrigger.current = event.currentTarget;
                setExpandedImage({ image, imageNumber: i + 1 });
              }}
            >
              <BlobImage blob={image.thumbnail} alt={`投稿写真 ${i + 1}`} />
            </button>
          ))}
        </div>
      ) : null}
      {post.body ? <p className="post-body">{post.body}</p> : null}
      {companions.length ? (
        <div
          className="with"
          aria-label={`${companions.map((plush) => plush.name).join("、")}といっしょ`}
        >
          <span className="companion-icons" aria-hidden="true">
            {companions.map((plush) =>
              plush.icon ? (
                <PlushIcon
                  key={plush.id}
                  blob={plush.icon}
                  crop={plush.iconCrop}
                  alt=""
                  className="companion-icon"
                  themeColor={plush.themeColor}
                />
              ) : (
                <span
                  key={plush.id}
                  className="companion-icon fallback-icon"
                  style={{
                    borderColor: plush.themeColor ?? DEFAULT_PLUSH_THEME_COLOR,
                  }}
                >
                  ぬ
                </span>
              ),
            )}
          </span>
          <span aria-hidden="true">といっしょ</span>
        </div>
      ) : null}
      {expandedImage ? (
        <ImageLightbox
          image={expandedImage.image}
          imageNumber={expandedImage.imageNumber}
          onClose={closeExpandedImage}
          returnFocusTo={imageTrigger.current}
        />
      ) : null}
    </article>
  );
}
export default function App() {
  const settings = useLiveQuery(() => getSettings(), []);
  const posts = useLiveQuery(() => db.posts.toArray(), []) ?? emptyPosts;
  const plushes = useLiveQuery(() => db.plushes.toArray(), []) ?? [];
  const journals = useLiveQuery(() => db.journals.toArray(), []) ?? [];
  const [view, setView] = useState<View>(() => {
    if (location.pathname === "/privacy") return "privacy";
    if (location.pathname === "/terms") return "terms";
    return "today";
  });
  const [selectedDate, setSelectedDate] = useState("");
  const [editing, setEditing] = useState<Post>();
  const [todayDrawerOpen, setTodayDrawerOpen] = useState(false);
  const today = settings ? todayLogicalDate(settings.dayBoundaryTime) : "";
  const date = selectedDate || today;
  const dayPosts = useMemo(
    () =>
      settings
        ? sortPosts(
            posts.filter(
              (post) =>
                effectiveLogicalDate(post, settings.dayBoundaryTime) === date,
            ),
          )
        : [],
    [date, posts, settings],
  );
  if (!settings)
    return (
      <main>
        <p>読み込み中…</p>
      </main>
    );
  const openLegal = (kind: LegalKind) => {
    history.pushState({}, "", `/${kind}`);
    setView(kind);
    window.scrollTo(0, 0);
  };
  const closeLegal = () => {
    history.pushState({}, "", "/");
    setView("today");
    window.scrollTo(0, 0);
  };
  if (view === "privacy" || view === "terms") {
    return (
      <main>
        <LegalPage kind={view} onBack={closeLegal} />
      </main>
    );
  }
  if (!settings.started)
    return <Onboarding settings={settings} onLegal={openLegal} />;
  const openEditor = (post?: Post) => {
    setEditing(post);
    setView("editor");
  };
  const openJournal = (d: string) => {
    setSelectedDate(d);
    setView("journal");
  };
  return (
    <div className="app">
      <header>
        <div>
          <span className="brand-mark">ぬ</span>
          <strong>ぬいと</strong>
        </div>
        {import.meta.env.MODE !== "production" && (
          <span className="env">{import.meta.env.VITE_APP_ENV}</span>
        )}
      </header>
      <main className={view === "today" ? "today-main" : undefined}>
        {view === "today" ? (
          <Today
            date={today}
            posts={dayPosts}
            plushes={plushes}
            journal={journals.find((j) => j.logicalDate === today)}
            settings={settings}
            onNew={openEditor}
            onJournal={() => openJournal(today)}
            onDrawerOpenChange={setTodayDrawerOpen}
          />
        ) : null}
        {view === "history" ? (
          <History
            posts={posts}
            journals={journals}
            settings={settings}
            onOpen={openJournal}
          />
        ) : null}
        {view === "plushes" ? <Plushes plushes={plushes} /> : null}
        {view === "settings" ? (
          <SettingsView settings={settings} onLegal={openLegal} />
        ) : null}
        {view === "editor" ? (
          <PostEditor
            key={editing?.id ?? "new"}
            post={editing}
            plushes={plushes.filter(
              (p) => !p.hidden || editing?.plushIds.includes(p.id),
            )}
            settings={settings}
            onDone={() => {
              setEditing(undefined);
              setView("today");
            }}
          />
        ) : null}
        {view === "journal" ? (
          <JournalView
            date={date}
            posts={dayPosts}
            plushes={plushes}
            journal={journals.find((j) => j.logicalDate === date)}
            onEdit={openEditor}
            onBack={() => setView(date === today ? "today" : "history")}
          />
        ) : null}
      </main>
      {!["editor", "journal"].includes(view) ? (
        <>
          <button
            className={`fab${view === "today" ? " today-view" : ""}${view === "today" && todayDrawerOpen ? " today-drawer-open" : ""}`}
            onClick={() => openEditor()}
            aria-label="新しい投稿"
          >
            <AddRoundedIcon aria-hidden="true" />
          </button>
          <nav aria-label="メインメニュー">
            {(
              [
                ["today", "きょう"],
                ["history", "思い出"],
                ["plushes", "ぬいたち"],
                ["settings", "設定"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={view === id ? "active" : ""}
                onClick={() => setView(id)}
              >
                {id === "today" ? (
                  <TodayRoundedIcon aria-hidden="true" />
                ) : null}
                {id === "history" ? (
                  <HistoryRoundedIcon aria-hidden="true" />
                ) : null}
                {id === "plushes" ? (
                  <PetsRoundedIcon aria-hidden="true" />
                ) : null}
                {id === "settings" ? (
                  <SettingsRoundedIcon aria-hidden="true" />
                ) : null}
                {label}
              </button>
            ))}
          </nav>
        </>
      ) : null}
    </div>
  );
}
function Onboarding({
  settings,
  onLegal,
}: {
  settings: Settings;
  onLegal: (kind: LegalKind) => void;
}) {
  return (
    <main className="onboarding">
      <span className="hero-icon">ぬ</span>
      <h1>ぬいと</h1>
      <p>ぬいぐるみとの一日を、写真と場所でそっと残そう。</p>
      <section className="notice">
        <h2>この端末に保存します</h2>
        <p>
          ブラウザデータの削除、端末の故障・紛失時には、バックアップがない記録を復元できない可能性があります。
        </p>
      </section>
      <LineAuth />
      <p className="separator">または</p>
      <button
        className="primary"
        onClick={() => db.settings.put({ ...settings, started: true })}
      >
        注意事項を確認して、この端末で始める
      </button>
      <div className="legal-links" aria-label="法務情報">
        <button onClick={() => onLegal("privacy")}>プライバシーポリシー</button>
        <button onClick={() => onLegal("terms")}>利用規約</button>
      </div>
    </main>
  );
}

function LineAuth() {
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accountName, setAccountName] = useState("");
  useEffect(() => {
    fetch("/api/auth/session")
      .then((response) => response.json())
      .then(
        (result: {
          authenticated?: boolean;
          user?: { displayName?: string };
        }) => {
          if (result.authenticated)
            setAccountName(result.user?.displayName || "LINEユーザー");
        },
      )
      .catch(() => undefined);
    const reason = new URLSearchParams(location.search).get("auth");
    if (reason === "registration_closed")
      setError("新規登録できませんでした。あいことばを確認してください。");
    if (reason === "failed" || reason === "expired")
      setError("LINEログインを完了できませんでした。もう一度お試しください。");
  }, []);
  async function login() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/line/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invitePhrase: phrase }),
      });
      if (!response.ok) throw new Error();
      const result = (await response.json()) as { authorizationUrl?: string };
      if (!result.authorizationUrl) throw new Error();
      location.assign(result.authorizationUrl);
    } catch {
      setError(
        "LINEログインを開始できませんでした。しばらくしてから再度お試しください。",
      );
      setBusy(false);
    }
  }
  return (
    <section className="line-auth">
      <h2>LINEでログイン</h2>
      {accountName ? (
        <p className="success">{accountName}としてLINEログイン済みです。</p>
      ) : null}
      <p>
        初めて登録するときだけ、招待された人へ共有されたあいことばを入力してください。
        LINEの友だち、トーク、タイムラインへ自動共有することはありません。
      </p>
      <label>
        あいことば（新規登録時のみ）
        <input
          type="password"
          value={phrase}
          maxLength={128}
          autoComplete="off"
          onChange={(e) => setPhrase(e.target.value)}
        />
      </label>
      <button className="line-button" onClick={login} disabled={busy}>
        {busy ? "LINEへ移動中…" : "LINEでログイン・新規登録"}
      </button>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
export function Today({
  date,
  posts,
  plushes,
  journal,
  settings,
  onNew,
  onJournal,
  onDrawerOpenChange,
}: {
  date: string;
  posts: Post[];
  plushes: Plush[];
  journal?: Journal;
  settings: Settings;
  onNew: (post?: Post) => void;
  onJournal: () => void;
  onDrawerOpenChange?: (open: boolean) => void;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const dragStart = useRef<number | undefined>(undefined);
  const dragDistance = useRef(0);
  const suppressNextClick = useRef(false);
  useEffect(() => () => onDrawerOpenChange?.(false), [onDrawerOpenChange]);
  const setOpen = (open: boolean) => {
    setDrawerOpen(open);
    onDrawerOpenChange?.(open);
  };
  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    dragStart.current = event.clientY;
    dragDistance.current = 0;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragStart.current === undefined) return;
    dragDistance.current = event.clientY - dragStart.current;
  };
  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragStart.current === undefined) return;
    const distance = dragDistance.current;
    dragStart.current = undefined;
    dragDistance.current = 0;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (Math.abs(distance) > 32) {
      suppressNextClick.current = true;
      setOpen(distance < 0);
    }
  };
  const prompt = shouldPromptJournal(
    new Date(),
    settings.dayBoundaryTime,
    settings.journalPromptTime,
  );
  return (
    <section className="today-map-view" aria-labelledby="today-heading">
      <DayMap
        posts={posts}
        plushes={plushes}
        className="today-map"
        centerOnCurrentWhenEmpty
      />
      <div className="today-summary">
        <p className="eyebrow">きょう</p>
        <h1 id="today-heading">{formatDate(date)}</h1>
      </div>
      <button
        className={`${prompt ? "today-journal-button prompt" : "today-journal-button"}${drawerOpen ? " drawer-open" : ""}`}
        onClick={onJournal}
        aria-label={
          journal
            ? "きょうの日記を見る・編集する"
            : prompt
              ? "きょうの日記を書く"
              : "きょうの日記を見る"
        }
      >
        <BookRoundedIcon aria-hidden="true" />
      </button>
      <aside
        id="today-post-drawer"
        className={`today-post-drawer${drawerOpen ? " open" : ""}`}
        aria-label="きょうの投稿"
      >
        <button
          type="button"
          className="today-drawer-handle"
          aria-expanded={drawerOpen}
          aria-controls="today-post-drawer"
          aria-label={
            drawerOpen ? "投稿ドロワーを閉じる" : "投稿ドロワーを開く"
          }
          onClick={() => {
            if (suppressNextClick.current) {
              suppressNextClick.current = false;
              return;
            }
            setOpen(!drawerOpen);
          }}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          <span aria-hidden="true" />
          <strong>きょうの投稿</strong>
        </button>
        <section className="stack">
          {posts.length ? (
            posts.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                plushes={plushes}
                onEdit={() => onNew(p)}
              />
            ))
          ) : (
            <div className="empty">
              写真やひとこと、場所を記録すると、ここに一日が並びます。
            </div>
          )}
        </section>
      </aside>
    </section>
  );
}
function History({
  posts,
  journals,
  settings,
  onOpen,
}: {
  posts: Post[];
  journals: Journal[];
  settings: Settings;
  onOpen: (d: string) => void;
}) {
  const dates = [
    ...new Set([
      ...posts.map((p) => effectiveLogicalDate(p, settings.dayBoundaryTime)),
      ...journals.map((j) => j.logicalDate),
    ]),
  ]
    .sort()
    .reverse();
  return (
    <>
      <p className="eyebrow">思い出</p>
      <h1>日付から振り返る</h1>
      {dates.length ? (
        dates.map((d) => (
          <button className="history-row" key={d} onClick={() => onOpen(d)}>
            <span>{formatDate(d)}</span>
            <small>
              {
                posts.filter(
                  (p) =>
                    effectiveLogicalDate(p, settings.dayBoundaryTime) === d,
                ).length
              }
              件 {journals.some((j) => j.logicalDate === d) ? "・日記あり" : ""}
            </small>
          </button>
        ))
      ) : (
        <div className="empty">まだ思い出はありません。</div>
      )}
    </>
  );
}
export function Plushes({ plushes }: { plushes: Plush[] }) {
  const defaultOpaqueThemeColor = "#9a5438";
  const themeColorName = useId();
  const [editing, setEditing] = useState<Plush>();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<Blob>();
  const [iconCrop, setIconCrop] = useState(DEFAULT_PLUSH_ICON_CROP);
  const [themeColor, setThemeColor] = useState(DEFAULT_PLUSH_THEME_COLOR);
  const [opaqueThemeColor, setOpaqueThemeColor] = useState(
    defaultOpaqueThemeColor,
  );
  const [draftIcon, setDraftIcon] = useState<Blob>();
  const [draftCrop, setDraftCrop] = useState(DEFAULT_PLUSH_ICON_CROP);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const edit = (p?: Plush) => {
    setEditing(p);
    setName(p?.name ?? "");
    setIcon(p?.icon);
    setIconCrop(p?.iconCrop ?? DEFAULT_PLUSH_ICON_CROP);
    const nextThemeColor = p?.themeColor ?? DEFAULT_PLUSH_THEME_COLOR;
    setThemeColor(nextThemeColor);
    setOpaqueThemeColor(
      nextThemeColor === DEFAULT_PLUSH_THEME_COLOR
        ? defaultOpaqueThemeColor
        : nextThemeColor,
    );
    setDraftIcon(undefined);
    setError("");
  };
  async function chooseIcon(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const optimized = await optimizePlushIcon(file);
      setDraftIcon(optimized);
      setDraftCrop(DEFAULT_PLUSH_ICON_CROP);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "画像を読み込めませんでした。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!name.trim()) return;
    const now = new Date().toISOString();
    await db.plushes.put({
      id: editing?.id ?? crypto.randomUUID(),
      name: name.trim(),
      icon,
      iconCrop: icon ? iconCrop : undefined,
      themeColor,
      hidden: editing?.hidden ?? false,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
    });
    edit();
  }
  return (
    <>
      <p className="eyebrow">ぬいたち</p>
      <h1>いっしょに出かける子</h1>
      <div className="plush-grid">
        {plushes.map((p) => (
          <button key={p.id} className="plush" onClick={() => edit(p)}>
            {p.icon ? (
              <PlushIcon
                blob={p.icon}
                crop={p.iconCrop}
                alt=""
                themeColor={p.themeColor}
              />
            ) : (
              <span
                className="plush-icon-fallback"
                style={{
                  borderColor: p.themeColor ?? DEFAULT_PLUSH_THEME_COLOR,
                }}
              >
                ぬ
              </span>
            )}
            <strong>{p.name}</strong>
            {p.hidden ? <small>非表示</small> : null}
          </button>
        ))}
      </div>
      <section className="form-card">
        <h2>{editing ? "編集" : "新しいぬいを登録"}</h2>
        <label>
          名前
          <input
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          アイコン画像
          <input
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void chooseIcon(file);
            }}
          />
        </label>
        <fieldset className="theme-color-field">
          <legend>テーマカラー</legend>
          <label className="check">
            <input
              type="radio"
              name={themeColorName}
              checked={themeColor !== DEFAULT_PLUSH_THEME_COLOR}
              onChange={() => setThemeColor(opaqueThemeColor)}
            />
            テーマカラーを設定する
          </label>
          <label className="check">
            <input
              type="radio"
              name={themeColorName}
              checked={themeColor === DEFAULT_PLUSH_THEME_COLOR}
              onChange={() => setThemeColor(DEFAULT_PLUSH_THEME_COLOR)}
            />
            テーマカラーを設定しない
          </label>
          <label>
            アイコンを囲う色
            <input
              aria-label="テーマカラー"
              type="color"
              value={opaqueThemeColor}
              disabled={themeColor === DEFAULT_PLUSH_THEME_COLOR}
              onChange={(event) => {
                setOpaqueThemeColor(event.target.value);
                setThemeColor(event.target.value);
              }}
            />
          </label>
        </fieldset>
        {busy ? <p role="status">画像を準備しています…</p> : null}
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        {draftIcon ? (
          <PlushIconEditor
            blob={draftIcon}
            crop={draftCrop}
            onChange={setDraftCrop}
            onCancel={() => setDraftIcon(undefined)}
            themeColor={themeColor}
            onApply={() => {
              setIcon(draftIcon);
              setIconCrop(draftCrop);
              setDraftIcon(undefined);
            }}
          />
        ) : icon ? (
          <div className="saved-icon-preview">
            <PlushIcon
              blob={icon}
              crop={iconCrop}
              alt="現在のアイコン"
              themeColor={themeColor}
            />
            <button
              type="button"
              onClick={() => {
                setDraftIcon(icon);
                setDraftCrop(iconCrop);
              }}
            >
              位置とサイズを調整
            </button>
            <button
              type="button"
              onClick={() => {
                setIcon(undefined);
                setIconCrop(DEFAULT_PLUSH_ICON_CROP);
              }}
            >
              画像を削除
            </button>
          </div>
        ) : (
          <small>画像を選ぶと、円形アイコンのプレビューを調整できます。</small>
        )}
        {editing ? (
          <label className="check">
            <input
              type="checkbox"
              checked={editing.hidden}
              onChange={(e) =>
                setEditing({ ...editing, hidden: e.target.checked })
              }
            />
            新しい投稿では非表示にする
          </label>
        ) : null}
        <button
          className="primary"
          disabled={!name.trim() || busy || Boolean(draftIcon)}
          onClick={save}
        >
          保存
        </button>
      </section>
    </>
  );
}
function SettingsView({
  settings,
  onLegal,
}: {
  settings: Settings;
  onLegal: (kind: LegalKind) => void;
}) {
  const [boundary, setBoundary] = useState(settings.dayBoundaryTime);
  const [prompt, setPrompt] = useState(settings.journalPromptTime);
  const [message, setMessage] = useState("");
  async function save() {
    if (
      boundary !== settings.dayBoundaryTime &&
      !confirm(
        "一日の切り替え時刻を変えると、時刻のある過去の投稿が別の日に分類される場合があります。変更しますか？",
      )
    )
      return;
    await db.settings.put({
      ...settings,
      dayBoundaryTime: boundary,
      journalPromptTime: prompt,
    });
    setMessage("設定を保存しました。");
  }
  async function clear() {
    if (
      confirm(
        "すべての投稿、写真、ぬいぐるみ、日記、設定を削除します。元に戻せません。続けますか？",
      )
    )
      await deleteAllData();
  }
  return (
    <>
      <p className="eyebrow">設定</p>
      <h1>暮らしの時間に合わせる</h1>
      <section className="notice">
        <h2>保存について</h2>
        <p>
          記録はこのブラウザ内に保存されます。ブラウザデータの削除、端末の故障・紛失時には復元できない可能性があります。
        </p>
      </section>
      <section className="form-card">
        <label>
          一日の切り替え時刻
          <input
            type="time"
            value={boundary}
            onChange={(e) => setBoundary(e.target.value)}
          />
        </label>
        <small>この時刻より前の記録は、前日分になります。</small>
        <label>
          日記案内時刻
          <input
            type="time"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </label>
        <small>案内時刻は締切ではありません。通知は送信しません。</small>
        <button className="primary" onClick={save}>
          設定を保存
        </button>
        {message ? <p role="status">{message}</p> : null}
      </section>
      <section className="danger">
        <h2>すべてのデータを削除</h2>
        <button onClick={clear}>全データを削除する</button>
      </section>
      <section className="legal-links settings-links" aria-label="法務情報">
        <button onClick={() => onLegal("privacy")}>プライバシーポリシー</button>
        <button onClick={() => onLegal("terms")}>利用規約</button>
      </section>
    </>
  );
}

export function PostEditor({
  post,
  plushes,
  settings,
  onDone,
}: {
  post?: Post;
  plushes: Plush[];
  settings: Settings;
  onDone: () => void;
}) {
  type TimeChoice = "current" | "manual" | "unknown";
  const placeRecordingName = useId();
  const [body, setBody] = useState(post?.body ?? "");
  const [mode, setMode] = useState(post?.timeMode ?? "known");
  const [timeChoice, setTimeChoice] = useState<TimeChoice>(
    post ? (post.timeMode === "known" ? "manual" : "unknown") : "current",
  );
  const [dateTime, setDateTime] = useState(
    post?.occurredLocalDateTime ?? localDateTime(),
  );
  const [manualDate, setManualDate] = useState(
    post?.manualLogicalDate ?? todayLogicalDate(settings.dayBoundaryTime),
  );
  const [selected, setSelected] = useState<string[]>(post?.plushIds ?? []);
  const [images, setImages] = useState<PostImage[]>(post?.images ?? []);
  const [place, setPlace] = useState<Place | undefined>(post?.place);
  const [recordPlace, setRecordPlace] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setBody(post?.body ?? "");
    setMode(post?.timeMode ?? "known");
    setTimeChoice(
      post ? (post.timeMode === "known" ? "manual" : "unknown") : "current",
    );
    setDateTime(post?.occurredLocalDateTime ?? localDateTime());
    setManualDate(
      post?.manualLogicalDate ?? todayLogicalDate(settings.dayBoundaryTime),
    );
    setSelected(post?.plushIds ?? []);
    setImages(post?.images ?? []);
    setPlace(post?.place);
    setRecordPlace(true);
    setError("");
  }, [post, settings.dayBoundaryTime]);
  useEffect(() => {
    if (
      post ||
      !recordPlace ||
      !navigator.geolocation ||
      !navigator.permissions
    )
      return;
    let active = true;
    void navigator.permissions
      .query({ name: "geolocation" })
      .then((permission) => {
        if (!active || permission.state !== "granted") return;
        setBusy(true);
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (!active) return;
            setPlace(placeFromPosition(position));
            setBusy(false);
          },
          () => {
            if (active) setBusy(false);
          },
          geolocationOptions,
        );
      })
      .catch(() => {
        // 権限状態を確認できないブラウザでは、自動で許可を要求しない。
      });
    return () => {
      active = false;
    };
  }, [post, recordPlace]);
  const valid = body.trim() || images.length || place;
  async function filesChosen(files: FileList | null) {
    if (!files) return;
    if (images.length + files.length > 4) {
      setError("写真は1投稿につき4枚までです。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = [];
      for (const file of Array.from(files))
        next.push(
          await optimizeImage(
            file,
            settings.imageMaxLongEdge,
            settings.imageQuality,
          ),
        );
      setImages(
        [...images, ...next].map((x, i) => ({
          ...x,
          displayOrder: i,
          isCover: i === 0,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "画像処理に失敗しました。");
    } finally {
      setBusy(false);
    }
  }
  function current() {
    if (!navigator.geolocation) {
      setError("このブラウザでは現在地を取得できません。");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPlace(placeFromPosition(p));
        setBusy(false);
      },
      () => {
        setError("現在地を取得できませんでした。場所なしでも保存できます。");
        setBusy(false);
      },
      geolocationOptions,
    );
  }
  async function save() {
    if (body.length > 300) {
      setError("本文は300文字以内にしてください。");
      return;
    }
    if (!valid) {
      setError("本文、写真、場所のいずれかを入力してください。");
      return;
    }
    setBusy(true);
    setError("");
    const now = new Date().toISOString();
    const occurredLocalDateTime =
      timeChoice === "current" ? localDateTime() : dateTime;
    const value: Post = {
      id: post?.id ?? crypto.randomUUID(),
      body,
      plushIds: selected,
      images,
      timeMode: mode,
      occurredLocalDateTime:
        mode === "known" ? occurredLocalDateTime : undefined,
      manualLogicalDate: mode === "unknown" ? manualDate : undefined,
      place,
      createdAt: post?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await db.posts.put(value);
      onDone();
    } catch {
      setError(
        "保存できませんでした。空き容量を確認して、もう一度お試しください。入力内容は画面に保持されています。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (post && confirm("この投稿を削除します。元に戻せません。")) {
      await db.posts.delete(post.id);
      onDone();
    }
  }
  return (
    <>
      <button className="back" onClick={onDone}>
        <ArrowBackRoundedIcon aria-hidden="true" />
        戻る
      </button>
      <p className="eyebrow">{post ? "投稿を編集" : "新しい投稿"}</p>
      <h1>思い出を残す</h1>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <section className="form-card">
        <fieldset>
          <legend>いっしょにいたぬい</legend>
          {plushes.length ? (
            <div className="plush-choices">
              {plushes.map((p) => (
                <label className="plush-choice" key={p.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, p.id]
                          : selected.filter((id) => id !== p.id),
                      )
                    }
                  />
                  <span className="plush-choice-icon" aria-hidden="true">
                    {p.icon ? (
                      <PlushIcon
                        blob={p.icon}
                        crop={p.iconCrop}
                        alt=""
                        themeColor={p.themeColor}
                      />
                    ) : (
                      <span
                        className="plush-icon plush-icon-fallback"
                        style={{
                          borderColor:
                            p.themeColor ?? DEFAULT_PLUSH_THEME_COLOR,
                        }}
                      >
                        ぬ
                      </span>
                    )}
                    <span className="plush-choice-check">
                      <CheckRoundedIcon aria-hidden="true" />
                    </span>
                  </span>
                  <span className="plush-choice-name">{p.name}</span>
                </label>
              ))}
            </div>
          ) : (
            <small>
              「ぬいたち」から登録できます。選択なしでも保存できます。
            </small>
          )}
        </fieldset>
        <label>
          ひとこと
          <textarea
            rows={4}
            value={body}
            maxLength={301}
            onChange={(e) => setBody(e.target.value)}
          />
          <small className={body.length > 300 ? "over" : ""}>
            {body.length} / 300文字
          </small>
        </label>
        <label>
          写真（0〜4枚）
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={images.length >= 4 || busy}
            onChange={(e) => filesChosen(e.target.files)}
          />
        </label>
        {busy ? <p role="status">画像処理または位置情報を取得中…</p> : null}
        <div className="photos editable">
          {images.map((im, i) => (
            <div key={im.id}>
              <BlobImage blob={im.thumbnail} alt={`選択写真 ${i + 1}`} />
              <button
                onClick={() => setImages(images.filter((x) => x.id !== im.id))}
              >
                削除
              </button>
            </div>
          ))}
        </div>
        <fieldset>
          <legend>行動時刻</legend>
          <label className="check">
            <input
              type="radio"
              name="time-choice"
              checked={timeChoice === "current"}
              onChange={() => {
                setTimeChoice("current");
                setMode("known");
                setDateTime(localDateTime());
              }}
            />
            現在時刻
          </label>
          <label className="check">
            <input
              type="radio"
              name="time-choice"
              checked={timeChoice === "manual"}
              onChange={() => {
                setTimeChoice("manual");
                setMode("known");
              }}
            />
            時刻を設定する
          </label>
          <label className="check">
            <input
              type="radio"
              name="time-choice"
              checked={timeChoice === "unknown"}
              onChange={() => {
                setTimeChoice("unknown");
                setMode("unknown");
              }}
            />
            時刻を設定しない
          </label>
          {timeChoice === "manual" ? (
            <input
              aria-label="行動日時"
              type="datetime-local"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
            />
          ) : timeChoice === "unknown" ? (
            <input
              aria-label="論理日付"
              type="date"
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
            />
          ) : (
            <small>保存時の現在日時を記録します。</small>
          )}
        </fieldset>
        <fieldset>
          <legend>場所（任意）</legend>
          <label className="check">
            <input
              type="radio"
              name={placeRecordingName}
              checked={recordPlace}
              onChange={() => setRecordPlace(true)}
            />
            場所を記録する
          </label>
          <label className="check">
            <input
              type="radio"
              name={placeRecordingName}
              checked={!recordPlace}
              onChange={() => {
                setRecordPlace(false);
                setPlace(undefined);
              }}
            />
            場所を記録しない
          </label>
          {recordPlace ? (
            <>
              <p>地図をタップするか、ピンをドラッグして場所を指定できます。</p>
              <DayMap
                posts={[]}
                pick={place}
                onPick={setPlace}
                control={
                  <button
                    className="map-location-button"
                    onClick={current}
                    disabled={busy}
                    aria-label="現在地付近を表示"
                  >
                    <MyLocationRoundedIcon aria-hidden="true" />
                    <span>{busy ? "取得中…" : "現在地"}</span>
                  </button>
                }
              />
              {place ? (
                <label>
                  場所
                  <input
                    value={place.name}
                    onChange={(e) =>
                      setPlace({ ...place, name: e.target.value })
                    }
                  />
                </label>
              ) : null}
            </>
          ) : (
            <small>この投稿には場所を保存しません。</small>
          )}
        </fieldset>
        <button
          className="primary"
          disabled={busy || body.length > 300 || !valid}
          onClick={save}
        >
          {busy ? "処理中…" : "保存する"}
        </button>
        {post ? (
          <button className="delete" onClick={remove}>
            この投稿を削除
          </button>
        ) : null}
      </section>
    </>
  );
}

export function JournalView({
  date,
  posts,
  plushes,
  journal,
  onEdit,
  onBack,
}: {
  date: string;
  posts: Post[];
  plushes: Plush[];
  journal?: Journal;
  onEdit: (p: Post) => void;
  onBack: () => void;
}) {
  const [body, setBody] = useState(journal?.body ?? "");
  const [message, setMessage] = useState("");
  const names = [
    ...new Set(
      posts
        .flatMap((p) => p.plushIds)
        .map((id) => plushes.find((x) => x.id === id)?.name)
        .filter(Boolean),
    ),
  ];
  const latest = posts
    .map((p) => p.updatedAt)
    .sort()
    .at(-1);
  const changed =
    journal?.lastPostChangeAtAtSave &&
    latest &&
    latest > journal.lastPostChangeAtAtSave;
  async function save() {
    if (body.length > 1000) return;
    const now = new Date().toISOString();
    await db.journals.put({
      logicalDate: date,
      body,
      createdAt: journal?.createdAt ?? now,
      updatedAt: now,
      lastPostChangeAtAtSave: latest,
    });
    setMessage("日記を保存しました。");
  }
  return (
    <section className="journal-view" aria-labelledby="journal-heading">
      <div className="journal-hero">
        {posts.some((p) => p.place) ? (
          <DayMap posts={posts} plushes={plushes} className="journal-map" />
        ) : (
          <div className="journal-map-empty">
            場所付きの投稿がないため、地図は空です。
          </div>
        )}
        <button className="back journal-back" onClick={onBack}>
          <ArrowBackRoundedIcon aria-hidden="true" />
          戻る
        </button>
        <div className="journal-heading-card">
          <p className="eyebrow">きょうの日記</p>
          <h1 id="journal-heading">{formatDate(date)}</h1>
          {names.length ? (
            <p className="lead">{names.join("・")}とおでかけ</p>
          ) : null}
        </div>
      </div>
      {changed ? (
        <p className="notice">日記の保存後に記録が更新されています。</p>
      ) : null}
      <section className="stack journal-posts" aria-label="この日の投稿">
        {posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            plushes={plushes}
            onEdit={() => onEdit(p)}
          />
        ))}
      </section>
      <section className="form-card journal-compose">
        <p className="eyebrow">一日のまとめ</p>
        <h2>きょうの気持ちを残す</h2>
        <textarea
          rows={8}
          value={body}
          maxLength={1001}
          onChange={(e) => setBody(e.target.value)}
        />
        <small className={body.length > 1000 ? "over" : ""}>
          {body.length} / 1000文字
        </small>
        <button
          className="primary"
          disabled={body.length > 1000}
          onClick={save}
        >
          日記を保存
        </button>
        {message ? <p role="status">{message}</p> : null}
        {journal ? (
          <small>
            最終更新: {new Date(journal.updatedAt).toLocaleString("ja-JP")}
          </small>
        ) : null}
      </section>
    </section>
  );
}
