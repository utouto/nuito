---
name: api-development
description: HTTP APIやendpointを追加・変更し、request validation、response、status code、認証認可、DB境界、APIテスト、docsを整えるときに使う。内部関数だけの変更には通常使わない。
---

# API開発

APIを一貫した契約として設計・実装するための手順です。

## 開始前

1. `AGENTS.md` と、存在する場合はAPI仕様docsを確認する。
2. 既存endpoint、routing、validation、error形式を調べる。
3. 呼び出し元とデータ保存先を確認する。
4. 認証・認可の要否を確認する。

## 契約設計

- HTTP method
- path
- request body / query / path parameter
- validation
- response body
- status code
- error response
- authentication / authorization
- idempotencyが必要か
- paginationが必要か

既存APIの形式を優先する。

## 入力

- ユーザー入力を信頼しない。
- 必須・型・長さ・範囲・形式を検証する。
- 数値、日時、識別子などは有効範囲と形式を確認する。
- 不正入力は一貫した4xxで返す。

## 処理

- handlerへ過剰な責務を集中させない。
- DB処理は `database` の方針に従う。
- 外部AI処理は `ai-feature` の方針に従う。
- 内部例外をそのままクライアントへ露出しない。

## response

- status codeと本文を一致させる。
- 内部実装情報やSecretを含めない。
- クライアントが安定して扱える形を保つ。

## テスト

必要に応じて確認する。

- 正常系
- validation error
- 未認証 / 権限不足
- not found
- DB failure
- external service failure
- 重複・idempotency
- 境界値

## 完了時

- API仕様docs更新の必要性を確認する。
- 破壊的変更の場合は影響範囲を明示する。
