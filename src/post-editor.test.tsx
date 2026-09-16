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
import {
  JournalView,
  History,
  Plushes,
  PostCard,
  PostEditor,
  SettingsView,
  Today,
} from "./App";
import { plushNameInitial } from "./plush-name";
import { movePostImage, reorderPostImages } from "./post-images";
import { db } from "./db";
import type { Plush, Post, Settings } from "./types";

const {
  attributionSetPosition,
  leafletDivIcon,
  leafletMap,
  leafletMarker,
  markerOn,
  leafletPolyline,
  mapOn,
  mapPanBy,
  mapSetView,
  markerSetZIndexOffset,
  zoomSetPosition,
} = vi.hoisted(() => ({
  attributionSetPosition: vi.fn(),
  leafletMap: vi.fn(),
  mapOn: vi.fn(),
  mapPanBy: vi.fn(),
  mapSetView: vi.fn(),
  markerSetZIndexOffset: vi.fn(),
  zoomSetPosition: vi.fn(),
  leafletDivIcon: vi.fn((options) => options),
  leafletMarker: vi.fn(),
  markerOn: vi.fn(),
  leafletPolyline: vi.fn(),
}));

vi.mock("leaflet", () => ({
  default: {
    map: (...args: unknown[]) => {
      leafletMap(...args);
      return {
        attributionControl: { setPosition: attributionSetPosition },
        zoomControl: { setPosition: zoomSetPosition },
        setView(...args: unknown[]) {
          mapSetView(...args);
          return this;
        },
        getZoom: () => 11,
        panBy: mapPanBy,
        on: mapOn,
        fitBounds: vi.fn(),
        remove: vi.fn(),
      };
    },
    circleMarker: () => ({
      bindTooltip() {
        return this;
      },
      addTo() {
        return this;
      },
    }),
    divIcon: leafletDivIcon,
    latLngBounds: vi.fn((points) => points),
    polyline: (...args: unknown[]) => {
      leafletPolyline(...args);
      return { addTo: vi.fn() };
    },
    marker: (...args: unknown[]) => {
      leafletMarker(...args);
      return {
        addTo() {
          return this;
        },
        on(...args: unknown[]) {
          markerOn(...args);
          return this;
        },
        bindTooltip() {
          return this;
        },
        getLatLng() {
          return { lat: 35.6812, lng: 139.7671 };
        },
        setZIndexOffset: markerSetZIndexOffset,
        getElement() {
          return document.createElement("div");
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
    expect(
      form.getByRole("radio", { name: "現在時刻" }).closest("label")
        ?.nextElementSibling,
    ).toHaveTextContent("保存時の現在日時を記録します。");

    const manualChoice = form.getByRole("radio", {
      name: "時刻を手動設定する",
    });
    fireEvent.click(manualChoice);
    const dateTimeInput = form.getByLabelText("行動日時");
    expect(dateTimeInput).toBeVisible();
    expect(manualChoice.closest("label")?.nextElementSibling).toBe(
      dateTimeInput,
    );

    const unknownChoice = form.getByRole("radio", {
      name: "時刻を設定しない",
    });
    fireEvent.click(unknownChoice);
    const logicalDateInput = form.getByLabelText("論理日付");
    expect(logicalDateInput).toBeVisible();
    expect(unknownChoice.closest("label")?.nextElementSibling).toBe(
      logicalDateInput,
    );
  });

  it("1枚目のピン表示画像を中央から調整できる", () => {
    const view = render(<Subject postToEdit={post} />);
    const form = within(view.container);
    const fileInput = form.getByLabelText("写真を追加");
    expect(fileInput).toHaveClass("photo-file-input");
    expect(
      fileInput.closest("label")?.querySelector("[data-testid='AddAPhotoIcon']"),
    ).toBeInTheDocument();

    const adjustButton = form.getByRole("button", {
      name: "ピンに表示する画像を調整",
    });
    expect(
      adjustButton.querySelector("[data-testid='EditRoundedIcon']"),
    ).toBeInTheDocument();
    expect(
      form
        .getByRole("button", { name: "選択写真 1を削除" })
        .querySelector("[data-testid='HighlightOffIcon']"),
    ).toBeInTheDocument();
    fireEvent.click(adjustButton);
    expect(
      form.getByRole("group", { name: "ピンに表示する画像を調整" }),
    ).toBeVisible();
    expect(form.getByLabelText("横の位置")).toHaveValue("50");
    expect(form.getByLabelText("縦の位置")).toHaveValue("50");
    expect(view.container).not.toHaveTextContent("写真ピン");
  });

  it("画像位置の調整を投稿保存時にそのまま保存する", async () => {
    const put = vi.spyOn(db.posts, "put").mockResolvedValue("post-1");
    const request = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 401 }));
    const view = render(<Subject postToEdit={post} />);
    const form = within(view.container);

    fireEvent.click(
      form.getByRole("button", { name: "ピンに表示する画像を調整" }),
    );
    fireEvent.change(form.getByLabelText("横の位置"), {
      target: { value: "35" },
    });
    expect(
      form.queryByRole("button", { name: "この位置にする" }),
    ).not.toBeInTheDocument();
    fireEvent.click(form.getByRole("button", { name: "保存する" }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0][0].images[0].pinCrop).toEqual({
      x: 35,
      y: 50,
      zoom: 1,
    });
    put.mockRestore();
    request.mockRestore();
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

    const page = within(screen.getByRole("region", { name: /2026年9月14日/ }));
    fireEvent.click(
      page.getByRole("button", { name: "おもいでドロワーを開く" }),
    );
    fireEvent.click(page.getByRole("button", { name: "おもいでを編集" }));

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
    expect(
      form.getByRole("radio", { name: "時刻を手動設定する" }),
    ).toBeChecked();
    expect(form.getByLabelText("行動日時")).toHaveValue("2026-09-14T15:30");
    expect(form.getByRole("checkbox", { name: "くま" })).toBeChecked();
    expect(form.getByAltText("選択写真 1")).toHaveAttribute(
      "src",
      "blob:post-image",
    );
    expect(form.getByRole("textbox", { name: "場所" })).toHaveValue("東京駅");
    expect(
      form.getByRole("heading", { name: "おもいでを編集" }),
    ).toHaveClass("page-title");
  });
});

