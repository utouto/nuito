# Architecture Decision Records

ADRは、後から理由を理解する必要がある重要な技術判断を記録します。小さな実装判断をすべてADRにしません。

## ADRが必要な例

- framework、DB、認証方式、外部サービスの採用・変更
- データ保持、信頼境界、主要module境界
- 公開APIや互換性へ長期的な影響を与える判断
- 運用、コスト、可用性へ大きく影響する判断

## 運用

1. [`template.md`](template.md) を連番と短い名前でコピーする（例: `0001-use-example.md`）。
2. 実装前に選択肢、影響、判断をレビューする。
3. 採用後は過去のADRを書き換えず、新しいADRから `superseded` として置き換える。
4. 関連するIssue、設計、実装へ相互リンクする。

