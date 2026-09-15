# Cloudflare初回公開手順

この文書は、ぬいとをCloudflareへ初めて公開する担当者向けの手順です。フロントエンドとAPIを1つのWorkerから同一originで配信し、D1と非公開R2をbindingします。初回はstagingで確認してからproductionへ進めます。

## 1. 公開構成

- Worker: `dist/`の静的ファイルと`/api/*`を同一originで配信
- D1: LINE利用者、OAuth試行、sessionを保存
- R2: 将来のクラウド画像保存用。bucket自体は公開しない
- IndexedDB: 投稿、写真、日記の現時点の正本。ログインしてもクラウド同期はまだ行わない

productionビルドではsource mapを公開物へ含めず、stagingでは障害調査用に生成します。

Cloudflare PagesとWorkerを別々に公開すると、初回公開時点でもcustom domainのroute設定が必要になります。現在はcookieとOAuth callbackを単純かつ安全に同一originへ閉じるため、Workers Static Assetsへまとめます。

## 2. 前提

1. Node.js 22.12以上で`npm ci`が完了している。
2. CloudflareアカウントでWorkers、D1、R2を利用できる。
3. LINE Login channelを用意している。
4. `.env.production`の運営者名、連絡先、施行日が公開内容として正しい。
5. `npx wrangler login`後、`npx wrangler whoami`で対象アカウントを確認する。

`wrangler login`が開発コンテナで完了しない場合は、[Wrangler OAuthのトラブルシュート](../troubleshooting/wrangler-oauth-in-devcontainer.md)を参照します。

## 3. staging資源の作成

次のコマンドはCloudflare上へ資源を作成します。Dashboardで対象アカウントを再確認してから実行します。

```bash
npx wrangler d1 create nuito-staging
npx wrangler r2 bucket create nuito-images-staging
cp wrangler.staging.example.jsonc wrangler.staging.jsonc
```

作成結果のD1 `database_id`と、アカウントのWorkers subdomainを`wrangler.staging.jsonc`へ設定します。この実設定ファイルはGit管理されません。

Secretは値をコマンド行へ書かず、プロンプトへ入力します。

```bash
npx wrangler secret put LINE_CHANNEL_ID --config wrangler.staging.jsonc
npx wrangler secret put LINE_CHANNEL_SECRET --config wrangler.staging.jsonc
npx wrangler secret put INVITE_PHRASE --config wrangler.staging.jsonc
```

## 4. stagingのmigrationと公開

```bash
npm run check:deploy:staging
npx wrangler d1 migrations list nuito-staging --remote --config wrangler.staging.jsonc
npx wrangler d1 migrations apply nuito-staging --remote --config wrangler.staging.jsonc
npx wrangler deploy --config wrangler.staging.jsonc
```

deploy結果のURLが`APP_ORIGIN`と完全一致することを確認します。異なる場合は`APP_ORIGIN`を直し、再deployします。その後、LINE Developers Consoleへ次を登録します。

- Callback URL: `<APP_ORIGIN>/api/auth/line/callback`
- Privacy policy URL: `<APP_ORIGIN>/privacy`
- Terms of use URL: `<APP_ORIGIN>/terms`

## 5. staging受入確認

```bash
curl --fail-with-body https://<STAGING_HOST>/api/health
```

次もスマートフォンとシークレットウィンドウで確認します。

- `/`、`/privacy`、`/terms`を直接開ける
- 誤ったあいことばでは未登録LINEアカウントを登録できない
- 正しいあいことばとLINE認証で登録できる
- 登録済みアカウントはあいことばなしで再ログインできる
- session cookieに`HttpOnly`、`Secure`、`SameSite=Lax`が付く
- 投稿・写真・日記がブラウザ再起動後も同じ端末に残る
- Worker logにOAuth code、token、LINE user ID、あいことばが出ない

## 6. production公開

staging確認後に同じ手順で`nuito-production`と`nuito-images-production`を作り、`wrangler.production.example.jsonc`を`wrangler.production.jsonc`へコピーします。production専用のD1 ID、Workers subdomain、Secretを設定してください。stagingのD1、R2、Secretを流用しません。

```bash
npm run check:deploy:production
npx wrangler d1 migrations list nuito-production --remote --config wrangler.production.jsonc
npx wrangler d1 migrations apply nuito-production --remote --config wrangler.production.jsonc
npx wrangler deploy --config wrangler.production.jsonc
```

公開後はproduction URLの`/api/health`、法務ページ、LINE認証をstagingと同じ観点で確認します。あいことばは招待相手だけに安全な経路で共有します。

## 7. custom domainへ切り替える場合

Workers subdomainで受入確認してから、Cloudflare DashboardまたはWrangler設定でcustom domainを割り当てます。切り替え時は次の3か所を同時に更新します。

1. `wrangler.production.jsonc`の`APP_ORIGIN`
2. LINE Developers ConsoleのCallback URL
3. LINE Developers ConsoleのPrivacy policy URLとTerms of use URL

origin移行前のsession cookieは新originへ引き継がれないため、利用者は再ログインします。IndexedDBもorigin単位なので、Workers subdomainで記録を作り始めてからcustom domainへ移ると自動移行されません。本利用開始前に最終domainを決めるのが安全です。

## 8. rollback

- Workerと静的ファイル: Cloudflare DashboardのWorkers & Pages > 対象Worker > Deploymentsから直前の正常versionへ戻す。
- Secret: 漏えい時は`wrangler secret put`で直ちにローテーションする。`INVITE_PHRASE`変更後も既存利用者はログインできる。
- D1: 適用済みmigrationをファイル削除や手動DROPで戻さない。破壊的migrationを避け、原則として追加migrationで前進修正する。
- R2: 現時点ではアプリから画像を書き込まない。公開bucketへ変更しない。

公開の実施日時、対象commit、Worker version、migration結果、確認者、既知の問題をリリース記録へ残します。
