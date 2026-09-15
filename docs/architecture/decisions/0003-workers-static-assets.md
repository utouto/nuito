# ADR-0003 Workers Static AssetsでSPAとAPIを同一配信する

- 状態: 採用
- 決定日: 2026-09-15
- 置換対象: ADR-0002のPagesとWorkersを分ける配置

## 背景

LINE Loginのcallback、session cookie、SPAのAPI呼び出しを同一originへ閉じる必要があります。PagesとWorkerを別サービスとして初回公開すると、custom domainと`/api/*` routeの設定が公開前提になります。また、Cloudflareは新規アプリにWorkersを主要platformとして案内し、Workers Static AssetsでSPAとWorkerを一緒に配信できます。

## 決定

stagingとproductionは、Viteの`dist/`と`worker/index.ts`を1つのWorker deploymentとして配信します。`/api/*`だけWorker codeを先に実行し、それ以外はStatic Assetsから返します。SPA fallbackを有効にし、`/privacy`と`/terms`も直接表示できるようにします。

D1とR2は環境ごとに分離します。R2は非公開bindingのままとし、ブラウザへcredentialや公開URLを渡しません。ローカル開発は従来どおりViteとWranglerを別processで起動します。

## 結果

- Workers subdomainだけで初回の同一origin検証ができる。
- 静的ファイルとAPIが同じversionとしてrollbackされる。
- custom domainへの切り替えでは、LINE設定と`APP_ORIGIN`に加えてIndexedDBのorigin移行を考慮する必要がある。
- Pages固有のpreview deploymentは利用しない。staging Workerを常設して事前確認する。
