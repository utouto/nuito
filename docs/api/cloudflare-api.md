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

`multipart/form-data`で`metadata`、元画像、サムネイル、投稿に紐づくぬいアイコンを受け取ります。本文300文字、画像4枚、写真順、写真ピンの表示位置・拡大率、日時・座標・MIME type・byte size等を検証し、投稿メタデータをD1、画像を所有者名前空間の非公開R2へ保存します。同じIDは所有者本人だけが更新できます。

### `DELETE /api/posts/:postId`

所有者の投稿と関連画像を削除します。他利用者のIDは`404`として扱います。

### `GET /api/post-images/:imageId/full` / `thumbnail`

所有者確認後、非公開R2から元画像またはサムネイルを返します。未認証は`401`、他利用者または存在しない画像は`404`です。

### `GET /api/plush-icons/:plushId`

所有者確認後、ぬいアイコンを非公開R2から返します。

### `PUT /api/plushes/:plushId`

`multipart/form-data`でぬいのmetadataと任意のアイコンを受け取り、投稿との関連がないぬいもD1と非公開R2へ保存します。同じIDは所有者本人だけが更新できます。

### `DELETE /api/plushes/:plushId`

所有者のぬいを削除します。過去の投稿は保持し、`post_plushes`の関連とR2上のアイコンを削除します。同じIDを再度削除しても成功として扱います。

### `DELETE /api/account`

認証済み利用者のD1データを外部キーcascadeで削除し、所有者prefixのR2オブジェクトを削除してsession cookieを破棄します。R2削除だけが失敗した場合は`cleanupPending: true`を返します。

### `GET /api/profile-data`

認証済み利用者の設定と日記を返します。初回ログインとアプリ起動時の端末キャッシュ同期に使用します。

### `PUT /api/settings`

一日の切り替え時刻、日記案内時刻、timezone、schema version、更新日時を検証して所有者の設定として保存します。

### `PUT /api/journals/:logicalDate`

論理日付、1000文字以内の本文、投稿変更日時、作成・更新日時を検証して所有者の日記として保存します。

### その他の `/api/*`

未実装のAPIは`501`を返します。

## APIの安全要件

- Workers上で認証と所有者確認を行う。
- D1のすべてのqueryを認証済み`user_id`で制限する。
- R2 object keyは利用者入力から直接組み立てず、所有者namespace内でサーバーが生成する。
- 画像のMIME type、byte size、pixel sizeを検証する。Rate Limitは公開前の残課題とする。
- 投稿ID単位のPUTをidempotentに扱う。複数端末の同時編集に対する明示的な競合通知は今後追加する。
