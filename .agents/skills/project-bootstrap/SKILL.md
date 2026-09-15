---
name: project-bootstrap
description: 本テンプレートから新規プロジェクトを初期化し、名前、docs、Skills、Agents、開発環境、Git接続、検証方法を本プロジェクト向けに整理するときに使う。既存プロジェクトの通常の環境変更にはdevelopment-environmentを使う。
---

# プロジェクト初期化

本テンプレートを、本プロジェクト固有の安全で再現可能な開発基盤へ変換するための手順です。

## 開始前

1. プロジェクト名、目的、対象利用者、主要な完了条件を確認する。
2. 採用言語、runtime、framework、package manager、配布先が決まっているか確認する。
3. Git履歴を引き継ぐか、新しい履歴にするか確認する。
4. remote、組織、公開範囲、ライセンスを確認する。
5. 元テンプレート以外の既存ファイルがある場合は、所有者と保持対象を確認する。
6. プロダクト判断、技術判断、セキュリティ窓口、運用の責任者を確認する。

不明な選択がアーキテクチャや外部状態を大きく変える場合は、推測で決めずユーザーへ確認する。

## AI指示の初期化

- `AGENTS.md` にプロジェクト概要、固有の制約、情報の正本を追記する。
- 不要なSkills・Agentsを削除し、採用技術と実際の反復作業に必要なものだけを残す。
- Skillには作業方法、Agentには責務、docsにはプロジェクト仕様を配置する。
- 存在しないコマンド、パス、tool、docsへの参照を残さない。
- `.codex/config.toml` の権限とsandbox設定が利用環境に適切か確認する。
- Issue・Pull Requestテンプレートと管理文書を実際の開発フローへ合わせる。

## 開発基盤

- runtimeとpackage managerのversionを決め、必要なら固定する。
- formatter、linter、typecheck、test、buildの最小構成を用意する。
- 繰り返す操作は既存task runnerまたはpackage scriptへ定着させる。
- env例には安全な値と変数名だけを記載し、実際のSecretを含めない。
- Dev Containerの不要なtool、extension、port、mount、永続volumeを削除する。
- 必要な依存だけを追加し、lockfileとライセンスを確認する。

変更内容に応じて `development-environment`、`dependency-management`、`coding-standards`、`testing`、`ci-cd` を併用する。

## docs

最低限、本プロジェクトで必要な情報を整理する。

- productの目的と範囲
- 対象利用者、非目標、成功指標、仮説の検証方法
- UIの有無、対象platform、アクセシビリティ基準、対象browser・支援技術、手動検証範囲
- 想定規模、重要操作、必要な性能目標、外部API・AI・インフラのコスト管理方法、計測条件
- architectureと責務境界
- 重要な技術判断を残すADRの運用
- ローカル起動・検証手順
- コーディング規約
- 主要リスク、テストレベルの責務、環境境界、ローカル・CI実行方法を定めるテスト戦略
- 環境変数と外部サービス
- デプロイ・運用方法（採用する場合）
- Definition of Ready、Definition of Done、レビュー・承認責任

未決定事項や未実装機能を現在仕様として記載しない。

## 固有情報と残存物の確認

- テンプレート名、以前のプロジェクト名、URL、ID、組織名を全文検索する。
- `.env`、`.dev.vars`、認証file、鍵、tokenなどのSecret候補を確認する。
- build成果物、cache、test report、ローカルDB、依存directoryを除去またはignoreする。
- sample data、画像、fixture、ライセンス、NOTICEの由来と必要性を確認する。
- Gitのremote、branch追跡設定、tag、submoduleを確認する。

## Git履歴

- 履歴を削除する場合は、現在のsnapshot、branch、tag、remoteを先に確認する。
- 履歴削除は復元困難な破壊的操作として、ユーザーの明示的な依頼なしに行わない。
- 新しいroot commitを作る場合は、旧branch、tag、reflog、未参照objectが残っていないか確認する。
- AIエージェントは `git push` を実行しない。新remoteへのpushは正確な手動コマンドを案内する。

## 初期検証

- `python3 scripts/check-bootstrap.py --strict` を実行し、必須情報、担当、検証コマンド、セキュリティ窓口、テンプレート固有名が残っていないことを確認する。
- 設定fileの構文を確認する。
- install、formatter、lint、typecheck、test、buildのうち存在するものを実行する。
- Dev Containerを変更した場合は、可能ならbuildまたは構成検証を行う。
- 全文検索で旧固有名、Secret、壊れた参照が残っていないか確認する。
- 初期commitへ不要な生成物やローカル状態が含まれていないか確認する。
- CIが実在する検証コマンドを実行し、失敗を隠さないことを確認する。
- default branchの直接push禁止、必須CI、レビュー要件をrulesetまたはbranch protectionで設定する。
- Secret検出、依存関係・脆弱性検査、必要な静的解析とライセンス検査の導入要否を判断する。
- GitHub等の外部設定は読み取りで現状を確認し、明示的な依頼と対象確認なしに変更しない。

## 公開・運用準備

- `SECURITY.md` の非公開報告手段と担当を実在する情報へ更新する。
- 永続データまたは外部公開がある場合は、SLI/SLO、alert、runbook、backup/restore、rollbackを整理する。
- リリース後に成功指標と利用者feedbackを確認するowner、頻度、反映方法を決める。

## 完了時

- 初期化した項目、残した任意機能、削除したテンプレート要素を報告する。
- 実行した検証と未実施の検証を報告する。
- 未決定事項、必要なSecret名、手動のremote設定・push手順を明示する。
- 未設定のbranch protection、Security Advisory、CI Secretなど外部管理項目を明示する。
- bootstrap checkが成功し、派生プロジェクトのCIでも同じcheckを実行する状態にする。
