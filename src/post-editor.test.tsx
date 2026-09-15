// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PostEditor, Today } from "./App";
import type { Post, Settings } from "./types";

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
    const { rerender } = render(<Subject />);

    rerender(<Subject postToEdit={post} />);

    expect(screen.getByRole("textbox", { name: /ひとこと/ })).toHaveValue(
      "もとのひとこと",
    );
    expect(screen.getByLabelText("行動日時")).toHaveValue(
      "2026-09-14T15:30",
    );
    expect(screen.getByRole("checkbox", { name: "くま" })).toBeChecked();
    expect(screen.getByAltText("選択写真 1")).toHaveAttribute(
      "src",
      "blob:post-image",
    );
    expect(screen.getByRole("textbox", { name: "場所名" })).toHaveValue(
      "東京駅",
    );
    expect(screen.getByText("投稿を編集")).toBeInTheDocument();
  });
});
