# ぬいログ

ぬいぐるみと一緒に出かけた記録を、写真・ひとこと・場所・時刻とともに残し、地図と日記で振り返るスマートフォン向けWebアプリです。

MVPのローカル実行版を実装しています。プロダクト要件の正本は [`docs/requirements/README.md`](docs/requirements/README.md) を参照してください。

## ローカル起動

Node.js 22.12以上を用意し、次を実行します。

```bash
npm install
npm run dev
```

初回起動時にローカルD1 migrationを適用し、フロントエンドとCloudflare Workerを同時に起動します。

- アプリ: `http://localhost:5173`
- Worker API: `http://localhost:8787`
- health check: `http://localhost:5173/api/health`
- D1・R2確認画面: Worker起動中にターミナルで `e` を押してLocal Explorerを開く

データは現時点では同じブラウザ・同じoriginのIndexedDBへ保存されます。ローカルD1・R2はCloudflare移行用の開発基盤で、認証方式が決まるまで保存APIを公開しません。

## 環境切り替え

- ローカル: `npm run dev`（`.env.development`）
- ステージング確認: `npm run dev:staging` / `npm run build:staging`（`.env.staging`）
- 本番相当: `npm run dev:production` / `npm run build`（`.env.production`）

環境ごとに `VITE_MAP_TILE_URL` と `VITE_MAP_ATTRIBUTION` を設定できます。`VITE_` で始まる値はブラウザへ公開されるため、Secretを設定しないでください。

法務ページは `/privacy` と `/terms` で直接表示できます。公開前に各環境の `VITE_OPERATOR_NAME`、`VITE_CONTACT_URL`、`VITE_LEGAL_EFFECTIVE_DATE` を実値へ変更し、[公開チェックリスト](docs/operations/legal-publication-checklist.md)を確認してください。

主な品質確認は `npm run lint`、`npm run typecheck`、`npm test`、`npm run build` です。

フロントエンドだけを起動する場合は `npm run dev:app`、Workerだけは `npm run dev:worker` を使います。ローカルD1 migrationは `npm run db:migrate:local` で再適用できます。`.wrangler/` のローカルD1・R2データはGit管理されません。

- 文書バージョン: `0.3.0-draft`
- 更新日: `2026-09-15`
- 対象: 初期リリース（MVP）および将来拡張
- 正本: [`docs/requirements/README.md`](docs/requirements/README.md)

## AI・開発者向けの読み順

1. [`AGENTS.md`](AGENTS.md)
2. [`docs/requirements/README.md`](docs/requirements/README.md)
3. [`docs/requirements/01-product-overview.md`](docs/requirements/01-product-overview.md)
4. [`docs/requirements/02-domain-rules.md`](docs/requirements/02-domain-rules.md)
5. [`docs/requirements/03-functional-requirements.md`](docs/requirements/03-functional-requirements.md)
6. 必要な詳細文書

## ディレクトリ構成

```text
.
├── AGENTS.md
├── src/              # React UI、domain、IndexedDB
├── package.json
├── README.md
└── docs/
    └── requirements/
        ├── README.md
        ├── 01-product-overview.md
        ├── 02-domain-rules.md
        ├── 03-functional-requirements.md
        ├── 04-screen-requirements.md
        ├── 05-data-requirements.md
        ├── 06-non-functional-requirements.md
        ├── 07-acceptance-criteria.md
        ├── 08-roadmap-and-open-issues.md
        └── 09-traceability.md
```

## 重要な前提

- 初期版はスマートフォン向けWebブラウザアプリです。
- 地図・写真・日記は個人の記録であり、他ユーザーへの公開機能はありません。
- 初期版ではローカル保存を中心とし、LINEログイン、クラウド同期、プッシュ通知は将来拡張です。
- 一日の切り替え時刻は初期値 `00:00` で、ユーザーが変更できます。
- 日記案内時刻は初期値 `21:00` で、ユーザーが変更できます。
- 両時刻は独立した設定です。