describe("きょうの投稿ドロワー", () => {
  it("投稿ドロワーを下部に見せ、ハンドルで開閉する", () => {
    const view = render(
      <Today
        date="2026-09-14"
        posts={[post]}
        plushes={[]}
        settings={settings}
        onNew={() => undefined}
        onJournal={() => undefined}
      />,
    );
    const page = within(view.container);
    const drawer = view.container.querySelector(".today-post-drawer");
    const toggle = page.getByRole("button", {
      name: "おもいでドロワーを開く",
    });

    expect(drawer).toHaveAttribute("aria-label", "きょうのおもいで");
    expect(drawer).toBeVisible();
    expect(drawer).not.toHaveAttribute("hidden");
    expect(
      drawer?.querySelector(".today-drawer-scroll > .stack"),
    ).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);

    expect(drawer).toBeVisible();
    expect(view.container.querySelector(".today-map-view")).toHaveClass(
      "drawer-open",
    );
    expect(page.getByText("もとのひとこと")).toBeVisible();
    expect(
      page.getByRole("button", { name: "おもいでドロワーを閉じる" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("上方向のスワイプでドロワーを開き、日記ボタンを退避する", () => {
    const onDrawerOpenChange = vi.fn();
    const view = render(
      <Today
        date="2026-09-14"
        posts={[post]}
        plushes={[]}
        settings={settings}
        onNew={() => undefined}
        onJournal={() => undefined}
        onDrawerOpenChange={onDrawerOpenChange}
      />,
    );
    const page = within(view.container);
    const handle = page.getByRole("button", {
      name: "おもいでドロワーを開く",
    });

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 300 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 240 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 240 });

    expect(view.container.querySelector(".today-post-drawer")).toHaveClass(
      "open",
    );
    expect(view.container.querySelector(".today-journal-button")).toHaveClass(
      "drawer-open",
    );
    expect(onDrawerOpenChange).toHaveBeenLastCalledWith(true);
  });

  it("ドロワー開閉では地図を作り直さない", () => {
    const view = render(
      <Today
        date="2026-09-14"
        posts={[post]}
        plushes={[]}
        settings={settings}
        onNew={() => undefined}
        onJournal={() => undefined}
      />,
    );
    const initialMapCalls = leafletMap.mock.calls.length;

    fireEvent.click(
      within(view.container).getByRole("button", {
        name: "おもいでドロワーを開く",
      }),
    );

    expect(leafletMap).toHaveBeenCalledTimes(initialMapCalls);
  });

  it("場所付き投稿を選ぶと現在の縮尺を保って投稿地点を中央にする", () => {
    const view = render(
      <Today
        date="2026-09-14"
        posts={[post]}
        plushes={[]}
        settings={settings}
        onNew={() => undefined}
        onJournal={() => undefined}
      />,
    );
    const page = within(view.container);
    fireEvent.click(
      page.getByRole("button", { name: "おもいでドロワーを開く" }),
    );
    vi.spyOn(
      page.getByLabelText("日別地図"),
      "getBoundingClientRect",
    ).mockReturnValue({
      top: 0,
      right: 400,
      bottom: 800,
      left: 0,
      width: 400,
      height: 800,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    });
    vi.spyOn(
      view.container.querySelector("#today-post-drawer")!,
      "getBoundingClientRect",
    ).mockReturnValue({
      top: 300,
      right: 400,
      bottom: 800,
      left: 0,
      width: 400,
      height: 500,
      x: 0,
      y: 300,
      toJSON: () => undefined,
    });

    const postCard = page.getByLabelText("東京駅を地図の中心に表示");
    fireEvent.click(postCard);

    expect(mapSetView).toHaveBeenLastCalledWith([35.6812, 139.7671], 11, {
      animate: false,
    });
    expect(mapPanBy).toHaveBeenLastCalledWith([0, 250], { animate: false });
    expect(postCard).toHaveClass("selected");

    mapPanBy.mockClear();
    fireEvent.click(postCard);
    expect(mapPanBy).toHaveBeenCalledWith([0, 250], { animate: false });
  });

  it("件数と上部投稿ボタンを表示せず、本アイコンで日記を開く", () => {
    const onJournal = vi.fn();
    const view = render(
      <Today
        date="2026-09-14"
        posts={[post]}
        plushes={[]}
        settings={settings}
        onNew={() => undefined}
        onJournal={onJournal}
      />,
    );
    const page = within(view.container);

    expect(page.queryByText("1件の思い出があります")).not.toBeInTheDocument();
    expect(
      page.queryByRole("button", { name: "＋ 今の記録を残す" }),
    ).not.toBeInTheDocument();

    const journalButton = page.getByRole("button", {
      name: "きょうの日記を見る",
    });
    expect(journalButton.querySelector("svg")).toBeInTheDocument();
    expect(
      journalButton.querySelector("[data-testid='ImportContactsIcon']"),
    ).toBeInTheDocument();
    fireEvent.click(journalButton);
    expect(onJournal).toHaveBeenCalledOnce();
  });

  it("地図の投稿ピンを中央へ移動してからドロワーの該当投稿を表示する", () => {
    const frames: FrameRequestCallback[] = [];
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });
    const view = render(
      <Today
        date="2026-09-14"
        posts={[post]}
        plushes={[]}
        settings={settings}
        onNew={() => undefined}
        onJournal={() => undefined}
      />,
    );
    const markerClick = markerOn.mock.calls.find(([event]) => event === "click")?.[1] as (() => void) | undefined;
    act(() => markerClick?.());

    expect(markerSetZIndexOffset).toHaveBeenLastCalledWith(1000);
    expect(mapSetView).toHaveBeenLastCalledWith([35.6812, 139.7671], 11, {
      animate: false,
    });
    expect(
      within(view.container).getByRole("button", {
        name: "おもいでドロワーを開く",
      }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(view.container.querySelector("#post-post-1")).toHaveClass("selected");

    act(() => frames.shift()?.(0));
    expect(
      within(view.container).getByRole("button", {
        name: "おもいでドロワーを閉じる",
      }),
    ).toHaveAttribute("aria-expanded", "true");
    requestAnimationFrame.mockRestore();
  });
});

describe("日別地図の投稿ピン", () => {
  it("後から選択した投稿ピンを最前面に切り替える", () => {
    markerSetZIndexOffset.mockClear();
    const second = {
      ...post,
      id: "post-2",
      place: { ...post.place!, latitude: 35.7, longitude: 139.75 },
    };
    render(
      <Today
        date="2026-09-14"
        posts={[post, second]}
        plushes={[]}
        settings={settings}
        onNew={() => undefined}
        onJournal={() => undefined}
      />,
    );
    const clicks = markerOn.mock.calls
      .filter(([event]) => event === "click")
      .slice(-2)
      .map(([, handler]) => handler as () => void);

    act(() => clicks[0]());
    act(() => clicks[1]());

    expect(markerSetZIndexOffset.mock.calls).toEqual([[1000], [0], [1000]]);
  });

  it("きょう画面では帰属表示を右上、拡大縮小を右中央へ配置する", () => {
    render(
      <Today
        date="2026-09-14"
        posts={[post]}
        plushes={[]}
        settings={settings}
        onNew={() => undefined}
        onJournal={() => undefined}
      />,
    );

    expect(attributionSetPosition).toHaveBeenLastCalledWith("topright");
    expect(zoomSetPosition).toHaveBeenLastCalledWith("topright");
  });
  it("時刻順の地点を補間して緩やかな曲線の点線にする", () => {
    const second = {
      ...post,
      id: "post-2",
      occurredLocalDateTime: "2026-09-14T16:30",
      place: { ...post.place!, latitude: 35.7, longitude: 139.75 },
    };
    const third = {
      ...post,
      id: "post-3",
      occurredLocalDateTime: "2026-09-14T17:30",
      place: { ...post.place!, latitude: 35.72, longitude: 139.8 },
    };

    const view = render(
      <Today
        date="2026-09-14"
        posts={[third, post, second]}
        plushes={[]}
        settings={settings}
        onNew={() => undefined}
        onJournal={() => undefined}
      />,
    );

    const [route, options] = leafletPolyline.mock.calls.at(-1)!;
    expect(route).toHaveLength(33);
    expect(route[0]).toEqual([35.6812, 139.7671]);
    expect(route.at(-1)).toEqual([35.72, 139.8]);
    expect(route[1]).not.toEqual([
      35.6812 + (35.7 - 35.6812) / 16,
      139.7671 + (139.75 - 139.7671) / 16,
    ]);
    expect(options).toEqual(expect.objectContaining({ dashArray: "7 10" }));
    expect(view.container).not.toHaveTextContent(
      "点線は実際の移動経路ではなく、思い出の順番です。",
    );
  });

  it("投稿がなく位置情報が許可済みなら現在地を中心にする", async () => {
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 34.6937, longitude: 135.5023 } }),
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: vi.fn().mockResolvedValue({ state: "granted" }) },
    });

    render(
      <Today
        date="2026-09-14"
        posts={[]}
        plushes={[]}
        settings={settings}
        onNew={() => undefined}
        onJournal={() => undefined}
      />,
    );

    await waitFor(() =>
      expect(mapSetView).toHaveBeenLastCalledWith([34.6937, 135.5023], 13),
    );
    expect(getCurrentPosition).toHaveBeenCalledOnce();
  });

  it("投稿がなく位置情報が未許可なら自動で権限を要求しない", async () => {
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: vi.fn().mockResolvedValue({ state: "prompt" }) },
    });

    render(
      <Today
        date="2026-09-14"
        posts={[]}
        plushes={[]}
        settings={settings}
        onNew={() => undefined}
        onJournal={() => undefined}
      />,
    );

    await act(async () => undefined);
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("写真付き投稿は1枚目を円形の写真ピンに表示する", () => {
    render(
      <Today
        date="2026-09-14"
        posts={[{ ...post, plushIds: ["plush-1", "plush-2"] }]}
        plushes={[
          {
            id: "plush-1",
            name: "くま",
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
        ]}
        settings={settings}
        onNew={() => undefined}
        onJournal={() => undefined}
      />,
    );

    expect(leafletDivIcon).toHaveBeenCalledWith(
      expect.objectContaining({
        className: "post-map-marker photo-post-map-marker",
        html: expect.stringMatching(
          /<img src="blob:post-image".*object-position:50% 50%;.*scale\(1\).*<em><i style="background:conic-gradient\(/,
        ),
        iconSize: [64, 72],
        iconAnchor: [32, 72],
      }),
    );
  });

  it("写真なし投稿の地点円は茶色い外枠を使わない", () => {
    render(
      <Today
        date="2026-09-14"
        posts={[{ ...post, images: [] }]}
        plushes={[]}
        settings={settings}
        onNew={() => undefined}
        onJournal={() => undefined}
      />,
    );

    expect(leafletDivIcon).toHaveBeenCalledWith(
      expect.objectContaining({
        className: "post-map-marker",
        html: '<span><i style="background:#687076"></i></span>',
      }),
    );
  });
});

