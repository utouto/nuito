# ADR-0002 Cloudflareをクラウド配置先とする

- 状態: 採用（認証・同期方式は未決）
- 日付: 2026-09-15

## 決定

ステージング・本番の配置先はCloudflareとし、SPAをPages、HTTP APIをWorkers、投稿等の構造化データをD1、元画像とサムネイルを非公開R2 bucketへ配置する。ローカル開発はWranglerのローカルsimulationでD1・R2 bindingを再現する。

## セキュリティ境界

R2 bucketは公開せず、object keyを知るだけで写真を取得できる構成にしない。Workersが認証・所有者確認を行った後だけ画像を返す。R2 credentialやAPI tokenをブラウザへ渡さない。認証方式が未決の間は `/api/health` 以外のAPIを `501 authentication_not_configured` として閉じる。

## 段階導入

1. 現行MVPはIndexedDBを正本としてローカル利用を維持する。
2. 認証方式とローカルデータ移行規則を要件として確定する。
3. 所有者IDを必須にした同期APIと競合解決を実装する。
4. stagingで移行・削除・復旧・権限分離を検証してからproductionを作成する。

Cloudflare resourceの作成とdeployは手動承認を必要とし、この決定だけでは実行しない。
