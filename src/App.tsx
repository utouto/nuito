import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import L from "leaflet";
import { db, deleteAllData, getSettings } from "./db";
import {
  effectiveLogicalDate,
  formatDate,
  localDateTime,
  shouldPromptJournal,
  sortPosts,
  todayLogicalDate,
} from "./domain";
import { optimizeImage } from "./image";
import { LegalPage, type LegalKind } from "./legal";
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
function DayMap({
  posts,
  pick,
  onPick,
}: {
  posts: Post[];
  pick?: Place;
  onPick?: (p: Place) => void;
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
    if (tileUrl && navigator.onLine)
      L.tileLayer(tileUrl, { attribution }).addTo(map);
    const route = sortPosts(located.filter((p) => p.timeMode === "known")).map(
      (p) => [p.place!.latitude, p.place!.longitude] as L.LatLngTuple,
    );
    if (route.length > 1)
      L.polyline(route, {
        dashArray: "7 10",
        color: "#8b5e3c",
        weight: 4,
      }).addTo(map);
    located.forEach((p) =>
      L.circleMarker([p.place!.latitude, p.place!.longitude], {
        radius: 9,
        color: p.timeMode === "known" ? "#8b5e3c" : "#687076",
        fillOpacity: 0.9,
      })
        .bindTooltip(p.place!.name || "記録した場所")
        .addTo(map),
    );
    if (pick)
      L.circleMarker([pick.latitude, pick.longitude], {
        radius: 10,
        color: "#d65a31",
        fillOpacity: 1,
      }).addTo(map);
    if (all.length > 1)
      map.fitBounds(L.latLngBounds(all), { padding: [24, 24], maxZoom: 15 });
    if (onPick)
      map.on("click", (e) =>
        onPick({
          latitude: e.latlng.lat,
          longitude: e.latlng.lng,
          name: "地図で選んだ場所",
          source: "map",
        }),
      );
    return () => {
      map.remove();
    };
  }, [posts, pick, onPick]);
  return (
    <div className="map-wrap">
      <div ref={element} className="map" aria-label="日別地図" />
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
function PostCard({
  post,
  plushes,
  onEdit,
}: {
  post: Post;
  plushes: Plush[];
  onEdit: () => void;
}) {
  const names = post.plushIds
    .map((id) => plushes.find((p) => p.id === id)?.name)
    .filter(Boolean);
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
            <BlobImage
              key={image.id}
              blob={image.thumbnail}
              alt={`投稿写真 ${i + 1}`}
            />
          ))}
        </div>
      ) : null}
      {post.body ? <p className="post-body">{post.body}</p> : null}
      {names.length ? (
        <p className="with">{names.join("と")}といっしょ</p>
      ) : null}
    </article>
  );
}
export default function App() {
  const settings = useLiveQuery(() => getSettings(), []);
  const posts = useLiveQuery(() => db.posts.toArray(), []) ?? [];
  const plushes = useLiveQuery(() => db.plushes.toArray(), []) ?? [];
  const journals = useLiveQuery(() => db.journals.toArray(), []) ?? [];
  const [view, setView] = useState<View>(() => {
    if (location.pathname === "/privacy") return "privacy";
    if (location.pathname === "/terms") return "terms";
    return "today";
  });
  const [selectedDate, setSelectedDate] = useState("");
  const [editing, setEditing] = useState<Post>();
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
  const today = todayLogicalDate(settings.dayBoundaryTime);
  const date = selectedDate || today;
  const dayPosts = sortPosts(
    posts.filter(
      (p) => effectiveLogicalDate(p, settings.dayBoundaryTime) === date,
    ),
  );
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
          <strong>ぬいログ</strong>
        </div>
        <span className="env">{import.meta.env.VITE_APP_ENV}</span>
      </header>
      <main>
        {view === "today" ? (
          <Today
            date={today}
            posts={dayPosts}
            plushes={plushes}
            journal={journals.find((j) => j.logicalDate === today)}
            settings={settings}
            onNew={() => openEditor()}
            onJournal={() => openJournal(today)}
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
            post={editing}
            plushes={plushes.filter((p) => !p.hidden)}
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
            className="fab"
            onClick={() => openEditor()}
            aria-label="新しい投稿"
          >
            ＋
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
      <h1>ぬいログ</h1>
      <p>ぬいぐるみとの一日を、写真と場所でそっと残そう。</p>
      <section className="notice">
        <h2>この端末に保存します</h2>
        <p>
          ブラウザデータの削除、端末の故障・紛失時には、バックアップがない記録を復元できない可能性があります。
        </p>
      </section>
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
function Today({
  date,
  posts,
  plushes,
  journal,
  settings,
  onNew,
  onJournal,
}: {
  date: string;
  posts: Post[];
  plushes: Plush[];
  journal?: Journal;
  settings: Settings;
  onNew: (post?: Post) => void;
  onJournal: () => void;
}) {
  const prompt = shouldPromptJournal(
    new Date(),
    settings.dayBoundaryTime,
    settings.journalPromptTime,
  );
  return (
    <>
      <p className="eyebrow">きょう</p>
      <h1>{formatDate(date)}</h1>
      <p className="lead">
        {posts.length
          ? `${posts.length}件の思い出があります`
          : "最初の思い出を残しましょう"}
      </p>
      <div className="actions">
        <button className="primary" onClick={() => onNew()}>
          ＋ 今の記録を残す
        </button>
        <button
          className={prompt ? "journal-cta prompt" : "journal-cta"}
          onClick={onJournal}
        >
          {journal
            ? "きょうの日記を見る・編集する"
            : prompt
              ? "きょうの日記を書く"
              : "きょうの日記"}
        </button>
      </div>
      {posts.length ? (
        <DayMap posts={posts} />
      ) : (
        <div className="empty">
          写真やひとこと、場所を記録すると、ここに一日が並びます。
        </div>
      )}
      <section className="stack">
        {posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            plushes={plushes}
            onEdit={() => onNew(p)}
          />
        ))}
      </section>
    </>
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
function Plushes({ plushes }: { plushes: Plush[] }) {
  const [editing, setEditing] = useState<Plush>();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<Blob>();
  const edit = (p?: Plush) => {
    setEditing(p);
    setName(p?.name ?? "");
    setIcon(p?.icon);
  };
  async function save() {
    if (!name.trim()) return;
    const now = new Date().toISOString();
    await db.plushes.put({
      id: editing?.id ?? crypto.randomUUID(),
      name: name.trim(),
      icon,
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
            {p.icon ? <BlobImage blob={p.icon} alt="" /> : <span>ぬ</span>}
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
            onChange={(e) => setIcon(e.target.files?.[0])}
          />
        </label>
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
        <button className="primary" disabled={!name.trim()} onClick={save}>
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

function PostEditor({
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
  const [body, setBody] = useState(post?.body ?? "");
  const [mode, setMode] = useState(post?.timeMode ?? "known");
  const [dateTime, setDateTime] = useState(
    post?.occurredLocalDateTime ?? localDateTime(),
  );
  const [manualDate, setManualDate] = useState(
    post?.manualLogicalDate ?? todayLogicalDate(settings.dayBoundaryTime),
  );
  const [selected, setSelected] = useState<string[]>(post?.plushIds ?? []);
  const [images, setImages] = useState<PostImage[]>(post?.images ?? []);
  const [place, setPlace] = useState<Place | undefined>(post?.place);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
        setPlace({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          name: "現在地",
          source: "current",
        });
        setBusy(false);
      },
      () => {
        setError("現在地を取得できませんでした。場所なしでも保存できます。");
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
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
    const value: Post = {
      id: post?.id ?? crypto.randomUUID(),
      body,
      plushIds: selected,
      images,
      timeMode: mode,
      occurredLocalDateTime: mode === "known" ? dateTime : undefined,
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
        ← 戻る
      </button>
      <p className="eyebrow">{post ? "投稿を編集" : "新しい投稿"}</p>
      <h1>思い出を残す</h1>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <section className="form-card">
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
              checked={mode === "known"}
              onChange={() => setMode("known")}
            />
            時刻あり
          </label>
          <label className="check">
            <input
              type="radio"
              checked={mode === "unknown"}
              onChange={() => setMode("unknown")}
            />
            時間不明
          </label>
          {mode === "known" ? (
            <input
              aria-label="行動日時"
              type="datetime-local"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
            />
          ) : (
            <input
              aria-label="論理日付"
              type="date"
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
            />
          )}
        </fieldset>
        <fieldset>
          <legend>いっしょにいたぬい</legend>
          {plushes.length ? (
            plushes.map((p) => (
              <label className="check" key={p.id}>
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
                {p.name}
              </label>
            ))
          ) : (
            <small>
              「ぬいたち」から登録できます。選択なしでも保存できます。
            </small>
          )}
        </fieldset>
        <fieldset>
          <legend>場所（任意）</legend>
          <button onClick={current} disabled={busy}>
            現在地を使う
          </button>
          <p>地図をタップして場所を指定できます。</p>
          <DayMap posts={[]} pick={place} onPick={setPlace} />
          {place ? (
            <>
              <label>
                場所名
                <input
                  value={place.name}
                  onChange={(e) => setPlace({ ...place, name: e.target.value })}
                />
              </label>
              <button onClick={() => setPlace(undefined)}>場所を外す</button>
            </>
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
            この投稿を削除
          </button>
        ) : null}
      </section>
    </>
  );
}

function JournalView({
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
    <>
      <button className="back" onClick={onBack}>
        ← 戻る
      </button>
      <p className="eyebrow">きょうの日記</p>
      <h1>{formatDate(date)}</h1>
      {names.length ? (
        <p className="lead">{names.join("・")}とおでかけ</p>
      ) : null}
      {changed ? (
        <p className="notice">日記の保存後に記録が更新されています。</p>
      ) : null}
      {posts.some((p) => p.place) ? (
        <DayMap posts={posts} />
      ) : (
        <div className="empty">場所付きの投稿がないため、地図は空です。</div>
      )}
      <section className="stack">
        {posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            plushes={plushes}
            onEdit={() => onEdit(p)}
          />
        ))}
      </section>
      <section className="form-card">
        <h2>一日のまとめ</h2>
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
    </>
  );
}
