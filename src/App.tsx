import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import L from "leaflet";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AddAPhotoIcon from "@mui/icons-material/AddAPhoto";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ImportContactsIcon from "@mui/icons-material/ImportContacts";
import LocationOnRoundedIcon from "@mui/icons-material/LocationOnRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import HighlightOffIcon from "@mui/icons-material/HighlightOff";
import KeyboardArrowLeftRoundedIcon from "@mui/icons-material/KeyboardArrowLeftRounded";
import KeyboardArrowRightRoundedIcon from "@mui/icons-material/KeyboardArrowRightRounded";
import MyLocationRoundedIcon from "@mui/icons-material/MyLocationRounded";
import PetsRoundedIcon from "@mui/icons-material/PetsRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import TodayRoundedIcon from "@mui/icons-material/TodayRounded";
import { db, deleteAllData, deletePlush, getSettings } from "./db";
import {
  deleteCloudAccount,
  deleteCloudPost,
  deleteCloudPlush,
  saveCloudPost,
  syncCloudPosts,
} from "./cloud-posts";
import { saveCloudJournal, saveCloudPlush, saveCloudSettings, syncCloudProfile } from "./cloud-profile";
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
import { plushNameInitial } from "./plush-name";
import { movePostImage, reorderPostImages } from "./post-images";
import type { Journal, Place, Plush, Post, PostImage, Settings } from "./types";
type View =
  | "today"
  | "history"
  | "plushes"
  | "settings"
  | "editor"
  | "journal"
  | LegalKind;
type JournalSource = "today" | "history";
export type CloudSaveStatus = "checking" | "local" | "cloud" | "error";
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
  const colors = [
    ...new Set(
      post.plushIds
        .map((id) => plushes.find((plush) => plush.id === id)?.themeColor)
        .filter((color): color is string =>
          Boolean(color && /^#[0-9a-f]{6}$/i.test(color)),
        ),
    ),
  ];
  if (!colors.length) return "#687076";
  if (colors.length === 1) return colors[0];
  const slice = 360 / colors.length;
  const blend = Math.min(4, slice * 0.15);
  const stops = colors.flatMap((color, index) => [
    `${color} ${index === 0 ? 0 : index * slice + blend}deg`,
    `${color} ${(index + 1) * slice - blend}deg`,
  ]);
  stops.push(`${colors[0]} 360deg`);
  return `conic-gradient(from -2deg, ${stops.join(", ")})`;
}

