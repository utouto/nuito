# 05. データ要件

この文書は論理データモデルを示します。実際のテーブル名、ストア名、ライブラリは基本設計で決定します。

## 1. エンティティ一覧

| エンティティ | 役割 |
|---|---|
| Plush | ぬいぐるみ |
| Post | ひとこと日記 |
| PostImage | 投稿画像とサムネイル |
| PostPlush | 投稿とぬいぐるみの多対多関連 |
| Location | 投稿地点 |
| DailyJournal | 論理日付ごとの一日のまとめ |
| UserSettings | 一日の切り替え時刻等の設定 |
| AppMetadata | データ形式版、アプリ版等 |

## 2. Plush

| 項目 | 型の例 | 必須 | 説明 |
|---|---|---:|---|
| id | UUID/string | Yes | 一意なID |
| name | string | Yes | 表示名 |
| iconImageId | string/null | No | アイコン画像 |
| isHidden | boolean | Yes | 新規選択肢から非表示にするか |
| createdAt | datetime | Yes | 作成日時 |
| updatedAt | datetime | Yes | 更新日時 |

### 制約

- 名前は空文字不可。
- 非表示にしても、過去のPostPlushを削除しない。
- 完全削除を行う場合の過去表示は未決事項とする。

## 3. Post

| 項目 | 型の例 | 必須 | 説明 |
|---|---|---:|---|
| id | UUID/string | Yes | 一意なID |
| body | string | Yes | 0〜300文字 |
| timeMode | enum | Yes | `known` または `unknown` |
| occurredLocalDateTime | local datetime/null | 条件付き | 時刻ありの場合の行動日時 |
| manualLogicalDate | local date/null | 条件付き | 時刻不明の場合の論理日付 |
| createdAt | datetime | Yes | 投稿日時 |
| updatedAt | datetime | Yes | 更新日時 |
| locationId | string/null | No | 場所 |

### 制約

- `timeMode = known` の場合、`occurredLocalDateTime` を必須とする。
- `timeMode = unknown` の場合、`manualLogicalDate` を必須とする。
- 本文、画像、場所のすべてが空の投稿は保存しない。ぬいぐるみの選択だけでは投稿を成立させない。
- 投稿日時と行動日時を混同しない。

## 4. 論理日付の算出

### 時刻あり投稿

```text
effectiveLogicalDate(post, settings):
  localDate = date(post.occurredLocalDateTime)
  localTime = time(post.occurredLocalDateTime)

  if localTime >= settings.dayBoundaryTime:
      return localDate
  else:
      return localDate - 1 day
```

### 時刻不明投稿

```text
effectiveLogicalDate(post, settings):
  return post.manualLogicalDate
```

### 重要事項

- 時刻あり投稿の論理日付は、一日の切り替え時刻変更後に再計算される。
- 時刻不明投稿の論理日付は再計算しない。
- 実装上キャッシュする場合も、算出元との整合性を保つ。

## 5. Location

| 項目 | 型の例 | 必須 | 説明 |
|---|---|---:|---|
| id | UUID/string | Yes | 一意なID |
| latitude | number | Yes | 緯度 |
| longitude | number | Yes | 経度 |
| name | string/null | No | 施設名等 |
| address | string/null | No | 住所表示用 |
| source | enum/null | No | current/search/map/manual等 |

### 制約

- 場所は投稿の任意項目。
- 緯度・経度を画面上へ常時表示しない。
- 外部地図サービスへ、日記本文やぬいぐるみ情報を送信しない。

## 6. PostImage

| 項目 | 型の例 | 必須 | 説明 |
|---|---|---:|---|
| id | UUID/string | Yes | 一意なID |
| postId | string | Yes | 投稿ID |
| displayOrder | integer | Yes | 表示順 |
| isCover | boolean | Yes | 代表写真か |
| fullBlob | Blob | Yes | リサイズ・圧縮済み保存画像 |
| thumbnailBlob | Blob | Yes | 一覧・地図用サムネイル |
| width | integer | Yes | 保存画像幅 |
| height | integer | Yes | 保存画像高さ |
| mimeType | string | Yes | 保存形式 |
| byteSize | integer | Yes | 容量 |
| createdAt | datetime | Yes | 追加日時 |

