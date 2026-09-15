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
import { JournalView, Plushes, PostCard, PostEditor, Today } from "./App";
import type { Plush, Post, Settings } from "./types";

const {
  attributionSetPosition,
  leafletDivIcon,
  leafletMap,
  leafletMarker,
  leafletPolyline,
  mapOn,
  mapPanBy,
  mapSetView,
  zoomSetPosition,
} = vi.hoisted(() => ({
  attributionSetPosition: vi.fn(),
  leafletMap: vi.fn(),
  mapOn: vi.fn(),
  mapPanBy: vi.fn(),
  mapSetView: vi.fn(),
  zoomSetPosition: vi.fn(),
  leafletDivIcon: vi.fn((options) => options),
  leafletMarker: vi.fn(),
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
        on() {
          return this;
        },
        bindTooltip() {
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

    const page = within(screen.getByRole("region", { name: /2026年9月14日/ }));
    fireEvent.click(page.getByRole("button", { name: "投稿ドロワーを開く" }));
    fireEvent.click(page.getByRole("button", { name: "投稿を編集" }));

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
    expect(form.getByLabelText("行動日時")).toHaveValue("2026-09-14T15:30");
    expect(form.getByRole("checkbox", { name: "くま" })).toBeChecked();
    expect(form.getByAltText("選択写真 1")).toHaveAttribute(
      "src",
      "blob:post-image",
    );
    expect(form.getByRole("textbox", { name: "場所" })).toHaveValue("東京駅");
    expect(form.getByText("投稿を編集")).toBeInTheDocument();
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
    const toggle = page.getByRole("button", { name: "投稿ドロワーを開く" });

    expect(drawer).toHaveAttribute("aria-label", "きょうの投稿");
    expect(drawer).toBeVisible();
    expect(drawer).not.toHaveAttribute("hidden");
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);

    expect(drawer).toBeVisible();
    expect(page.getByText("もとのひとこと")).toBeVisible();
    expect(
      page.getByRole("button", { name: "投稿ドロワーを閉じる" }),
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
    const handle = page.getByRole("button", { name: "投稿ドロワーを開く" });

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
        name: "投稿ドロワーを開く",
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
    fireEvent.click(page.getByRole("button", { name: "投稿ドロワーを開く" }));
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
});

describe("日別地図の投稿ピン", () => {
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

    render(
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
    expect(route).toHaveLength(17);
    expect(route[0]).toEqual([35.6812, 139.7671]);
    expect(route.at(-1)).toEqual([35.72, 139.8]);
    expect(route[1]).not.toEqual([
      35.6812 + (35.7 - 35.6812) / 8,
      139.7671 + (139.75 - 139.7671) / 8,
    ]);
    expect(options).toEqual(expect.objectContaining({ dashArray: "7 10" }));
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

  it("同行した複数のぬいの色を扇形に分けて境界だけなじませる", () => {
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
        html: expect.stringMatching(
          /<span style="background:conic-gradient\(from -2deg, #3a7bd5 0deg, #3a7bd5 176deg, #d55a87 184deg, #d55a87 356deg, #3a7bd5 360deg\)"><i style="background:conic-gradient\(from -2deg, #3a7bd5 0deg, #3a7bd5 176deg, #d55a87 184deg, #d55a87 356deg, #3a7bd5 360deg\)"><\/i><\/span>/,
        ),
      }),
    );
  });
});

describe("きょうの日記", () => {
  it("きょう画面と共通する地図主体のレイアウトで表示する", () => {
    const view = render(
      <JournalView
        date="2026-09-14"
        posts={[post]}
        plushes={[]}
        onEdit={() => undefined}
        onBack={() => undefined}
      />,
    );

    expect(
      view.container.querySelector(".journal-hero .journal-map"),
    ).toBeVisible();
    expect(
      view.container.querySelector(".journal-heading-card"),
    ).toHaveTextContent("2026年9月14日");
    expect(
      within(view.container).getByRole("region", { name: "この日の投稿" }),
    ).toHaveTextContent("もとのひとこと");
    expect(view.container.querySelector(".journal-compose")).toHaveTextContent(
      "きょうの気持ちを残す",
    );
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

    fireEvent.click(form.getByRole("radio", { name: "場所を記録しない" }));

    await waitFor(() =>
      expect(
        form.getByRole("radio", { name: "場所を記録しない" }),
      ).toBeChecked(),
    );
    expect(form.queryByLabelText("場所を選択する地図")).not.toBeInTheDocument();
    expect(
      form.queryByRole("textbox", { name: "場所" }),
    ).not.toBeInTheDocument();
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
    expect(
      card.getByRole("button", { name: "拡大表示を閉じる" }),
    ).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(
      card.queryByRole("dialog", { name: "投稿写真 1の拡大表示" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe("ぬいぐるみのテーマカラー設定", () => {
  it("新規登録時は設定しないが選ばれ、設定する場合だけ色を選択できる", () => {
    render(<Plushes plushes={[]} />);

    const enabled = screen.getByRole("radio", {
      name: "テーマカラーを設定する",
    });
    const disabled = screen.getByRole("radio", {
      name: "テーマカラーを設定しない",
    });
    const color = screen.getByLabelText("テーマカラー");

    expect(disabled).toBeChecked();
    expect(enabled).not.toBeChecked();
    expect(color).toBeDisabled();

    fireEvent.click(enabled);

    expect(enabled).toBeChecked();
    expect(disabled).not.toBeChecked();
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
      form.getByRole("radio", { name: "テーマカラーを設定する" }),
    ).toBeChecked();
    expect(
      form.getByRole("radio", { name: "テーマカラーを設定しない" }),
    ).not.toBeChecked();
    expect(form.getByLabelText("テーマカラー")).toHaveValue("#3a7bd5");
  });
});
