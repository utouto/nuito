# 法務ページ公開チェックリスト

プライバシーポリシーと利用規約をLINE Developers Consoleへ登録する前に確認します。本文の初稿は実装済みですが、これは法的助言ではありません。

- [ ] `.env.staging` と `.env.production` の `VITE_OPERATOR_NAME` を実在する運営者名へ変更した
- [ ] `VITE_CONTACT_URL` を利用者が連絡できる公開窓口へ変更した
- [ ] `VITE_LEGAL_EFFECTIVE_DATE` を実際の施行日へ変更した
- [ ] 取得するLINE scopeと本文が一致している（現行想定は `openid profile`、emailは対象外）
- [ ] Cloudflare、地図provider、アクセス解析など実際の委託先と本文が一致している
- [ ] アカウント削除、クラウドデータ削除、問い合わせ対応を実装・運用できる
- [ ] 保存期間、backupからの削除期間、運用者など未確定事項を確定した
- [ ] 日本法と対象地域に詳しい専門家の確認を受けた
- [ ] stagingとproductionで `/privacy`、`/terms` を未ログイン状態から表示できる
- [ ] LINE Developers ConsoleのPrivacy policy URLとTerms of use URLへproduction URLを登録した
