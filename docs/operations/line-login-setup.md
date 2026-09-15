# LINEログイン・招待制登録の設定

## 登録ルール

- 未登録者は、あいことばの一致とLINE認証成功の両方が必要。
- 登録済み利用者は、あいことばなしでLINE認証できる。
- 登録人数は固定せず、あいことばを知る人だけを招待する。
- あいことば変更後も、既存利用者はログインできる。

## LINE Developers Console

1. LINE Login channelをWeb appとして作成する。
2. Callback URLへ `https://<本番ドメイン>/api/auth/line/callback` を完全一致で登録する。
3. Scopeは `openid profile` だけを使い、email権限は申請しない。
4. Privacy policy URLへ `https://<本番ドメイン>/privacy` を登録する。
5. Terms of use URLへ `https://<本番ドメイン>/terms` を登録する。

## Workersの設定

`APP_ORIGIN` は公開originだけを指定し、末尾のslashを付けません。次の値はWorkers Secretとして対話入力し、ファイルやコマンド履歴へ値を直接書きません。

```bash
npx wrangler secret put LINE_CHANNEL_ID
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put INVITE_PHRASE
```

`INVITE_PHRASE` は辞書語を避け、password managerで生成した十分に長い値にします。漏えいまたは不要な登録が疑われる場合は同じコマンドで直ちに変更します。

WorkersをPagesと同一originの `/api/*` routeへ接続します。別originへ配置する場合は、cookie、CORS、CSRF方針を別途設計し直します。

## D1 migration

本番D1のdatabase nameとIDをWranglerのproduction設定へ登録した後、deployより先に次を実行します。対象が本番であることをDashboardでも確認します。

```bash
npx wrangler d1 migrations list <本番DB名> --remote
npx wrangler d1 migrations apply <本番DB名> --remote
```

## 公開後の確認

- 正しくないあいことばでは未登録LINEアカウントを登録できない。
- 正しいあいことばとLINE認証で登録できる。
- 登録済みアカウントは空のあいことばで再ログインできる。
- 別ブラウザがOAuth callback URLだけを開いてもログインできない。
- session cookieは`HttpOnly; Secure; SameSite=Lax`である。
- Worker logへcode、token、LINE user ID、あいことばを出していない。