describe("投稿写真の順序", () => {
  it("移動後の1枚目を代表写真にする", () => {
    const second = { ...post.images[0], id: "image-2", displayOrder: 1 };
    const result = reorderPostImages([post.images[0], second], 1, -1);
    expect(result.map((image) => image.id)).toEqual(["image-2", "image-1"]);
    expect(result.map((image) => image.isCover)).toEqual([true, false]);
  });

  it("ドラッグ先の位置へ写真を移動する", () => {
    const images = ["image-1", "image-2", "image-3"].map((id, index) => ({
      ...post.images[0],
      id,
      displayOrder: index,
      isCover: index === 0,
    }));

    const result = movePostImage(images, 0, 2);

    expect(result.map((image) => image.id)).toEqual([
      "image-2",
      "image-3",
      "image-1",
    ]);
    expect(result.map((image) => image.displayOrder)).toEqual([0, 1, 2]);
    expect(result.map((image) => image.isCover)).toEqual([true, false, false]);
  });

  it("写真を左へスワイプすると1つ前へ移動する", () => {
    const second = { ...post.images[0], id: "image-2", displayOrder: 1 };
    const view = render(<Subject postToEdit={{ ...post, images: [post.images[0], second] }} />);
    const photo = within(view.container).getByLabelText(
      "選択写真 2。ドラッグまたは左右スワイプで並び替え",
    );

    fireEvent.pointerDown(photo, {
      pointerType: "touch",
      clientX: 100,
      clientY: 20,
    });
    fireEvent.pointerUp(photo, {
      pointerType: "touch",
      clientX: 40,
      clientY: 22,
    });

    expect(photo).toHaveAttribute(
      "aria-label",
      "選択写真 1。ドラッグまたは左右スワイプで並び替え",
    );
  });

  it("写真を別の写真へドラッグするとドロップ位置へ移動する", () => {
    const images = ["image-1", "image-2", "image-3"].map((id, index) => ({
      ...post.images[0],
      id,
      displayOrder: index,
      isCover: index === 0,
    }));
    const view = render(<Subject postToEdit={{ ...post, images }} />);
    const form = within(view.container);
    const first = form.getByLabelText(
      "選択写真 1。ドラッグまたは左右スワイプで並び替え",
    );
    const third = form.getByLabelText(
      "選択写真 3。ドラッグまたは左右スワイプで並び替え",
    );
    const dataTransfer = {
      effectAllowed: "none",
      setData: vi.fn(),
      getData: vi.fn(() => "image-1"),
    };

    fireEvent.dragStart(first, { dataTransfer });
    fireEvent.drop(third, { dataTransfer });

    expect(first).toHaveAttribute(
      "aria-label",
      "選択写真 3。ドラッグまたは左右スワイプで並び替え",
    );
  });
});

