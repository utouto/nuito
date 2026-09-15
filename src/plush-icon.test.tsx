// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  adjustPlushIconCrop,
  clampPlushIconCrop,
  DEFAULT_PLUSH_ICON_CROP,
} from "./plush-icon-crop";
import {
  DEFAULT_PLUSH_THEME_COLOR,
  PlushIcon,
  PlushIconEditor,
} from "./plush-icon";

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
  it("囲み線は既定で透明になり、テーマカラーを反映する", () => {
    const { rerender } = render(
      <PlushIcon
        blob={new Blob(["image"], { type: "image/webp" })}
        alt="ぬいアイコン"
      />,
    );

    expect(
      screen.getByAltText("ぬいアイコン").parentElement?.style.borderColor,
    ).toBe(DEFAULT_PLUSH_THEME_COLOR);

    rerender(
      <PlushIcon
        blob={new Blob(["image"], { type: "image/webp" })}
        alt="ぬいアイコン"
        themeColor="#3a7bd5"
      />,
    );

    expect(
      screen.getByAltText("ぬいアイコン").parentElement?.style.borderColor,
    ).toBe("rgb(58, 123, 213)");
  });

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
    ).toHaveAttribute("draggable", "false");
    expect(
      screen.getByAltText("円形アイコンのプレビュー"),
    ).toHaveStyle({
      objectPosition: "50% 50%",
      transform: "translate(-50%, -50%) scale(1)",
      transformOrigin: "50% 50%",
    });
    expect(
      screen.getByAltText("円形アイコンのプレビュー").parentElement
        ?.parentElement,
    ).toHaveClass("icon-gesture-surface");
    expect(screen.getByText("プレビュー").parentElement).toHaveClass(
      "icon-preview-details",
    );
    expect(screen.getByText(/ドラッグして位置/)).toBeInTheDocument();
    expect(screen.getByText("ドラッグ・ピンチで調整")).toHaveClass(
      "icon-gesture-hint",
    );
    fireEvent.change(screen.getByRole("slider", { name: "横の位置" }), {
      target: { value: "75" },
    });
    expect(onChange).toHaveBeenCalledWith({ x: 75, y: 50, zoom: 1 });
  });

  it("操作面での縦ドラッグを位置変更として通知する", () => {
    const onChange = vi.fn();
    const { container } = render(
      <PlushIconEditor
        blob={new Blob(["image"], { type: "image/webp" })}
        crop={DEFAULT_PLUSH_ICON_CROP}
        onChange={onChange}
        onApply={() => undefined}
        onCancel={() => undefined}
      />,
    );
    const surface = container.querySelector(
      ".icon-gesture-surface",
    ) as HTMLDivElement;
    surface.setPointerCapture = vi.fn();
    surface.getBoundingClientRect = vi.fn(
      () =>
        ({
          width: 200,
          height: 200,
        }) as DOMRect,
    );

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 100, clientY: 140 });

    expect(onChange).toHaveBeenLastCalledWith({ x: 50, y: 30, zoom: 1 });
  });

  it("拡大時は縦位置を拡大の基準点に反映する", () => {
    render(
      <PlushIconEditor
        blob={new Blob(["image"], { type: "image/webp" })}
        crop={{ x: 50, y: 25, zoom: 2 }}
        onChange={() => undefined}
        onApply={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(
      screen.getAllByAltText("円形アイコンのプレビュー").at(-1),
    ).toHaveStyle({
      transform: "translate(-50%, -50%) scale(2)",
      transformOrigin: "50% 25%",
    });
  });
});
