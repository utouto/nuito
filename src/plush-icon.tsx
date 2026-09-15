import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  adjustPlushIconCrop,
  clampPlushIconCrop,
  DEFAULT_PLUSH_ICON_CROP,
} from "./plush-icon-crop";
import type { PlushIconCrop } from "./types";

function useBlobUrl(blob: Blob) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

export function PlushIcon({
  blob,
  crop = DEFAULT_PLUSH_ICON_CROP,
  alt,
  className = "",
}: {
  blob: Blob;
  crop?: PlushIconCrop;
  alt: string;
  className?: string;
}) {
  const url = useBlobUrl(blob);
  const safe = clampPlushIconCrop(crop);
  const style: CSSProperties = {
    width: `${safe.zoom * 100}%`,
    height: `${safe.zoom * 100}%`,
    objectPosition: `${safe.x}% ${safe.y}%`,
  };
  return (
    <span className={`plush-icon ${className}`.trim()}>
      {url ? <img src={url} alt={alt} style={style} /> : null}
    </span>
  );
}

export function PlushIconEditor({
  blob,
  crop,
  onChange,
  onApply,
  onCancel,
}: {
  blob: Blob;
  crop: PlushIconCrop;
  onChange: (crop: PlushIconCrop) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  type Point = { x: number; y: number };
  type Gesture = {
    crop: PlushIconCrop;
    center: Point;
    distance: number;
  };
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | undefined>(undefined);
  const latestCrop = useRef(crop);
  latestCrop.current = crop;
  const pointerSnapshot = () => {
    const points = [...pointers.current.values()].slice(0, 2);
    if (!points.length) return undefined;
    const center =
      points.length === 1
        ? points[0]
        : {
            x: (points[0].x + points[1].x) / 2,
            y: (points[0].y + points[1].y) / 2,
          };
    return {
      center,
      distance:
        points.length === 2
          ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
          : 0,
    };
  };
  const beginGesture = () => {
    const snapshot = pointerSnapshot();
    if (snapshot)
      gesture.current = { crop: latestCrop.current, ...snapshot };
  };
  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    beginGesture();
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const snapshot = pointerSnapshot();
    if (!snapshot) return;
    const start = gesture.current;
    const bounds = event.currentTarget.getBoundingClientRect();
    const scale =
      start.distance > 0 && snapshot.distance > 0
        ? snapshot.distance / start.distance
        : 1;
    const next = adjustPlushIconCrop(
      start.crop,
      {
        x: snapshot.center.x - start.center.x,
        y: snapshot.center.y - start.center.y,
      },
      { width: bounds.width, height: bounds.height },
      scale,
    );
    latestCrop.current = next;
    onChange(next);
  };
  const pointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    beginGesture();
  };
  const update = (key: keyof PlushIconCrop, value: number) =>
    onChange(clampPlushIconCrop({ ...crop, [key]: value }));
  return (
    <fieldset className="icon-editor">
      <legend>アイコンを調整</legend>
      <p id="icon-editor-help">
        円の内側がアイコンになります。画像をドラッグして位置を、2本指でピンチして大きさを調整できます。元画像は切り取りません。
      </p>
      <div className="icon-preview-row" aria-describedby="icon-editor-help">
        <div
          className="icon-gesture-surface"
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerEnd}
          onPointerCancel={pointerEnd}
        >
          <PlushIcon blob={blob} crop={crop} alt="円形アイコンのプレビュー" />
          <span aria-hidden="true">ドラッグ・ピンチで調整</span>
        </div>
        <div>
          <strong>プレビュー</strong>
          <small>一覧では右の小さいサイズで表示されます</small>
          <PlushIcon
            blob={blob}
            crop={crop}
            alt="一覧サイズのプレビュー"
            className="small"
          />
        </div>
      </div>
      <label>
        横の位置
        <input
          type="range"
          min="0"
          max="100"
          value={crop.x}
          onChange={(event) => update("x", Number(event.target.value))}
        />
      </label>
      <label>
        縦の位置
        <input
          type="range"
          min="0"
          max="100"
          value={crop.y}
          onChange={(event) => update("y", Number(event.target.value))}
        />
      </label>
      <label>
        拡大
        <input
          type="range"
          min="1"
          max="3"
          step="0.05"
          value={crop.zoom}
          onChange={(event) => update("zoom", Number(event.target.value))}
        />
      </label>
      <div className="icon-editor-actions">
        <button type="button" onClick={onCancel}>
          キャンセル
        </button>
        <button type="button" className="primary" onClick={onApply}>
          この位置にする
        </button>
      </div>
    </fieldset>
  );
}
