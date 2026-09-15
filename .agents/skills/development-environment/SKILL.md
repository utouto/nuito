---
name: development-environment
description: ローカル開発環境、runtime、package manager、lockfile、lint、formatter、env例、開発用scriptなどを追加・変更するときに使う。CI/CDワークフロー自体は ci-cd を使う。
---

# 開発環境管理

開発者とCodexが再現可能に作業できるローカル開発環境を維持するための手順です。

## 対象

- package manager設定とmanifest
- lockfile
- runtime・言語・compiler設定
- framework・ローカル実行ツールの設定
- lint / formatter
- `.gitignore`
- `.env.example` 等
- 開発用npm scripts
- ローカル起動・build・test手順

## 変更前

1. `AGENTS.md` と、存在する場合は開発手順docsを確認する。
2. 現在のpackage managerとlockfileを確認する。
3. 現在の実行コマンドを確認する。
4. 問題がある場合は再現条件を把握する。

## 方針

- 既存ツールで解決できるなら新しいツールを追加しない。
- package managerを理由なく変更しない。
- lockfileを手編集しない。
- 環境依存の設定をハードコードしない。
- 実際のSecretをリポジトリへ置かない。
- `.env.example` にはキー名と安全な例だけを書く。
- 本番環境設定とローカル設定を混同しない。

## 検証

変更内容に応じて実行する。

- install
- dev
- lint
- typecheck
- test
- build

既存のスクリプトを確認し、実在しないコマンドを想像で使わない。

## CI/CDとの境界

GitHub Actionsやデプロイワークフローの変更は `ci-cd` を使う。
ローカル環境とCIの不一致が原因の場合は、両方の設定を確認して責務を切り分ける。

## 完了時

- 新規参加者が同じ手順で再現できるか確認する。
- 開発手順が変わった場合は関連docsを更新する。
