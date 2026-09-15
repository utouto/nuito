// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Plushes, PostCard, PostEditor, Today } from "./App";
import type { Plush, Post, Settings } from "./types";

vi.mock("leaflet", () => ({
  default: {
    map: () => ({
      setView() {
        return this;
      },
      on: vi.fn(),
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
    expect(form.getByRole("textbox", { name: "場所名" })).toHaveValue(
      "東京駅",
    );
    expect(form.getByText("投稿を編集")).toBeInTheDocument();
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
    expect(screen.getByText("ぬ")).toBeInTheDocument();
    expect(screen.getByText("といっしょ")).toBeInTheDocument();
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
