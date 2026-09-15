# ADR-0001 ローカルWebアプリの技術構成

- 状態: 採用
- 日付: 2026-09-15

## 決定

React 19 + TypeScript + ViteでSPAを構成し、構造化データとBlobはDexie経由でIndexedDBへ保存する。地図表示はLeafletを直接利用し、背景タイルURLは環境変数で切り替える。画像はブラウザのCanvasで長辺2,048px、品質0.82のWebPへ変換し、480pxの正方形サムネイルを別生成する。

## 理由と影響

IndexedDBは画像Blobと構造化データを扱え、将来のschema migrationにも対応できる。SPAはオフライン編集と静的配信に適する。地図providerは未決定のため、Leafletより外側へprovider固有処理を持ち込まない。React用Leaflet wrapperは用途制約のあるlicenseだったため採用しない。

画像形式・圧縮値・地図providerは実機検証後に置換できる。初期版ではバックアップとservice workerを含めず、ブラウザデータ消去時の復旧はできない。