describe("きょうの日記", () => {
  it("きょう画面と共通する地図主体のレイアウトで表示する", () => {
    const view = render(
      <JournalView
        date="2026-09-14"
        posts={[post]}
        plushes={[
          {
            id: "plush-1",
            name: "くま",
            hidden: false,
            createdAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
          },
        ]}
        onEdit={() => undefined}
      />,
    );

    expect(
      view.container.querySelector(".journal-hero .journal-map"),
    ).toBeVisible();
    expect(view.container.querySelector(".journal-hero .journal-scroll")).not.toBeInTheDocument();
    expect(
      view.container.querySelector(".journal-lower > .journal-posts-heading"),
    ).toBeVisible();
    expect(
      view.container.querySelector(".journal-scroll .journal-posts-heading"),
    ).not.toBeInTheDocument();
    expect(view.container.querySelector(".journal-scroll .journal-posts")).toBeVisible();
    expect(
      view.container.querySelector(".journal-heading-card"),
    ).not.toBeInTheDocument();
    expect(
      within(view.container).getByRole("heading", {
        name: "2026年9月14日（月）の日記",
      }),
    ).toHaveClass("page-title");
    expect(view.container.querySelector(".journal-posts-heading")).toHaveTextContent(
      "とおでかけ",
    );
    expect(
      view.container.querySelector(".journal-companion-icon"),
    ).toHaveTextContent("く");
    expect(
      within(view.container).getByRole("region", { name: "この日のおもいで" }),
    ).toHaveTextContent("もとのひとこと");
    expect(view.container.querySelector(".journal-compose")).toHaveTextContent(
      "きょうのにっき",
    );
    expect(view.container.querySelector(".journal-compose")).not.toHaveTextContent(
      "一日のまとめ",
    );
    expect(view.container).not.toHaveTextContent(
      "日記の保存後に記録が更新されています。",
    );
    expect(
      within(view.container).queryByRole("button", { name: "戻る" }),
    ).not.toBeInTheDocument();
  });

  it("保存済みの日記は編集ボタンを押したときだけ編集できる", () => {
    const view = render(
      <JournalView
        date="2026-09-14"
        posts={[]}
        plushes={[]}
        journal={{
          logicalDate: "2026-09-14",
          body: "たのしい一日でした。",
          createdAt: "2026-09-14T12:00:00.000Z",
          updatedAt: "2026-09-14T12:00:00.000Z",
        }}
        onEdit={() => undefined}
      />,
    );
    const page = within(view.container);

    expect(page.getByText("たのしい一日でした。")).toHaveClass(
      "journal-body",
    );
    expect(
      page.queryByRole("textbox", { name: "きょうのにっき" }),
    ).not.toBeInTheDocument();

    const editButton = page.getByRole("button", {
      name: "きょうのにっきを編集",
    });
    expect(editButton.textContent).toBe("");
    fireEvent.click(editButton);

    expect(page.getByRole("textbox", { name: "きょうのにっき" })).toHaveValue(
      "たのしい一日でした。",
    );
    expect(page.getByRole("button", { name: "日記を保存" })).toBeVisible();
  });

  it("日記は曜日付きの日付を投稿一覧の見出しにする", () => {
    const view = render(
      <JournalView
        date="2026-09-14"
        posts={[]}
        plushes={[]}
        onEdit={() => undefined}
      />,
    );

    expect(
      within(view.container).getByRole("heading", {
        name: "2026年9月14日（月）の日記",
      }),
    ).toHaveClass("page-title");
    expect(view.container.querySelector(".journal-posts-heading")).toBeVisible();
  });
});

