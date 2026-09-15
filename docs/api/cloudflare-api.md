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

### `GET /api/posts`

認証済み利用者が所有する投稿、同行ぬい、画像メタデータを返します。画像本体は含めません。未認証は`401`です。

### `PUT /api/posts/:postId`

`multipart/form-data`で`metadata`、元画像、サムネイル、投稿に紐づくぬいアイコンを受け取ります。本文300文字、画像4枚、日時・座標・MIME type・byte size等を検証し、投稿メタデータをD1、画像を所有者名前空間の非公開R2へ保存します。同じIDは所有者本人だけが更新できます。

### `DELETE /api/posts/:postId`

所有者の投稿と関連画像を削除します。他利用者のIDは`404`として扱います。

### `GET /api/post-images/:imageId/full` / `thumbnail`

所有者確認後、非公開R2から元画像またはサムネイルを返します。未認証は`401`、他利用者または存在しない画像は`404`です。

### `GET /api/plush-icons/:plushId`

所有者確認後、投稿に紐づいて同期されたぬいアイコンを非公開R2から返します。

### その他の `/api/*`

未実装のAPIは`501`を返します。日記本文、設定、投稿に紐づかないぬいぐるみの同期APIはまだありません。

## APIの安全要件

- Workers上で認証と所有者確認を行う。
- D1のすべてのqueryを認証済み`user_id`で制限する。
- R2 object keyは利用者入力から直接組み立てず、所有者namespace内でサーバーが生成する。
- 画像のMIME type、byte size、pixel sizeを検証する。Rate Limitは公開前の残課題とする。
- 投稿ID単位のPUTをidempotentに扱う。複数端末の同時編集に対する明示的な競合通知は今後追加する。
