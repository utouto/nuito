---
name: ci-cd
description: CIチェック、build・test・lint自動化、artifact、環境別デプロイとデプロイワークフローを追加・変更するときに使う。ローカル開発環境だけの変更は development-environment を使う。
---

# CI/CD

CI/CDを安全かつ再現可能に保守するための手順です。

## 変更前

1. `AGENTS.md`、既存ワークフロー、開発・デプロイdocsを確認する。
2. トリガー、権限、対象ブランチ、対象環境を確認する。
3. CIに対応するローカルコマンドとpackage managerを確認する。
4. 本番・ステージングへの影響を整理する。

## CI

- 失敗を `continue-on-error` などで隠さない。
- lint、typecheck、test、buildの責務を明確にする。
- lockfileに基づく再現可能なinstallを優先する。
- cache keyとartifactの保存期間を意図的に設定する。
- matrixや並列化は、実行時間と保守コストの根拠がある場合に使う。
- default branchでは必須チェックと作成者以外のレビューをrulesetまたはbranch protectionで強制する。
- 外部サービス側の設定はリポジトリだけでは再現できないため、ownerと確認方法をdocsへ記録する。

## セキュリティ

- workflow権限を必要最小限にする。
- Secretの値をファイル、引数、ログ、artifactへ出さない。
- forkや外部PRでSecretが利用される条件を確認する。
- 外部Actionやプラグインは公式情報、保守状況、参照方法を確認する。
- Secret検出、依存関係・脆弱性検査、静的解析、ライセンス検査の必要性を判断する。
- workflowから利用するtokenと環境には、jobごとに必要最小限の権限だけを与える。

## CD

- デプロイトリガー、対象環境、承認条件を明確にする。
- 環境ごとの設定とSecretを混同しない。
- dry-runやpreviewがあれば、リモートを変更しない検証を先に行う。
- 明示的な依頼と対象確認なしにデプロイしない。
- AIエージェントは `git push` を実行しない。タグ操作もリポジトリ方針と許可を確認する。
- デプロイ後は公開先、バージョン、health check、rollback手段を確認する。

具体的な環境名、URL、Secret名、コマンドはSkillへ固定せず、本プロジェクトの設定とdocsを正本にする。

## 検証

- workflowや設定の構文を確認する。
- CIが呼ぶコマンドを可能な範囲でローカル実行する。
- 外部サービスの現在仕様は公式ドキュメントで確認する。
- 実行できないリモート検証は明示する。
- ruleset、branch protection、environment approvalなどリモート側の統制が実際に有効か確認する。

## 完了時

- どのイベントで何が実行されるか説明する。
- 本番影響と必要な手動操作を明示する。
- 運用変更があればdocsを更新する。
- 必須チェック名、レビュー要件、外部設定のownerと未設定項目を報告する。
