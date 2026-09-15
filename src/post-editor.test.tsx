// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Plushes, PostCard, PostEditor, Today } from "./App";
import type { Plush, Post, Settings } from "./types";

const { mapOn, mapSetView, leafletMarker } = vi.hoisted(() => ({
  mapOn: vi.fn(),
  mapSetView: vi.fn(),
  leafletMarker: vi.fn(),
}));

vi.mock("leaflet", () => ({
  default: {
    map: () => ({
      setView(...args: unknown[]) {
        mapSetView(...args);
        return this;
      },
      on: mapOn,
      remove: vi.fn(),
    }),
    circleMarker: () => ({
      bindTooltip() {
        return this;
      },
      addTo() {
        return this;
      },
    }),
    marker: (...args: unknown[]) => {
      leafletMarker(...args);
      return {
        addTo() {
          return this;
        },
        on() {
          return this;
        },
        getLatLng() {
          return { lat: 35.6812, lng: 139.7671 };
        },
      };
    },
  },
}));

beforeAll(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:post-image"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

const settings: Settings = {
  id: "settings",
  dayBoundaryTime: "00:00",
  journalPromptTime: "21:00",
  timezone: "Asia/Tokyo",
  imageMaxLongEdge: 2048,
  imageQuality: 0.82,
  schemaVersion: 1,
  started: true,
};

const post: Post = {
  id: "post-1",
  body: "もとのひとこと",
  plushIds: ["plush-1"],
  images: [
    {
      id: "image-1",
      full: new Blob(["full"], { type: "image/webp" }),
      thumbnail: new Blob(["thumbnail"], { type: "image/webp" }),
      width: 1200,
      height: 900,
      mimeType: "image/webp",
      byteSize: 9,
      displayOrder: 0,
      isCover: true,
    },
  ],
  timeMode: "known",
  occurredLocalDateTime: "2026-09-14T15:30",
  place: {
    latitude: 35.6812,
    longitude: 139.7671,
    name: "東京駅",
    source: "map",
  },
  createdAt: "2026-09-14T06:30:00.000Z",
  updatedAt: "2026-09-14T06:30:00.000Z",
};

function Subject({ postToEdit }: { postToEdit?: Post }) {
  return (
    <PostEditor
      post={postToEdit}
      plushes={[
        {
          id: "plush-1",
          name: "くま",
          hidden: false,
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ]}
      settings={settings}
      onDone={() => undefined}
    />
  );
}

describe("投稿編集", () => {
  it("新規投稿では現在時刻が選ばれ、3つの行動時刻指定方法を選べる", () => {
    const view = render(<Subject />);
    const form = within(view.container);

    expect(
      view.container.querySelector(".form-card")?.firstElementChild,
    ).toHaveTextContent("いっしょにいたぬい");
    expect(form.getByRole("radio", { name: "現在時刻" })).toBeChecked();
    expect(form.queryByLabelText("行動日時")).not.toBeInTheDocument();

    fireEvent.click(form.getByRole("radio", { name: "時刻を設定する" }));
    expect(form.getByLabelText("行動日時")).toBeVisible();

    fireEvent.click(form.getByRole("radio", { name: "時刻を設定しない" }));
    expect(form.getByLabelText("論理日付")).toBeVisible();
  });

  it("きょう画面の編集ボタンから対象の投稿を渡す", () => {
    const onEdit = vi.fn();
    render(
      <Today
        date="2026-09-14"
        posts={[post]}
        plushes={[]}
        settings={settings}
        onNew={onEdit}
        onJournal={() => undefined}
      />,
    );

    screen.getByRole("button", { name: "投稿を編集" }).click();

    expect(onEdit).toHaveBeenCalledWith(post);
  });

  it("フォームの表示後に編集対象が届いても元の内容を反映する", () => {
    const view = render(<Subject />);
    const { rerender } = view;
    const form = within(view.container);

    rerender(<Subject postToEdit={post} />);

    expect(form.getByRole("textbox", { name: /ひとこと/ })).toHaveValue(
      "もとのひとこと",
    );
    expect(form.getByRole("radio", { name: "時刻を設定する" })).toBeChecked();
    expect(form.getByLabelText("行動日時")).toHaveValue(
      "2026-09-14T15:30",
    );
    expect(form.getByRole("checkbox", { name: "くま" })).toBeChecked();
    expect(form.getByAltText("選択写真 1")).toHaveAttribute(
      "src",
      "blob:post-image",
    );
    expect(form.getByRole("textbox", { name: "場所" })).toHaveValue(
      "東京駅",
    );
    expect(form.getByText("投稿を編集")).toBeInTheDocument();
  });
});

describe("投稿のぬい選択", () => {
  it("ぬいのアイコンと名前を表示し、選択状態をチェックで示す", () => {
    const view = render(<Subject />);
    const form = within(view.container);
    const choice = form.getByRole("checkbox", { name: "くま" });

    expect(choice).not.toBeChecked();
    expect(form.getByText("くま")).toHaveClass("plush-choice-name");
    expect(view.container.querySelector(".plush-choice-check")).toHaveTextContent("✓");

    fireEvent.click(choice);

    expect(choice).toBeChecked();
    expect(choice).toBeChecked();
  });
});

describe("投稿の場所選択", () => {
  it("場所を記録するが初期選択され、記録しない場合は場所選択を隠す", async () => {
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: vi.fn().mockResolvedValue({ state: "prompt" }) },
    });
    const view = render(<Subject postToEdit={post} />);
    const form = within(view.container);

    expect(
      form.getByRole("radio", { name: "場所を記録する" }),
    ).toBeChecked();
    expect(form.getByRole("textbox", { name: "場所" })).toHaveValue("東京駅");

    fireEvent.click(form.getByRole("radio", { name: "場所を記録しない" }));

    await waitFor(() =>
      expect(
        form.getByRole("radio", { name: "場所を記録しない" }),
      ).toBeChecked(),
    );
    expect(form.queryByLabelText("場所を選択する地図")).not.toBeInTheDocument();
    expect(form.queryByRole("textbox", { name: "場所" })).not.toBeInTheDocument();
    expect(form.getByText("この投稿には場所を保存しません。")).toBeVisible();
  });

  it("位置情報が許可済みなら現在地を初期場所にする", async () => {
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 35.6812, longitude: 139.7671 } }),
    );
    const query = vi.fn().mockResolvedValue({ state: "granted" });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query },
    });

    const view = render(<Subject />);
    const form = within(view.container);

    await waitFor(() =>
      expect(form.getByRole("textbox", { name: "場所" })).toHaveValue(
        "ここで遊んだよ",
      ),
    );
    expect(query).toHaveBeenCalledWith({ name: "geolocation" });
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(mapSetView).toHaveBeenLastCalledWith([35.6812, 139.7671], 13);
  });

  it("位置情報が未許可なら自動で取得を要求しない", async () => {
    const getCurrentPosition = vi.fn();
    const query = vi.fn().mockResolvedValue({ state: "prompt" });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query },
    });

    const view = render(<Subject />);

    await waitFor(() => expect(query).toHaveBeenCalledOnce());
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(
      within(view.container).queryByRole("textbox", { name: "場所" }),
    ).not.toBeInTheDocument();
  });

  it("現在地付近へ移動し、ドラッグ可能なピンを表示する", () => {
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 35.6812, longitude: 139.7671 } }),
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: vi.fn().mockResolvedValue({ state: "prompt" }) },
    });
    const view = render(<Subject />);
    const form = within(view.container);
    const locationButton = form.getByRole("button", {
      name: "現在地付近を表示",
    });

    expect(locationButton.closest(".map-stage")).toContainElement(
      form.getByLabelText("場所を選択する地図"),
    );

    fireEvent.click(locationButton);

    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(mapSetView).toHaveBeenLastCalledWith([35.6812, 139.7671], 13);
    expect(leafletMarker).toHaveBeenLastCalledWith(
      [35.6812, 139.7671],
      expect.objectContaining({ draggable: true }),
    );
    expect(form.getByRole("textbox", { name: "場所" })).toHaveValue(
      "ここで遊んだよ",
    );
    expect(form.getByLabelText("場所を選択する地図")).toBeInTheDocument();
    expect(
      form.getByText("地図をタップするか、ピンをドラッグして場所を指定できます。"),
    ).toBeVisible();
  });

  it("地図をタップして立てたピンの場所を既定名で表示する", () => {
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: vi.fn().mockResolvedValue({ state: "prompt" }) },
    });
    const view = render(<Subject />);
    const clickHandler = [...mapOn.mock.calls]
      .reverse()
      .find(([eventName]) => eventName === "click")?.[1] as
      | ((event: { latlng: { lat: number; lng: number } }) => void)
      | undefined;

    expect(clickHandler).toBeDefined();
    act(() => clickHandler?.({ latlng: { lat: 35.7, lng: 139.8 } }));

    expect(
      within(view.container).getByRole("textbox", { name: "場所" }),
    ).toHaveValue("ここで遊んだよ");
    expect(leafletMarker).toHaveBeenLastCalledWith(
      [35.7, 139.8],
      expect.objectContaining({ draggable: true }),
    );
  });
});

