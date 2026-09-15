# アーキテクチャ概要

この文書は、実装へ入る前にシステム境界と主要な責務を共有するための正本です。技術スタックが未決定でも、利用者・外部システム・データの境界は記載します。詳細な技術選定と理由はADRへ分離します。

## システム境界

- スマートフォン優先のReact SPAとして提供し、LINEログイン時は記録データをクラウド保存する。公開とプッシュ通知は対象外とする。
- 利用者本人だけが、端末内または認証済み所有者のクラウド記録を扱う。
- 背景地図は環境変数で指定するタイルサービスを利用する。オフライン時も記録編集は可能で、背景地図を利用できない旨を示す。

## 構成と責務

- `src/domain.ts`: 論理日付、投稿順、日記案内時刻の純粋なドメイン規則。
- `src/db.ts`: DexieによるIndexedDB schemaとtransaction境界。
- `src/image.ts`: Canvasによる画像の向き補正、リサイズ、WebP圧縮、サムネイル生成。
- `src/App.tsx`: 画面と利用者操作。domainとDBを利用し、背景地図には日記本文やぬい情報を渡さない。
- Vite modeと `.env.local`、`.env.staging`、`.env.production` で配置環境を切り替える。

図を作る場合も、責務と依存方向を本文で説明し、図だけを正本にしません。

## データと信頼境界

- IndexedDBは全データの端末保存とキャッシュを担う。LINEログイン中の構造化データはD1、画像は非公開R2にも保存する。
- WorkerがOAuth callback、招待制登録、session、記録データAPIの所有者認可を担う。地図タイル提供者へ投稿データは送信しない。
- 文字数、画像形式・枚数、空投稿をUIと保存前で検証する。

## 品質上の制約

- 画像をWeb Storageへ置かず、投稿単位でIndexedDBへ保存する。保存失敗時は既存データと入力状態を維持する。
- 未ログインのローカルデータはoriginとブラウザに依存する。ログイン時の投稿・画像・ぬい・日記・設定の同期は実装済みだが、バックアップ、PWA、施設検索は未実装。
- クラウド構成はWorkers Static Assets（SPAと認証・API）、D1（構造化データ）、R2（非公開画像）とする。ローカルではViteとWranglerを分け、WranglerがD1とR2を模擬する。
- 要件は `docs/requirements/`、技術判断は `docs/architecture/decisions/0001-local-web-app-stack.md`、`0002-cloudflare-target-architecture.md`、`0003-workers-static-assets.md` を参照する。
