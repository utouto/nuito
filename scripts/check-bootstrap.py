#!/usr/bin/env python3
"""project-bootstrapで未完了の作業を報告する。"""

from __future__ import annotations

import argparse
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent

REQUIRED_FILES = (
    "AGENTS.md",
    "README.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "docs/product/product-brief.md",
    "docs/management/delivery-governance.md",
    "docs/architecture/overview.md",
    "docs/architecture/decisions/README.md",
    "docs/development/coding-standards.md",
    "docs/development/testing-strategy.md",
    "docs/operations/operational-readiness.md",
    ".github/CODEOWNERS",
    "LICENSE",
)

REQUIRED_FIELDS = {
    "docs/product/product-brief.md": (
        "解決する課題",
        "対象利用者",
        "主要な成果",
        "成功指標と測定方法",
        "評価する時期",
        "継続、修正、撤退を判断する条件",
        "含めるもの",
        "含めないもの",
        "主要ユースケース",
        "受け入れ条件",
        "UIの有無と対象platform",
        "適用するアクセシビリティ基準",
        "対象browser・支援技術",
        "手動検証範囲",
        "アクセシビリティの対象外項目と理由",
        "想定データ量と同時利用規模",
        "性能上重要な操作",
        "重要操作の性能目標",
        "外部API・AI・インフラのコスト上限または管理方法",
        "計測環境と評価時期",
        "性能・コストの対象外項目と理由",
        "利用状況を確認する方法",
        "利用者から意見を得る方法",
        "誰が、どの頻度で結果を確認するか",
        "判断結果をIssue、roadmap、仕様へ反映する方法",
    ),
    "docs/management/delivery-governance.md": (
        "プロダクト判断の担当",
        "要求の正本と優先順位の決定方法",
        "技術判断の担当",
        "セキュリティ窓口の担当",
        "運用責任の担当",
        "必須レビュー人数",
        "branch protectionまたはrulesetの確認担当と確認方法",
        "リリース責任者",
        "定期見直しの担当と頻度",
    ),
    "docs/architecture/overview.md": (
        "提供するシステムと対象外のシステム",
        "利用者・管理者・外部actor",
        "外部サービスと障害時の扱い",
        "主要componentと責務",
        "component間の依存方向・通信",
        "配置環境と環境間の差異",
        "主要データと所有component",
        "個人情報・機微情報の流れ",
        "認証・認可の境界",
        "外部入力を検証する境界",
    ),
    "docs/development/coding-standards.md": (
        "formatter",
        "linter",
        "typecheckまたはcompiler",
        "test",
    ),
    "docs/development/testing-strategy.md": (
        "主要なリスク",
        "主要な利用者導線",
        "UTの責務",
        "ITの責務",
        "STの責務",
        "実環境境界",
        "ローカルtestコマンド",
        "CI testコマンド",
        "必須チェック名",
        "flaky testの扱い",
    ),
    "docs/operations/operational-readiness.md": (
        "適用判断",
        "適用判断の担当",
        "初回リリース前の確認担当",
        "リリース方式と対象環境",
        "migrationの有無、順序、互換性",
        "health確認とリリース後の主要signal",
        "rollbackまたは前進修正の条件と手順",
        "障害時の連絡先と初動手順",
        "backup対象、復旧目標、restore検証",
    ),
    "SECURITY.md": ("非公開報告先",),
}

TEMPLATE_MARKERS = {
    "README.md": ("# AI Development Template",),
    "AGENTS.md": (
        "プロジェクト概要、採用技術、固有の制約を追記してください。",
    ),
    "SECURITY.md": ("初期化必須",),
}

# 3つのtemplate markerが誤って残っていても、以下のpathが追加されていれば
# application実装が始まったものと判定する。
PROJECT_START_FILES = (
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "Pipfile",
    "poetry.lock",
    "go.mod",
    "Cargo.toml",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "composer.json",
    "Gemfile",
    "Dockerfile",
    "compose.yml",
    "compose.yaml",
)

PROJECT_START_DIRECTORIES = (
    "app",
    "apps",
    "cmd",
    "migrations",
    "packages",
    "prisma",
    "src",
)