describe("投稿の同行表示", () => {
  it("名前を連結せず、登録画像または既定の円形アイコンを並べる", () => {
    const companions: Plush[] = [
      {
        id: "plush-1",
        name: "くま",
        icon: new Blob(["icon"], { type: "image/webp" }),
        themeColor: "#3a7bd5",
        hidden: false,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
      {
        id: "plush-2",
        name: "うさぎ",
        themeColor: "#d55a87",
        hidden: false,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
    ];

    const { container } = render(
      <PostCard
        post={{ ...post, plushIds: companions.map((plush) => plush.id) }}
        plushes={companions}
        onEdit={() => undefined}
      />,
    );

    expect(screen.getByLabelText("くま、うさぎといっしょ")).toBeVisible();
    expect(screen.queryByText("くまとうさぎといっしょ")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".companion-icon")).toHaveLength(2);
    expect(container.querySelector(".companion-icon img")).toHaveAttribute(
      "src",
      "blob:post-image",
    );
    expect(container.querySelector(".plush-icon.companion-icon")).toHaveStyle({
      borderColor: "#3a7bd5",
    });
    expect(container.querySelector(".fallback-icon")).toHaveStyle({
      borderColor: "#d55a87",
    });
    expect(within(container).getByText("ぬ")).toBeInTheDocument();
    expect(within(container).getByText("といっしょ")).toBeInTheDocument();
  });
});

describe("投稿画像の拡大表示", () => {
  it("投稿画像を選択して拡大し、Escapeキーで閉じて元の操作へ戻る", () => {
    const view = render(
      <PostCard post={post} plushes={[]} onEdit={() => undefined} />,
    );
    const card = within(view.container);
    const trigger = card.getByRole("button", { name: "投稿写真 1を拡大" });

    fireEvent.click(trigger);

    expect(
      card.getByRole("dialog", { name: "投稿写真 1の拡大表示" }),
    ).toBeVisible();
    expect(card.getByAltText("拡大した投稿写真 1")).toBeVisible();
    expect(card.getByRole("button", { name: "拡大表示を閉じる" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(
      card.queryByRole("dialog", { name: "投稿写真 1の拡大表示" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe("ぬいぐるみのテーマカラー設定", () => {
  it("新規登録時は透明で、透明を解除すると色を選択できる", () => {
    render(<Plushes plushes={[]} />);

    const transparent = screen.getByRole("checkbox", {
      name: "囲み線を透明にする",
    });
    const color = screen.getByLabelText("テーマカラー");

    expect(transparent).toBeChecked();
    expect(color).toBeDisabled();

    fireEvent.click(transparent);

    expect(transparent).not.toBeChecked();
    expect(color).toBeEnabled();
    expect(color).toHaveValue("#9a5438");
  });

  it("登録済みのテーマカラーを編集画面へ反映する", () => {
    const view = render(
      <Plushes
        plushes={[
          {
            id: "plush-1",
            name: "くま",
            themeColor: "#3a7bd5",
            hidden: false,
            createdAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
          },
        ]}
      />,
    );
    const form = within(view.container);

    fireEvent.click(form.getByRole("button", { name: /くま/ }));

    expect(
      form.getByRole("checkbox", { name: "囲み線を透明にする" }),
    ).not.toBeChecked();
    expect(form.getByLabelText("テーマカラー")).toHaveValue("#3a7bd5");
  });
});
