# 09. トレーサビリティ

主要な機能領域と、要件・画面・データ・受入基準の対応を示します。

| 領域 | 主な機能要件 | 画面 | 主なデータ | 受入基準 |
|---|---|---|---|---|
| 利用開始 | FR-001〜FR-006 | SC-01 | AppMetadata, UserSettings | AC-001, AC-002 |
| LINE認証・招待 | FR-004, FR-006, FR-009 | SC-01 | User, AuthAttempt, Session | AC-004 |
| 法務情報 | FR-007〜FR-008 | SC-01, SC-08, SC-10, SC-11 | なし | AC-003 |
| ぬいぐるみ | FR-010〜FR-019 | SC-07, SC-03 | Plush, PostPlush | AC-001, AC-005〜AC-008, AC-086 |
| 投稿本文 | FR-020〜FR-023 | SC-03 | Post | AC-010 |
| 投稿写真 | FR-024〜FR-025, FR-040〜FR-054 | SC-03, SC-05 | PostImage | AC-011, AC-012 |
| 行動日時 | FR-026〜FR-028, FR-100〜FR-107 | SC-03, SC-08 | Post, UserSettings | AC-013, AC-020〜AC-022 |
| 場所 | FR-029, FR-060〜FR-066 | SC-03, SC-04 | Location | AC-070, AC-071, AC-073, AC-074 |
| 地図・足あと | FR-068〜FR-079 | SC-02, SC-05 | Post, Location | AC-030〜AC-034 |
| 地図非公開 | FR-080〜FR-084, FR-194 | SC-05, SC-09 | なし | AC-060 |
| きょう画面 | FR-090〜FR-099, FR-138 | SC-02 | Post, DailyJournal, UserSettings | AC-040〜AC-044, AC-083 |
| 日記案内時刻 | FR-110〜FR-116 | SC-02, SC-08 | UserSettings | AC-040〜AC-042 |
| きょうの日記 | FR-120〜FR-155 | SC-05 | DailyJournal, Post, PostImage, Location | AC-050〜AC-054 |
| 履歴 | FR-160〜FR-167 | SC-06, SC-05 | Post, DailyJournal | AC-080 |
| ローカル保存 | FR-170〜FR-181 | SC-01, SC-08 | 全データ | AC-002, AC-072, AC-087 |
| 投稿クラウド保存 | FR-182〜FR-189 | SC-01, SC-03, SC-08 | User, Session, Post, PostImage, Plush | AC-085, AC-087 |
| 印刷・PDF | FR-190〜FR-196 | SC-09 | DailyJournal, Post, PostImage | 将来追加 |
| 共通画面構成・製品アイコン | FR-197〜FR-199 | SC-01〜SC-09 | なし | AC-081, AC-082, AC-084 |

## 非機能要件との対応

| 非機能領域 | 要件ID | 関連する主要機能 |
|---|---|---|
| 操作性 | NFR-001〜NFR-007 | 投稿、日記、エラー処理 |
| レスポンシブ | NFR-010〜NFR-014 | 全画面 |
| 性能 | NFR-020〜NFR-024 | 画像、地図、日別表示 |
| セキュリティ | NFR-030〜NFR-036 | 権限、入力、外部サービス、クラウド保存 |
| プライバシー | NFR-040〜NFR-046 | 地図、位置、ローカル保存、非公開画像 |
| 信頼性 | NFR-050〜NFR-055 | 投稿保存、バックアップ |
| オフライン | NFR-060〜NFR-064 | ローカル閲覧、編集 |
| アクセシビリティ | NFR-070〜NFR-076 | 全画面（AC-008, AC-009, AC-012） |
| 保守性 | NFR-080〜NFR-084 | データ移行、設定、テスト |

## 実装PRでの推奨記載

実装や修正のPull Requestには、次を記載します。

```text
Related requirements:
- FR-xxx
- NFR-xxx

Acceptance criteria:
- AC-xxx

Screens:
- SC-xx
```