describe("おもいで", () => {
  it("日別の件数の左に、その日に登場したぬいを重複なく表示する", () => {
    const view = render(
      <History
        posts={[post, { ...post, id: "post-2" }]}
        journals={[]}
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
        onOpen={() => undefined}
      />,
    );

    const summary = view.container.querySelector(".history-summary");
    expect(summary).toHaveTextContent("2件");
    expect(
      within(summary as HTMLElement).getByRole("img", {
        name: "くまといっしょ",
      }),
    ).toBeVisible();
    expect(summary?.firstElementChild).toHaveClass("history-plushes");
    expect(view.container.querySelectorAll(".history-plush-icon")).toHaveLength(
      1,
    );
  });
});

describe("設定画面の保存状態", () => {
  it.each([
    ["checking", "保存状態を確認しています。"],
    ["cloud", "おもいで、写真、ぬい、日記、設定はサーバーにも保存され"],
    ["local", "LINEログインしていないため"],
    ["error", "保存状態を確認できませんでした。"],
  ] as const)("%s の案内を表示する", (cloudSaveStatus, message) => {
    render(
      <SettingsView
        settings={settings}
        cloudSaveStatus={cloudSaveStatus}
        onLegal={() => undefined}
      />,
    );

    expect(screen.getByText(message, { exact: false })).toBeVisible();
  });
});

