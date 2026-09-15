// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { PrivacyPolicy, TermsOfUse } from "./legal";

describe("法務ページ", () => {
  it("プライバシーポリシーにLINE情報と削除方針を表示する", () => {
    render(<PrivacyPolicy />);
    expect(
      screen.getByRole("heading", { name: "プライバシーポリシー" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/LINEログインで提供されるユーザーID/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "5. 保存期間と削除" }),
    ).toBeInTheDocument();
  });
  it("利用規約にアカウントと記録データの条件を表示する", () => {
    render(<TermsOfUse />);
    expect(
      screen.getByRole("heading", { name: "利用規約" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "2. アカウント" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "3. 記録データ" }),
    ).toBeInTheDocument();
  });
});
