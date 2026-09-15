# Dev Container上でWrangler OAuth認証が完了しない

この文書は、本プロジェクトでCloudflare Wranglerを追加した場合の任意のトラブルシュートです。本テンプレートはWranglerやcloudflaredを標準導入しません。

## 症状

次を実行し、ブラウザでは成功してもターミナル側の認証が完了しないことがあります。

```bash
npx wrangler login --callback-host=0.0.0.0
```

VS Code Dev Containersのポート転送がOAuth callbackをコンテナへ届けていない可能性があります。Wranglerの既定callback portは、利用しているバージョンの公式ドキュメントと実行時出力で確認してください。

## 確認例

callback portが8976の場合、別ターミナルでlisten状態を確認します。

```bash
ss -ltnp | grep 8976
```

VS CodeのPORTSタブから既存の転送を削除し、`Forward a Port` で同じportを手動追加してから、ログインを再実行します。

```bash
npx wrangler whoami
```

継続利用する場合は、本プロジェクトの `.devcontainer/devcontainer.json` に必要なportを追加できます。

```jsonc
"forwardPorts": [5173, 8976]
```