describe("投稿のぬい選択", () => {
  it("ぬいのアイコンと名前を表示し、選択状態をチェックで示す", () => {
    const view = render(<Subject />);
    const form = within(view.container);
    const choice = form.getByRole("checkbox", { name: "くま" });

    expect(choice).not.toBeChecked();
    expect(form.getByText("くま")).toHaveClass("plush-choice-name");
    expect(
      view.container.querySelector(".plush-choice-check svg"),
    ).toBeInTheDocument();

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

    expect(form.getByRole("radio", { name: "場所を記録する" })).toBeChecked();
    expect(form.getByRole("textbox", { name: "場所" })).toHaveValue("東京駅");
    expect(
      form.getByRole("radio", { name: "場所を記録する" }).closest("label")
        ?.nextElementSibling,
    ).toHaveClass("place-editor");

    fireEvent.click(form.getByRole("radio", { name: "場所を記録しない" }));

    await waitFor(() =>
      expect(
        form.getByRole("radio", { name: "場所を記録しない" }),
      ).toBeChecked(),
    );
    expect(form.queryByLabelText("場所を選択する地図")).not.toBeInTheDocument();
    expect(
      form.queryByText(
        "地図をタップするか、ピンをドラッグして場所を指定できます。",
      ),
    ).not.toBeInTheDocument();
    expect(
      form.queryByRole("textbox", { name: "場所" }),
    ).not.toBeInTheDocument();
    expect(
      form.getByText("このおもいでには場所を保存しません。"),
    ).toBeVisible();
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
      form.getByText(
        "地図をタップするか、ピンをドラッグして場所を指定できます。",
      ),
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
      ((event: { latlng: { lat: number; lng: number } }) => void) | undefined;

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

    expect(
      within(container).getByLabelText("くま、うさぎといっしょ"),
    ).toBeVisible();
    expect(
      within(container).queryByText("くまとうさぎといっしょ"),
    ).not.toBeInTheDocument();
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
    expect(within(container).getByText("う")).toBeInTheDocument();
    expect(within(container).getByText("といっしょ")).toBeInTheDocument();
  });
});