function curvedRoute(points: L.LatLngTuple[]): L.LatLngTuple[] {
  if (points.length < 2) return points;
  const curved: L.LatLngTuple[] = [points[0]];
  points.slice(0, -1).forEach((start, index) => {
    const before = points[Math.max(0, index - 1)];
    const end = points[index + 1];
    const after = points[Math.min(points.length - 1, index + 2)];
    for (let step = 1; step <= 16; step += 1) {
      if (step === 16) {
        curved.push(end);
        continue;
      }
      const t = step / 16;
      const t2 = t * t;
      const t3 = t2 * t;
      curved.push(
        ([0, 1] as const).map(
          (axis) =>
            0.5 *
            (2 * start[axis] +
              (-before[axis] + end[axis]) * t +
              (2 * before[axis] -
                5 * start[axis] +
                4 * end[axis] -
                after[axis]) *
                t2 +
              (-before[axis] + 3 * start[axis] - 3 * end[axis] + after[axis]) *
                t3),
        ) as L.LatLngTuple,
      );
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
      aria-label={`おもいでの写真 ${imageNumber}の拡大表示`}
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
        alt={`拡大したおもいでの写真 ${imageNumber}`}
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
  focusPostId,
  focusRequest = 0,
  occludedById,
  onPostSelect,
  onFocusComplete,
}: {
  posts: Post[];
  plushes?: Plush[];
  pick?: Place;
  onPick?: (p: Place) => void;
  control?: ReactNode;
  className?: string;
  centerOnCurrentWhenEmpty?: boolean;
  focusPostId?: string;
  focusRequest?: number;
  occludedById?: string;
  onPostSelect?: (post: Post) => void;
  onFocusComplete?: () => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | undefined>(undefined);
  const onPostSelectRef = useRef(onPostSelect);
  onPostSelectRef.current = onPostSelect;
  const onFocusCompleteRef = useRef(onFocusComplete);
  onFocusCompleteRef.current = onFocusComplete;
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
    mapInstance.current = map;
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
    const objectUrls: string[] = [];
    let selectedMarker: L.Marker | undefined;
    located.forEach((p) => {
      const cover = [...p.images].sort((a, b) => a.displayOrder - b.displayOrder)[0];
      const background = postMarkerBackground(p, plushes);
      const crop = cover?.pinCrop ?? DEFAULT_PLUSH_ICON_CROP;
      const photoUrl = cover ? URL.createObjectURL(cover.thumbnail) : undefined;
      if (photoUrl) objectUrls.push(photoUrl);
      const marker = L.marker([p.place!.latitude, p.place!.longitude], {
        icon: L.divIcon({
          className: `post-map-marker${cover ? " photo-post-map-marker" : ""}`,
          html: cover
            ? `<span><b><img src="${photoUrl}" alt="" style="object-position:${crop.x}% ${crop.y}%;transform:translate(-50%,-50%) scale(${crop.zoom});transform-origin:${crop.x}% ${crop.y}%"></b><em><i style="background:${background}"></i></em></span>`
            : `<span><i style="background:${background}"></i></span>`,
          iconSize: cover ? [64, 72] : [28, 28],
          iconAnchor: cover ? [32, 72] : [14, 14],
        }),
      });
      marker.bindTooltip(p.place!.name || "記録した場所").addTo(map);
      if (onPostSelectRef.current)
        marker.on("click", () => {
          selectedMarker?.setZIndexOffset(0);
          marker.setZIndexOffset(1000);
          selectedMarker = marker;
          element.current
            ?.querySelectorAll(".post-map-marker.selected")
            .forEach((node) => node.classList.remove("selected"));
          marker.getElement()?.classList.add("selected");
          onPostSelectRef.current?.(p);
        });
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
      objectUrls.forEach(URL.revokeObjectURL);
      if (mapInstance.current === map) mapInstance.current = undefined;
      map.remove();
    };
  }, [posts, plushes, pick, onPick, className, centerOnCurrentWhenEmpty]);
  useEffect(() => {
    if (!focusPostId || !mapInstance.current) return;
    const focused = posts.find((post) => post.id === focusPostId && post.place);
    if (!focused?.place) return;
    mapInstance.current.setView(
      [focused.place.latitude, focused.place.longitude],
      mapInstance.current.getZoom(),
      { animate: false },
    );
    const mapBounds = element.current?.getBoundingClientRect();
    const occluderBounds = occludedById
      ? element.current
          ?.closest(".today-map-view")
          ?.querySelector<HTMLElement>(`#${occludedById}`)
          ?.getBoundingClientRect()
      : undefined;
    if (mapBounds && occluderBounds) {
      const overlap = Math.min(mapBounds.height, occluderBounds.height);
      if (overlap > 0)
        mapInstance.current.panBy([0, overlap / 2], { animate: false });
    }
    requestAnimationFrame(() => onFocusCompleteRef.current?.());
  }, [focusPostId, focusRequest, occludedById, posts]);
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
    </div>
  );
}
export function PostCard({
  post,
  plushes,
  onEdit,
  onSelect,
  selected = false,
}: {
  post: Post;
  plushes: Plush[];
  onEdit: () => void;
  onSelect?: () => void;
  selected?: boolean;
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
    <article
      id={`post-${post.id}`}
      className={`post-card${selected ? " selected" : ""}`}
      tabIndex={onSelect ? 0 : undefined}
      aria-label={
        onSelect
          ? `${post.place?.name || "おもいでの場所"}を地図の中心に表示`
          : undefined
      }
      onClick={onSelect}
      onKeyDown={(event) => {
        if (
          onSelect &&
          event.target === event.currentTarget &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          onSelect();
        }
      }}
    >
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
                  {plushNameInitial(plush.name)}
                </span>
              ),
            )}
          </span>
          <span aria-hidden="true">といっしょ</span>
        </div>
      ) : null}
      {post.body ? <p className="post-body">{post.body}</p> : null}
      {post.images.length ? (
        <div className="photos">
          {post.images.map((image, i) => (
            <button
              key={image.id}
              type="button"
              className="photo-expand"
              aria-label={`おもいでの写真 ${i + 1}を拡大`}
              onClick={(event) => {
                imageTrigger.current = event.currentTarget;
                setExpandedImage({ image, imageNumber: i + 1 });
              }}
            >
              <BlobImage
                blob={image.thumbnail}
                alt={`おもいでの写真 ${i + 1}`}
              />
            </button>
          ))}
        </div>
      ) : null}
      <div className="post-card-footer">
        <p className="post-meta">
          <span>
            {post.timeMode === "known"
              ? post.occurredLocalDateTime!.slice(11, 16)
              : "時間不明"}
          </span>
          {post.place ? (
            <span className="post-location">
              <LocationOnRoundedIcon aria-hidden="true" />
              {post.place.name || "場所あり"}
            </span>
          ) : null}
        </p>
        <button
          className="card-action"
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
          aria-label="おもいでを編集"
        >
          <EditRoundedIcon aria-hidden="true" />
        </button>
      </div>
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
  const [journalSource, setJournalSource] =
    useState<JournalSource>("today");
  const [editing, setEditing] = useState<Post>();
  const [todayDrawerOpen, setTodayDrawerOpen] = useState(false);
  const [cloudError, setCloudError] = useState("");
  const [cloudSaveStatus, setCloudSaveStatus] =
    useState<CloudSaveStatus>("checking");
  const mainElement = useRef<HTMLElement>(null);
  useEffect(() => {
    if (mainElement.current) mainElement.current.scrollTop = 0;
  }, [view]);
  useEffect(() => {
    void syncCloudPosts()
      .then(async (enabled) => {
        if (enabled) await syncCloudProfile();
        setCloudSaveStatus(enabled ? "cloud" : "local");
      })
      .catch(() => {
        setCloudSaveStatus("error");
        setCloudError(
          "サーバー上のおもいでを読み込めませんでした。通信状態を確認してください。",
        );
      });
  }, []);
  const cloudEnabled = cloudSaveStatus === "cloud";
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
  const openJournal = (d: string, source: JournalSource) => {
    setSelectedDate(d);
    setJournalSource(source);
    setView("journal");
  };
  return (
    <div
      className={`app${view === "today" ? " today-app" : ""}${view === "journal" ? " journal-app" : ""}`}
    >
      <header className="app-header">
        <img src="/icons/nuito-icon.png" alt="" width="48" height="48" />
        <strong>ぬいと</strong>
      </header>
      {cloudError ? (
        <p className="cloud-error" role="alert">
          {cloudError}
        </p>
      ) : null}
      <main
        ref={mainElement}
        className={
          view === "today"
            ? "today-main"
            : view === "journal"
              ? "journal-main"
              : undefined
        }
      >
        {view === "today" ? (
          <Today
            date={today}
            posts={dayPosts}
            plushes={plushes}
            journal={journals.find((j) => j.logicalDate === today)}
            settings={settings}
            onNew={openEditor}
            onJournal={() => openJournal(today, "today")}
            onDrawerOpenChange={setTodayDrawerOpen}
          />
        ) : null}
        {view === "history" ? (
          <History
            posts={posts}
            journals={journals}
            plushes={plushes}
            settings={settings}
            onOpen={(historyDate) => openJournal(historyDate, "history")}
          />
        ) : null}
        {view === "plushes" ? <Plushes plushes={plushes} cloudEnabled={cloudEnabled} /> : null}
        {view === "settings" ? (
          <SettingsView
            settings={settings}
            cloudSaveStatus={cloudSaveStatus}
            onLegal={openLegal}
          />
        ) : null}
        {view === "editor" ? (
          <PostEditor
            key={editing?.id ?? "new"}
            post={editing}
            plushes={plushes.filter(
              (p) => !p.hidden || editing?.plushIds.includes(p.id),
            )}
            settings={settings}
            cloudEnabled={cloudEnabled}
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
            cloudEnabled={cloudEnabled}
            onEdit={openEditor}
          />
        ) : null}
      </main>
      {view !== "editor" ? (
        <>
          {view === "today" ? (
            <button
              className={`fab today-view${todayDrawerOpen ? " today-drawer-open" : ""}`}
              onClick={() => openEditor()}
              aria-label="新しいおもいで"
            >
              <AddRoundedIcon aria-hidden="true" />
            </button>
          ) : null}
          <nav aria-label="メインメニュー">
            {(
              [
                ["today", "きょう"],
                ["history", "おもいで"],
                ["plushes", "ぬいたち"],
                ["settings", "せってい"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={
                  view === id || (view === "journal" && journalSource === id)
                    ? "active"
                    : ""
                }
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
      <img
        className="hero-icon"
        src="/icons/nuito-icon.png"
        alt=""
        width="112"
        height="112"
      />
      <h1>ぬいと</h1>
      <p>ぬいぐるみとの一日を、写真と場所でそっと残そう。</p>
      <section className="notice">
        <h2>保存について</h2>
        <p>
          LINEログイン中は投稿と写真をサーバーにも保存します。ログインせずに使う場合はこの端末だけに保存され、ブラウザデータの削除や端末の故障・紛失時に復元できない可能性があります。
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
  const [focusedPostId, setFocusedPostId] = useState<string>();
  const [focusRequest, setFocusRequest] = useState(0);
  const dragStart = useRef<number | undefined>(undefined);
  const dragDistance = useRef(0);
  const suppressNextClick = useRef(false);
  useEffect(() => () => onDrawerOpenChange?.(false), [onDrawerOpenChange]);
  const setOpen = (open: boolean) => {
    setDrawerOpen(open);
    onDrawerOpenChange?.(open);
  };
  const selectPost = (post: Post) => {
    setFocusedPostId(post.id);
    setFocusRequest((request) => request + 1);
  };
  const finishPostSelection = () => {
    setOpen(true);
    requestAnimationFrame(() =>
      focusedPostId
        ? document.getElementById(`post-${focusedPostId}`)?.scrollIntoView?.({
        block: "nearest",
          })
        : undefined,
    );
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
    <section
      className={`today-map-view${drawerOpen ? " drawer-open" : ""}`}
      aria-labelledby="today-heading"
    >
      <DayMap
        posts={posts}
        plushes={plushes}
        className="today-map"
        centerOnCurrentWhenEmpty
        focusPostId={focusedPostId}
        focusRequest={focusRequest}
        occludedById="today-post-drawer"
        onPostSelect={selectPost}
        onFocusComplete={finishPostSelection}
      />
      <div className="today-summary">
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
        <ImportContactsIcon aria-hidden="true" />
      </button>
      <aside
        id="today-post-drawer"
        className={`today-post-drawer${drawerOpen ? " open" : ""}`}
        aria-label="きょうのおもいで"
      >
        <button
          type="button"
          className="today-drawer-handle"
          aria-expanded={drawerOpen}
          aria-controls="today-post-drawer"
          aria-label={
            drawerOpen ? "おもいでドロワーを閉じる" : "おもいでドロワーを開く"
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
          <strong>きょうのおもいで</strong>
        </button>
        <div className="today-drawer-scroll">
          <section className="stack">
            {posts.length ? (
              posts.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  plushes={plushes}
                  onEdit={() => onNew(p)}
                  onSelect={
                    p.place
                      ? () => selectPost(p)
                      : undefined
                  }
                  selected={focusedPostId === p.id}
                />
              ))
            ) : (
              <div className="empty">
                写真やひとこと、場所を記録すると、ここに一日が並びます。
              </div>
            )}
          </section>
        </div>
      </aside>
    </section>
  );
}
export function History({
  posts,
  journals,
  plushes,
  settings,
  onOpen,
}: {
  posts: Post[];
  journals: Journal[];
  plushes: Plush[];
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
      <h1 className="page-title">おもいで</h1>
      {dates.length ? (
        dates.map((d) => {
          const dayPosts = posts.filter(
            (post) =>
              effectiveLogicalDate(post, settings.dayBoundaryTime) === d,
          );
          const dayPlushes = [
            ...new Set(dayPosts.flatMap((post) => post.plushIds)),
          ]
            .map((id) => plushes.find((plush) => plush.id === id))
            .filter((plush): plush is Plush => Boolean(plush));
          return (
            <button className="history-row" key={d} onClick={() => onOpen(d)}>
              <span>{formatDate(d)}</span>
              <span className="history-summary">
                {dayPlushes.length ? (
                  <span
                    className="history-plushes"
                    role="img"
                    aria-label={`${dayPlushes.map((plush) => plush.name).join("、")}といっしょ`}
                  >
                    {dayPlushes.map((plush) =>
                      plush.icon ? (
                        <PlushIcon
                          key={plush.id}
                          blob={plush.icon}
                          crop={plush.iconCrop}
                          alt=""
                          className="history-plush-icon"
                          themeColor={plush.themeColor}
                        />
                      ) : (
                        <span
                          key={plush.id}
                          className="history-plush-icon fallback-icon"
                          style={{
                            borderColor:
                              plush.themeColor ?? DEFAULT_PLUSH_THEME_COLOR,
                          }}
                          aria-hidden="true"
                        >
                          {plushNameInitial(plush.name)}
                        </span>
                      ),
                    )}
                  </span>
                ) : null}
                <small>
                  {dayPosts.length}件
                  {journals.some((j) => j.logicalDate === d)
                    ? "・日記あり"
                    : ""}
                </small>
              </span>
            </button>
          );
        })
      ) : (
        <div className="empty">まだ思い出はありません。</div>
      )}
    </>
  );
}
export function Plushes({ plushes, cloudEnabled = false }: { plushes: Plush[]; cloudEnabled?: boolean }) {
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
    const nextIcon = draftIcon ?? icon;
    const nextIconCrop = draftIcon ? draftCrop : iconCrop;
    const value: Plush = {
      id: editing?.id ?? crypto.randomUUID(),
      name: name.trim(),
      icon: nextIcon,
      iconCrop: nextIcon ? nextIconCrop : undefined,
      themeColor,
      hidden: editing?.hidden ?? false,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
    };
    setBusy(true);
    setError("");
    try {
      const savedToCloud = await saveCloudPlush(value);
      if (cloudEnabled && !savedToCloud) throw new Error("cloud_session_expired");
      await db.plushes.put(value);
      edit();
    } catch {
      setError("ぬいを保存できませんでした。通信状態を確認して、もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !editing ||
      !confirm(
        `「${editing.name}」を削除します。過去のおもいでは残りますが、このぬいとの関連は外れます。元に戻せません。続けますか？`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await deleteCloudPlush(editing.id);
      await deletePlush(editing.id);
      edit();
    } catch {
      setError(
        "ぬいを削除できませんでした。通信状態を確認して、もう一度お試しください。",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1 className="page-title">ぬいたち</h1>
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
                {plushNameInitial(p.name)}
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
          {themeColor !== DEFAULT_PLUSH_THEME_COLOR ? (
            <label className="theme-color-picker">
              アイコンを囲う色
              <input
                aria-label="テーマカラー"
                type="color"
                value={opaqueThemeColor}
                onChange={(event) => {
                  setOpaqueThemeColor(event.target.value);
                  setThemeColor(event.target.value);
                }}
              />
            </label>
          ) : null}
          <label className="check">
            <input
              type="radio"
              name={themeColorName}
              checked={themeColor === DEFAULT_PLUSH_THEME_COLOR}
              onChange={() => setThemeColor(DEFAULT_PLUSH_THEME_COLOR)}
            />
            テーマカラーを設定しない
          </label>
        </fieldset>
        <div className="photo-upload-field plush-icon-upload-field">
          <span>アイコン画像</span>
          <label className="photo-file-button" aria-disabled={busy}>
            <AddAPhotoIcon aria-hidden="true" />
            <span>画像を選択</span>
            <input
              className="photo-file-input"
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
        </div>
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
            onApply={() => undefined}
            hideApply
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
        ) : null}
        {editing ? (
          <label className="check">
            <input
              type="checkbox"
              checked={editing.hidden}
              onChange={(e) =>
                setEditing({ ...editing, hidden: e.target.checked })
              }
            />
            新しいおもいででは非表示にする
          </label>
        ) : null}
        <button
          className="primary"
          disabled={!name.trim() || busy}
          onClick={save}
        >
          保存
        </button>
        {editing ? (
          <button className="delete" disabled={busy} onClick={remove}>
            このぬいを削除
          </button>
        ) : null}
      </section>
    </>
  );
}
export function SettingsView({
  settings,
  cloudSaveStatus,
  onLegal,
}: {
  settings: Settings;
  cloudSaveStatus: CloudSaveStatus;
  onLegal: (kind: LegalKind) => void;
}) {
  const cloudEnabled = cloudSaveStatus === "cloud";
  const [boundary, setBoundary] = useState(settings.dayBoundaryTime);
  const [prompt, setPrompt] = useState(settings.journalPromptTime);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function save() {
    if (
      boundary !== settings.dayBoundaryTime &&
      !confirm(
        "一日の切り替え時刻を変えると、時刻のある過去のおもいでが別の日に分類される場合があります。変更しますか？",
      )
    )
      return;
    const value: Settings = {
      ...settings,
      dayBoundaryTime: boundary,
      journalPromptTime: prompt,
      updatedAt: new Date().toISOString(),
    };
    setError("");
    try {
      const savedToCloud = await saveCloudSettings(value);
      if (cloudEnabled && !savedToCloud) throw new Error("cloud_session_expired");
      await db.settings.put(value);
      setMessage("設定を保存しました。");
    } catch {
      setError("設定を保存できませんでした。通信状態を確認して、もう一度お試しください。");
    }
  }
  async function clear() {
    if (
      confirm(
        cloudEnabled
          ? "すべてのおもいで、写真、ぬいぐるみ、日記、設定とLINEアカウント連携を削除します。元に戻せません。続けますか？"
          : "すべてのおもいで、写真、ぬいぐるみ、日記、設定を削除します。元に戻せません。続けますか？",
      )
    ) {
      setError("");
      try {
        await deleteCloudAccount();
        await deleteAllData();
      } catch {
        setError(
          "データを削除できませんでした。通信状態を確認して、もう一度お試しください。",
        );
      }
    }
  }
  return (
    <>
      <h1 className="page-title">せってい</h1>
      <section className="notice">
        <h2>保存について</h2>
        <p>
          {cloudSaveStatus === "checking"
            ? "保存状態を確認しています。"
            : cloudSaveStatus === "cloud"
              ? "LINEログイン中です。おもいで、写真、ぬい、日記、設定はサーバーにも保存され、このブラウザにも保持されます。"
              : cloudSaveStatus === "error"
                ? "保存状態を確認できませんでした。通信状態を確認してから、もう一度アプリを開いてください。"
                : "LINEログインしていないため、現在はこのブラウザ内だけに保存されています。ブラウザデータの削除、端末の故障・紛失時には復元できない可能性があります。"}
        </p>
      </section>
      <section className="form-card">
        <h2>一日の切り替わり</h2>
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
        {error ? <p className="error" role="alert">{error}</p> : null}
      </section>
      <section className="danger">
        <h2>すべてのデータを削除</h2>
        <button onClick={clear}>全データを削除する</button>
        {cloudEnabled ? (
          <small>LINEアカウント連携とクラウド上の投稿・画像も削除します。</small>
        ) : null}
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
  cloudEnabled = false,
  onDone,
}: {
  post?: Post;
  plushes: Plush[];
  settings: Settings;
  cloudEnabled?: boolean;
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
  const [draggedImageId, setDraggedImageId] = useState<string>();
  const imagePointerStart = useRef<{
    id: string;
    x: number;
    y: number;
  } | undefined>(undefined);
  const [pinCropImageId, setPinCropImageId] = useState<string>();
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
      setError("写真は1件のおもいでにつき4枚までです。");
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
  const moveImage = (index: number, offset: -1 | 1) => {
    setImages(reorderPostImages(images, index, offset));
  };
  const moveImageTo = (imageId: string, targetIndex: number) => {
    const sourceIndex = images.findIndex((image) => image.id === imageId);
    if (sourceIndex >= 0)
      setImages(movePostImage(images, sourceIndex, targetIndex));
  };
  const startImageDrag = (
    event: ReactDragEvent<HTMLDivElement>,
    imageId: string,
  ) => {
    setDraggedImageId(imageId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", imageId);
  };
  const dropImage = (event: ReactDragEvent<HTMLDivElement>, target: number) => {
    event.preventDefault();
    const imageId =
      event.dataTransfer.getData("text/plain") || draggedImageId;
    if (imageId) moveImageTo(imageId, target);
    setDraggedImageId(undefined);
  };
  const startImageSwipe = (
    event: ReactPointerEvent<HTMLDivElement>,
    imageId: string,
  ) => {
    if (
      event.pointerType !== "touch" ||
      (event.target as HTMLElement).closest("button")
    )
      return;
    imagePointerStart.current = {
      id: imageId,
      x: event.clientX,
      y: event.clientY,
    };
  };
  const finishImageSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = imagePointerStart.current;
    imagePointerStart.current = undefined;
    if (!start || event.pointerType !== "touch") return;
    const horizontal = event.clientX - start.x;
    const vertical = event.clientY - start.y;
    if (Math.abs(horizontal) < 40 || Math.abs(horizontal) <= Math.abs(vertical))
      return;
    const index = images.findIndex((image) => image.id === start.id);
    moveImage(index, horizontal < 0 ? -1 : 1);
  };
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
      const savedToCloud = await saveCloudPost(
        value,
        plushes,
        new Set(post?.images.map((image) => image.id)),
      );
      if (cloudEnabled && !savedToCloud) throw new Error("cloud_session_expired");
      await db.posts.put(value);
      onDone();
    } catch {
      setError(
        "保存できませんでした。通信状態と空き容量を確認して、もう一度お試しください。入力内容は画面に保持されています。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (post && confirm("このおもいでを削除します。元に戻せません。")) {
      setBusy(true);
      setError("");
      try {
        const deletedFromCloud = await deleteCloudPost(post.id);
        if (cloudEnabled && !deletedFromCloud)
          throw new Error("cloud_session_expired");
        await db.posts.delete(post.id);
        onDone();
      } catch {
        setError(
          "削除できませんでした。通信状態を確認して、もう一度お試しください。",
        );
      } finally {
        setBusy(false);
      }
    }
  }
  return (
    <>
      <button className="back" onClick={onDone}>
        <ArrowBackRoundedIcon aria-hidden="true" />
        戻る
      </button>
      <h1 className="page-title">
        {post ? "おもいでを編集" : "新しいおもいで"}
      </h1>
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
                        {plushNameInitial(p.name)}
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
        <div className="photo-upload-field">
          <span>写真（0〜4枚）</span>
          <label
            className="photo-file-button"
            aria-disabled={images.length >= 4 || busy}
          >
            <AddAPhotoIcon aria-hidden="true" />
            <span>写真を追加</span>
            <input
              className="photo-file-input"
              type="file"
              accept="image/*"
              multiple
              disabled={images.length >= 4 || busy}
              onChange={(e) => filesChosen(e.target.files)}
            />
          </label>
        </div>
        {busy ? <p role="status">画像処理または位置情報を取得中…</p> : null}
        {images.length > 1 ? (
          <small className="photo-reorder-help">
            写真をドラッグ、または左右にスワイプして並び替えられます。1枚目が地図のピンに表示されます。
          </small>
        ) : null}
        <div className="photos editable">
          {images.map((im, i) => (
            <div
              key={im.id}
              className={draggedImageId === im.id ? "dragging" : undefined}
              draggable
              onDragStart={(event) => startImageDrag(event, im.id)}
              onDragEnd={() => setDraggedImageId(undefined)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropImage(event, i)}
              onPointerDown={(event) => startImageSwipe(event, im.id)}
              onPointerUp={finishImageSwipe}
              onPointerCancel={() => {
                imagePointerStart.current = undefined;
              }}
              aria-label={`選択写真 ${i + 1}。ドラッグまたは左右スワイプで並び替え`}
            >
              <BlobImage blob={im.thumbnail} alt={`選択写真 ${i + 1}`} />
              <div className="photo-order-actions">
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => moveImage(i, -1)}
                  aria-label={`選択写真 ${i + 1}を前へ`}
                >
                  <KeyboardArrowLeftRoundedIcon aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={i === images.length - 1}
                  onClick={() => moveImage(i, 1)}
                  aria-label={`選択写真 ${i + 1}を後ろへ`}
                >
                  <KeyboardArrowRightRoundedIcon aria-hidden="true" />
                </button>
              </div>
              {i === 0 ? (
                <button
                  className="photo-pin-edit"
                  type="button"
                  onClick={() => {
                    setPinCropImageId(im.id);
                  }}
                  aria-label="ピンに表示する画像を調整"
                >
                  <EditRoundedIcon aria-hidden="true" />
                </button>
              ) : null}
              <button
                className="photo-delete"
                type="button"
                aria-label={`選択写真 ${i + 1}を削除`}
                onClick={() =>
                  setImages(
                    images
                      .filter((x) => x.id !== im.id)
                      .map((image, displayOrder) => ({
                        ...image,
                        displayOrder,
                        isCover: displayOrder === 0,
                      })),
                  )
                }
              >
                <HighlightOffIcon aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        {pinCropImageId
          ? (() => {
              const image = images.find((item) => item.id === pinCropImageId);
              return image ? (
                <PlushIconEditor
                  blob={image.thumbnail}
                  crop={image.pinCrop ?? DEFAULT_PLUSH_ICON_CROP}
                  onChange={(pinCrop) => {
                    setImages(
                      images.map((item) =>
                        item.id === image.id
                          ? { ...item, pinCrop }
                          : item,
                      ),
                    );
                  }}
                  onApply={() => {
                    setPinCropImageId(undefined);
                  }}
                  onCancel={() => setPinCropImageId(undefined)}
                  subject="ピンに表示する画像"
                  applyLabel="調整を終わる"
                  hideCancel
                />
              ) : null;
            })()
          : null}
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
          {timeChoice === "current" ? (
            <small className="time-choice-detail">
              保存時の現在日時を記録します。
            </small>
          ) : null}
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
            時刻を手動設定する
          </label>
          {timeChoice === "manual" ? (
            <input
              className="time-choice-detail"
              aria-label="行動日時"
              type="datetime-local"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
            />
          ) : null}
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
          {timeChoice === "unknown" ? (
            <input
              className="time-choice-detail"
              aria-label="論理日付"
              type="date"
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
            />
          ) : null}
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
          {recordPlace ? (
            <div className="place-editor">
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
            </div>
          ) : null}
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
          {!recordPlace ? (
            <small className="place-choice-detail">
              このおもいでには場所を保存しません。
            </small>
          ) : null}
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
            このおもいでを削除
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
  cloudEnabled = false,
  onEdit,
}: {
  date: string;
  posts: Post[];
  plushes: Plush[];
  journal?: Journal;
  cloudEnabled?: boolean;
  onEdit: (p: Post) => void;
}) {
  const journalBody = journal?.body ?? "";
  const journalUpdatedAt = journal?.updatedAt;
  const hasJournal = Boolean(journal);
  const [body, setBody] = useState(journalBody);
  const [isEditing, setIsEditing] = useState(!hasJournal);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setBody(journalBody);
    setIsEditing(!hasJournal);
    setMessage("");
    setError("");
  }, [date, hasJournal, journalBody, journalUpdatedAt]);
  const dayPlushes = [
    ...new Set(
      posts.flatMap((post) => post.plushIds),
    ),
  ]
    .map((id) => plushes.find((plush) => plush.id === id))
    .filter((plush): plush is Plush => Boolean(plush));
  const latest = posts
    .map((p) => p.updatedAt)
    .sort()
    .at(-1);
  const journalDate = formatDate(date)
    .replace("(", "（")
    .replace(")", "）");
  async function save() {
    if (body.length > 1000) return;
    const now = new Date().toISOString();
    const value: Journal = {
      logicalDate: date,
      body,
      createdAt: journal?.createdAt ?? now,
      updatedAt: now,
      lastPostChangeAtAtSave: latest,
    };
    setError("");
    try {
      const savedToCloud = await saveCloudJournal(value);
      if (cloudEnabled && !savedToCloud) throw new Error("cloud_session_expired");
      await db.journals.put(value);
      setMessage("日記を保存しました。");
      setIsEditing(false);
    } catch {
      setError("日記を保存できませんでした。通信状態を確認して、もう一度お試しください。");
    }
  }
  return (
    <section className="journal-view" aria-labelledby="journal-heading">
      <div className="journal-hero">
        {posts.some((p) => p.place) ? (
          <DayMap posts={posts} plushes={plushes} className="journal-map" />
        ) : (
          <div className="journal-map-empty">
            場所付きのおもいでがないため、地図は空です。
          </div>
        )}
      </div>
      <div className="journal-lower">
        <header className="journal-posts-heading">
          <h1 id="journal-heading" className="page-title">
            {journalDate}の日記
          </h1>
          {dayPlushes.length ? (
            <div
              className="journal-companions"
              aria-label={`${dayPlushes.map((plush) => plush.name).join("、")}とおでかけ`}
            >
              <span className="companion-icons" aria-hidden="true">
                {dayPlushes.map((plush) =>
                  plush.icon ? (
                    <PlushIcon
                      key={plush.id}
                      blob={plush.icon}
                      crop={plush.iconCrop}
                      alt=""
                      className="journal-companion-icon"
                      themeColor={plush.themeColor}
                    />
                  ) : (
                    <span
                      key={plush.id}
                      className="journal-companion-icon fallback-icon"
                      style={{
                        borderColor:
                          plush.themeColor ?? DEFAULT_PLUSH_THEME_COLOR,
                      }}
                      aria-hidden="true"
                    >
                      {plushNameInitial(plush.name)}
                    </span>
                  ),
                )}
              </span>
              <span aria-hidden="true">とおでかけ</span>
            </div>
          ) : null}
        </header>
        <div className="journal-scroll">
          <section className="stack journal-posts" aria-label="この日のおもいで">
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
            <div className="journal-compose-heading">
              <h2>きょうのにっき</h2>
              {journal && !isEditing ? (
                <button
                  type="button"
                  aria-label="きょうのにっきを編集"
                  onClick={() => setIsEditing(true)}
                >
                  <EditRoundedIcon aria-hidden="true" />
                </button>
              ) : null}
            </div>
            {isEditing ? (
              <>
                <textarea
                  aria-label="きょうのにっき"
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
              </>
            ) : (
              <p className="journal-body">{body}</p>
            )}
            {message ? <p role="status">{message}</p> : null}
            {error ? <p className="error" role="alert">{error}</p> : null}
            {journal ? (
              <small>
                最終更新: {new Date(journal.updatedAt).toLocaleString("ja-JP")}
              </small>
            ) : null}
          </section>
        </div>
      </div>
    </section>
  );
}