### 制約

- 1投稿につき0〜4件。
- `width / height` の比率は、元画像の比率を可能な限り維持する。
- サムネイルは正方形の表示用データでもよいが、`fullBlob` を破壊的に切り抜かない。
- 代表写真は1投稿につき最大1枚。

## 7. PostPlush

| 項目 | 型の例 | 必須 | 説明 |
|---|---|---:|---|
| postId | string | Yes | 投稿ID |
| plushId | string | Yes | ぬいぐるみID |
| displayOrder | integer | Yes | 表示順 |

- 投稿とぬいぐるみは多対多。
- ぬいぐるみ0体の投稿を許可する。

## 8. DailyJournal

| 項目 | 型の例 | 必須 | 説明 |
|---|---|---:|---|
| logicalDate | local date | Yes | 主キー相当 |
| body | string | Yes | 0〜1000文字 |
| createdAt | datetime | Yes | 初回保存日時 |
| updatedAt | datetime | Yes | 最終更新日時 |
| lastPostChangeAtAtSave | datetime/null | No | 投稿更新通知判定用 |

### 制約

- 論理日付ごとに1件。
- 投稿0件でも保存可能。
- 一日の切り替え時刻を変更しても、DailyJournalのlogicalDateを自動移動しない。
- 投稿更新時にbodyを自動変更しない。

## 9. UserSettings

| 項目 | 型の例 | 初期値 | 説明 |
|---|---|---|---|
| dayBoundaryTime | local time | 00:00 | 一日の切り替え時刻 |
| journalPromptTime | local time | 21:00 | 日記案内時刻 |
| timezone | string | 端末値 | タイムゾーン識別子。扱いは一部未決 |
| imageMaxLongEdge | integer | 2048（暫定） | 保存画像の長辺上限 |
| imageQuality | number | TBD | 圧縮画質 |
| schemaVersion | integer/string | 実装値 | データ形式版 |

## 10. 投稿一覧のソート

```text
knownPosts = posts where timeMode == known
unknownPosts = posts where timeMode == unknown

sort knownPosts by:
  occurredLocalDateTime ascending,
  createdAt ascending,
  id ascending

sort unknownPosts by:
  createdAt ascending,
  id ascending

result = knownPosts + unknownPosts
```

## 11. 足あと線の生成

```text
routePosts = posts where:
  effectiveLogicalDate(post) == targetLogicalDate
  and timeMode == known
  and locationId is not null

sort routePosts by:
  occurredLocalDateTime ascending,
  createdAt ascending,
  id ascending

polylinePoints = routePosts.map(post.location.coordinates)
```

- 地点が0〜1件の場合、線を描画しない。
- 同一地点が連続する場合の描画方式は基本設計で決定する。
- 実際の道路へスナップしない。

## 12. ストレージ

### 推奨方針

- 構造化データとBlobを扱えるブラウザ内データベースを使用する。
- 画像をWeb Storageへ直接保存しない。
- 更新単位を可能な範囲でトランザクション化し、不完全な投稿を作らない。
- データ形式にバージョンを持たせ、将来のマイグレーションへ備える。

### 保存対象

- ぬいぐるみ
- 投稿
- 投稿画像・サムネイル
- 場所
- 一日のまとめ
- ユーザー設定
- アプリメタデータ

## 13. バックアップ形式

Should要件として、バックアップには次を含めます。

- データ形式バージョン
- 出力日時
- アプリバージョン
- ぬいぐるみ
- 投稿
- 画像
- 一日のまとめ
- 設定

復元前に形式と整合性を検証し、破損ファイルによって既存データを上書きしないようにします。

## 14. タイムゾーンに関する暫定方針

- ユーザーが入力・確認した現地の年月日・時刻を維持する。
- UTCのみを保存し、閲覧場所によって行動日が変わる設計は避ける。
- 旅行中や端末タイムゾーン変更時の厳密な扱いは、`08-roadmap-and-open-issues.md` の未決事項とする。
