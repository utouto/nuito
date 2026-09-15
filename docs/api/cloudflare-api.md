# Cloudflare API

## 現在利用できるendpoint

### `GET /api/health`

D1とR2 bindingの到達性を確認します。個人情報や保存件数は返しません。

- `200`: `{ "status": "ok", "environment": "local" }`
- `503`: `{ "status": "unavailable" }`
- cache: `no-store`

### `POST /api/auth/line/start`

`invitePhrase`をJSONで受け取り、LINE認証URLを返します。未登録者の登録許可はあいことば一致時だけ認証試行へ記録し、一致結果はresponseへ出しません。同一接続元からのあいことば試行は15分に5回までです。登録人数は固定しません。

### `GET /api/auth/line/callback`

LINEの認可codeを受け、`state`と開始ブラウザのHttpOnly cookie、PKCE、ID token、`nonce`、channel IDを検証します。未登録者は認証開始時にあいことばが一致した場合だけ登録します。

### `GET /api/auth/session` / `POST /api/auth/logout`

HttpOnly・Secure・SameSite=Lax cookieのsessionを確認または破棄します。session tokenはD1へ保存せずSHA-256 hashだけを保存します。

### その他の `/api/*`

投稿・画像・日記APIは所有者認可の実装が完了するまで `501` を返します。無認証で保存または取得するendpointはありません。

## 将来のAPI要件

- Workers上で認証と所有者確認を行う。
- D1のすべてのqueryを認証済み`user_id`で制限する。
- R2 object keyは利用者入力から直接組み立てず、所有者namespace内でサーバーが生成する。
- 画像のMIME type、byte size、pixel sizeを検証し、Rate Limitを設定する。
- 更新APIには競合検出またはidempotency規則を定義する。