# 元テンプレートに存在するroot項目。既知のmanifestやsrc以外の名前で
# application実装を始めても、未初期化状態として見逃さないために使う。
TEMPLATE_ROOT_ENTRIES = {
    ".agents",
    ".codex",
    ".devcontainer",
    ".git",
    ".github",
    ".gitignore",
    "AGENTS.md",
    "CONTRIBUTING.md",
    "LICENSE",
    "README.md",
    "SECURITY.md",
    "docs",
    "scripts",
    "test-reports",
    "tests",
}


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check whether this template was initialized for a real project."
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="return a non-zero status when incomplete bootstrap items remain",
    )
    parser.add_argument(
        "--ci",
        action="store_true",
        help=(
            "allow the untouched template, but require --strict-equivalent "
            "completion as soon as project initialization starts"
        ),
    )
    return parser.parse_args()


def read_file(relative_path: str, issues: list[str]) -> str | None:
    path = ROOT / relative_path
    if not path.is_file():
        issues.append(f"missing required file: {relative_path}")
        return None
    return path.read_text(encoding="utf-8")


def field_value(text: str, field: str) -> str | None:
    match = re.search(
        rf"^[ \t]*-[ \t]*{re.escape(field)}[ \t]*:[ \t]*([^\r\n]*)$",
        text,
        re.MULTILINE,
    )
    return match.group(1).strip() if match else None


PLACEHOLDER_VALUES = {
    "decided",
    "fixme",
    "n/a",
    "na",
    "none",
    "tbd",
    "todo",
    "未定",
    "未確認",
    "なし",
}


def field_is_placeholder(value: str) -> bool:
    """未完了のbootstrap判断を隠すだけの値を拒否する。"""
    normalized = value.strip().strip("-–—:：.。()（）[]【】").casefold()
    return normalized in PLACEHOLDER_VALUES


def collect_issues() -> list[str]:
    issues: list[str] = []
    contents: dict[str, str] = {}

    for relative_path in REQUIRED_FILES:
        text = read_file(relative_path, issues)
        if text is not None:
            contents[relative_path] = text
            if not text.strip():
                issues.append(f"empty required file: {relative_path}")

    for relative_path, fields in REQUIRED_FIELDS.items():
        text = contents.get(relative_path)
        if text is None:
            continue
        for field in fields:
            value = field_value(text, field)
            if value is None:
                issues.append(f"missing bootstrap field: {relative_path}: {field}")
            elif not value:
                issues.append(f"empty bootstrap field: {relative_path}: {field}")
            elif field_is_placeholder(value):
                issues.append(
                    f"placeholder bootstrap field: {relative_path}: {field}: {value}"
                )

    for relative_path, markers in TEMPLATE_MARKERS.items():
        text = contents.get(relative_path)
        if text is None:
            continue
        for marker in markers:
            if marker in text:
                issues.append(f"template marker remains: {relative_path}: {marker}")

    return issues


def template_is_pristine() -> bool:
    """markerが残り、application実装が始まっていないか判定する。"""
    for relative_path, markers in TEMPLATE_MARKERS.items():
        path = ROOT / relative_path
        if not path.is_file():
            return False
        text = path.read_text(encoding="utf-8")
        if any(marker not in text for marker in markers):
            return False
    if any((ROOT / relative_path).exists() for relative_path in PROJECT_START_FILES):
        return False
    if any((ROOT / relative_path).is_dir() for relative_path in PROJECT_START_DIRECTORIES):
        return False
    if any(path.name not in TEMPLATE_ROOT_ENTRIES for path in ROOT.iterdir()):
        return False
    return True


def main() -> int:
    arguments = parse_arguments()
    issues = collect_issues()

    if not issues:
        print("Project bootstrap check passed.")
        return 0

    enforce = arguments.strict or (arguments.ci and not template_is_pristine())
    prefix = "ERROR" if enforce else "TODO"
    for issue in issues:
        print(f"{prefix}: {issue}")
    print(f"Bootstrap check found {len(issues)} incomplete item(s).")
    if arguments.ci and not enforce:
        print("Untouched template detected; bootstrap completion is not required yet.")
    return 1 if enforce else 0


if __name__ == "__main__":
    raise SystemExit(main())
