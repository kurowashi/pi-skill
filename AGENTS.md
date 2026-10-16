# AGENTS.md — pi-skill

読者: pi-skill を変更するエージェントと開発者。利用者向けの仕様は [README.md](README.md)、設計判断は [DESIGN.md](DESIGN.md)。
共通の検証と規則はルートの `AGENTS.md` にある。

## 壊してはいけない制約

- モデル向けのツールは `skill` の1つだけで、`name` の1パラメータを取る。ツールの常時コストは tools セクションの1行（promptSnippet）に収まる（`test/contract/surface.test.ts`）。
- イベントは `before_agent_start` と `context_with_system` のみで各1ハンドラ。コマンド・ショートカット・フラグは登録しない（`test/contract/surface.test.ts`）。
- 変更するのは実効セクションを持つ1メッセージだけ。transcript は変更しない。`<location>` をリクエストから除去する（`test/integration/extension.test.ts`）。
- 一覧は Pi の XML 形式を保ち、`<location>` を含めない。`disable-model-invocation` のスキルは一覧にも registry にも載らない（`test/unit/section.test.ts`）。
- `skill` が有効で read / bash が無効、かつ可視スキルがあるときだけ Pi 形式の一覧を補う。read か bash が有効なら skills セクションに触れない。他拡張が設定した `sections.skills` は上書きしない（`test/integration/extension.test.ts`）。
- ツールが有効でないときは何も返さず、registry も空にする。解析結果が0件または一部のみなら何も返さない（`test/integration/extension.test.ts`）。
- スキルの結果は `/skill:name` の展開と同一形式で、基準ディレクトリを含める。frontmatter と前後空白を除いた本文を返す（`test/unit/section.test.ts`）。
- 未知の名前はエラーと利用可能な一覧を返す。読み取り失敗は `isError` で返し、throw しない（`test/integration/extension.test.ts`）。
- 一覧の形式は Pi の実出力（`formatSkillsForPrompt`）を fixture にして解析できること。Pi の形式に追随するときは fixture を先に更新する（`test/unit/section.test.ts`）。
- 実行時依存を持たない。配布は `files` の範囲内で、`pi.extensions` のエントリを含む（`test/contract/dependencies.test.ts`、`test/ci/package-contents.test.ts`）。

## 変更手順

- 一覧や読み出しブロックの文言を変えるときは、`test/unit/section.test.ts` の golden 値を先に更新する。モデルが見る文字列そのものなので、テストが変更の入口になる。
- Pi の形式に追随するときは、`test/unit/section.test.ts` の fixture を先に更新し、[DESIGN.md](DESIGN.md) の「Pi 拡張としての前提」と「仕様の根拠」を更新する。
- 解析・書き換えの規則を変えるときは、`test/unit/section.test.ts` と `test/integration/extension.test.ts` を先に更新する。
- 登録物を増減するときは、`test/contract/surface.test.ts` の `EXPECTED_EVENTS` / `EXPECTED_TOOLS` を先に更新する。
- 手動で確認する項目は [docs/manual-checks.md](docs/manual-checks.md) に書く。
