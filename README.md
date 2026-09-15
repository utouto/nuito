# ぬいログ

ぬいぐるみと一緒に出かけた記録を、写真・ひとこと・場所・時刻とともに残し、地図と日記で振り返るスマートフォン向けWebアプリです。

現在は要件定義段階です。プロダクト要件の正本は [`docs/requirements/README.md`](docs/requirements/README.md) を参照してください。

- 文書バージョン: `0.2.0-draft`
- 更新日: `2026-09-15`
- 対象: 初期リリース（MVP）および将来拡張
- 正本: [`docs/requirements/README.md`](docs/requirements/README.md)

## AI・開発者向けの読み順

1. [`AGENTS.md`](AGENTS.md)
2. [`docs/requirements/README.md`](docs/requirements/README.md)
3. [`docs/requirements/01-product-overview.md`](docs/requirements/01-product-overview.md)
4. [`docs/requirements/02-domain-rules.md`](docs/requirements/02-domain-rules.md)
5. [`docs/requirements/03-functional-requirements.md`](docs/requirements/03-functional-requirements.md)
6. 必要な詳細文書

## ディレクトリ構成

```text
.
├── AGENTS.md
├── README.md
└── docs/
    └── requirements/
        ├── README.md
        ├── 01-product-overview.md
        ├── 02-domain-rules.md
        ├── 03-functional-requirements.md
        ├── 04-screen-requirements.md
        ├── 05-data-requirements.md
        ├── 06-non-functional-requirements.md
        ├── 07-acceptance-criteria.md
        ├── 08-roadmap-and-open-issues.md
        └── 09-traceability.md
```

## 重要な前提

- 初期版はスマートフォン向けWebブラウザアプリです。
- 地図・写真・日記は個人の記録であり、他ユーザーへの公開機能はありません。
- 初期版ではローカル保存を中心とし、LINEログイン、クラウド同期、プッシュ通知は将来拡張です。
- 一日の切り替え時刻は初期値 `00:00` で、ユーザーが変更できます。
- 日記案内時刻は初期値 `21:00` で、ユーザーが変更できます。
- 両時刻は独立した設定です。
