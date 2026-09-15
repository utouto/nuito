// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  adjustPlushIconCrop,
  clampPlushIconCrop,
  DEFAULT_PLUSH_ICON_CROP,
} from "./plush-icon-crop";
import { PlushIconEditor } from "./plush-icon";

beforeAll(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

describe("ぬいぐるみアイコン調整", () => {
  it("位置と拡大率を保存可能な範囲へ収める", () => {
    expect(clampPlushIconCrop({ x: -10, y: 120, zoom: 5 })).toEqual({
      x: 0,
      y: 100,
      zoom: 3,
    });
  });

  it("ドラッグとピンチから表示位置と拡大率を計算する", () => {
    expect(
      adjustPlushIconCrop(
        DEFAULT_PLUSH_ICON_CROP,
        { x: 20, y: -10 },
        { width: 200, height: 200 },
        2,
      ),
    ).toEqual({ x: 45, y: 52.5, zoom: 2 });
  });

  it("円形プレビューを示し、スライダー変更を通知する", () => {
    const onChange = vi.fn();
    render(
      <PlushIconEditor
        blob={new Blob(["image"], { type: "image/webp" })}
        crop={DEFAULT_PLUSH_ICON_CROP}
        onChange={onChange}
        onApply={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(
      screen.getByAltText("円形アイコンのプレビュー"),
    ).toBeInTheDocument();
    expect(
      screen.getByAltText("円形アイコンのプレビュー").parentElement
        ?.parentElement,
    ).toHaveClass("icon-gesture-surface");
    expect(screen.getByText("プレビュー").parentElement).toHaveClass(
      "icon-preview-details",
    );
    expect(screen.getByText(/ドラッグして位置/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("slider", { name: "横の位置" }), {
      target: { value: "75" },
    });
    expect(onChange).toHaveBeenCalledWith({ x: 75, y: 50, zoom: 1 });
  });
});