describe("ぬいの代替アイコン", () => {
  it("名前の前後の空白を除いた最初の文字を表示する", () => {
    expect(plushNameInitial(" くま ")).toBe("く");
    expect(plushNameInitial("🐻くま")).toBe("🐻");
  });

  it("ぬいたち一覧で画像未設定時に名前の最初の文字を表示する", () => {
    const view = render(
      <Plushes
        plushes={[
          {
            id: "plush-initial",
            name: "くま",
            hidden: false,
            createdAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
          },
        ]}
      />,
    );

    expect(
      within(view.container).getByText("く", { selector: ".plush-icon-fallback" }),
    ).toBeVisible();
    view.unmount();
  });
});

describe("投稿画像の拡大表示", () => {
  it("カードを同行ぬい、本文、画像、時刻と場所・編集ボタンの順で表示する", () => {
    const companion: Plush = {
      id: "plush-order",
      name: "くま",
      hidden: false,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    const { container } = render(
      <PostCard
        post={{ ...post, plushIds: [companion.id] }}
        plushes={[companion]}
        onEdit={() => undefined}
      />,
    );
    const card = container.querySelector(".post-card");

    expect(
      Array.from(card?.children ?? []).map((element) => element.className),
    ).toEqual(["with", "post-body", "photos", "post-card-footer"]);
    const editButton = within(container).getByRole("button", {
      name: "おもいでを編集",
    });
    expect(editButton.querySelector(".MuiSvgIcon-root")).toBeInTheDocument();
    const location = container.querySelector(".post-location");
    expect(location).toHaveTextContent("東京駅");
    expect(location?.querySelector(".MuiSvgIcon-root")).toBeInTheDocument();
    expect(container.querySelector(".post-meta")).not.toHaveTextContent("·");
  });

  it("投稿画像を選択して拡大し、Escapeキーで閉じて元の操作へ戻る", () => {
    const view = render(
      <PostCard post={post} plushes={[]} onEdit={() => undefined} />,
    );
    const card = within(view.container);
    const trigger = card.getByRole("button", {
      name: "おもいでの写真 1を拡大",
    });

    fireEvent.click(trigger);

    expect(
      card.getByRole("dialog", { name: "おもいでの写真 1の拡大表示" }),
    ).toBeVisible();
    expect(card.getByAltText("拡大したおもいでの写真 1")).toBeVisible();
    expect(
      card.getByRole("button", { name: "拡大表示を閉じる" }),
    ).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(
      card.queryByRole("dialog", { name: "おもいでの写真 1の拡大表示" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe("ぬいぐるみのテーマカラー設定", () => {
  it("新規登録時は設定しないが選ばれ、設定する場合だけ色を選択できる", () => {
    render(<Plushes plushes={[]} />);

    const iconInput = screen.getByLabelText("画像を選択");
    expect(iconInput).toHaveClass("photo-file-input");
    expect(
      iconInput
        .closest("label")
        ?.querySelector("[data-testid='AddAPhotoIcon']"),
    ).toBeInTheDocument();
    expect(screen.getByText("テーマカラー").parentElement).toHaveClass(
      "theme-color-field",
    );
    const formCard = screen.getByRole("heading", {
      name: "新しいぬいを登録",
    }).parentElement;
    expect(
      Array.from(formCard?.children ?? []).slice(1, 4).map((element) =>
        element.matches("label")
          ? element.firstChild?.textContent?.trim()
          : element.querySelector("legend, span")?.textContent?.trim(),
      ),
    ).toEqual(["名前", "テーマカラー", "アイコン画像"]);

    const enabled = screen.getByRole("radio", {
      name: "テーマカラーを設定する",
    });
    const disabled = screen.getByRole("radio", {
      name: "テーマカラーを設定しない",
    });
    expect(
      screen.queryByText(
        "画像を選ぶと、円形アイコンのプレビューを調整できます。",
      ),
    ).not.toBeInTheDocument();
    expect(disabled).toBeChecked();
    expect(enabled).not.toBeChecked();
    expect(screen.queryByLabelText("テーマカラー")).not.toBeInTheDocument();

    fireEvent.click(enabled);

    const color = screen.getByLabelText("テーマカラー");
    expect(enabled).toBeChecked();
    expect(disabled).not.toBeChecked();
    expect(color).toBeEnabled();
    expect(color).toHaveValue("#9a5438");
    expect(enabled.closest("label")?.nextElementSibling).toContainElement(
      color,
    );
  });

  it("アイコン調整を画像選択の直下に表示し、そのまま保存できる", async () => {
    const icon = new Blob(["icon"], { type: "image/webp" });
    const put = vi.spyOn(db.plushes, "put").mockResolvedValue("plush-1");
    const request = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 401 }));
    const view = render(
      <Plushes
        plushes={[
          {
            id: "plush-1",
            name: "くま",
            icon,
            iconCrop: { x: 50, y: 50, zoom: 1 },
            hidden: false,
            createdAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
          },
        ]}
      />,
    );
    const form = within(view.container);

    fireEvent.click(form.getByRole("button", { name: /くま/ }));
    fireEvent.click(form.getByRole("button", { name: "位置とサイズを調整" }));

    const uploadField = view.container.querySelector(
      ".plush-icon-upload-field",
    );
    expect(uploadField?.nextElementSibling).toHaveClass("icon-editor");
    expect(
      form.queryByRole("button", { name: "この位置にする" }),
    ).not.toBeInTheDocument();

    fireEvent.change(form.getByRole("slider", { name: "横の位置" }), {
      target: { value: "75" },
    });
    expect(form.getByRole("button", { name: "保存" })).toBeEnabled();
    fireEvent.click(form.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        expect.objectContaining({
          icon,
          iconCrop: { x: 75, y: 50, zoom: 1 },
        }),
      ),
    );
    put.mockRestore();
    request.mockRestore();
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
      form.getByRole("radio", { name: "テーマカラーを設定する" }),
    ).toBeChecked();
    expect(
      form.getByRole("radio", { name: "テーマカラーを設定しない" }),
    ).not.toBeChecked();
    expect(form.getByLabelText("テーマカラー")).toHaveValue("#3a7bd5");
    expect(
      form.getByRole("button", { name: "このぬいを削除" }),
    ).toBeVisible();
  });
});
