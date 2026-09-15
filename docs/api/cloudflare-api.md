# Cloudflare API

## 現在利用できるendpoint

### `GET /api/health`

D1とR2 bindingの到達性を確認します。個人情報や保存件数は返しません。

- `200`: `{ "status": "ok", "environment": "local" }`
- `503`: `{ "status": "unavailable" }`
- cache: `no-store`

### その他の `/api/*`

認証方式が決まるまでは `501` と `authentication_not_configured` を返します。投稿・画像・日記を無認証で保存または取得するendpointはありません。

## 将来のAPI要件

- Workers上で認証と所有者確認を行う。
- D1のすべてのqueryを認証済み`user_id`で制限する。
- R2 object keyは利用者入力から直接組み立てず、所有者namespace内でサーバーが生成する。
- 画像のMIME type、byte size、pixel sizeを検証し、Rate Limitを設定する。
- 更新APIには競合検出またはidempotency規則を定義する。
