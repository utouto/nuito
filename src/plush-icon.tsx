import { useEffect, useState, type CSSProperties } from "react";
import {
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
  const update = (key: keyof PlushIconCrop, value: number) =>
    onChange(clampPlushIconCrop({ ...crop, [key]: value }));
  return (
    <fieldset className="icon-editor">
      <legend>アイコンを調整</legend>
      <p id="icon-editor-help">
        円の内側がアイコンとして表示されます。元画像は切り取らずに保存します。
      </p>
      <div className="icon-preview-row" aria-describedby="icon-editor-help">
        <PlushIcon blob={blob} crop={crop} alt="円形アイコンのプレビュー" />
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
