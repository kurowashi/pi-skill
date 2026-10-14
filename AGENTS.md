# AGENTS.md — pi-skill で作業するエージェント向けの指示

読者は pi-skill を変更する AI エージェントと開発者です。利用者向けの仕様は [README.md](README.md) に、設計の判断基準は [DESIGN.md](DESIGN.md) と [PHILOSOPHY.md](PHILOSOPHY.md)（このプラグイン群共通）に書きます。

ここには、壊してはいけない制約と、制約に触れる変更の手順だけを書きます。下の表は各制約の索引です。自動テストで検証する制約はテストを正とし、その他の制約は表の「定義・実装箇所」に記載した設定または実装を正とします。検証手段を併記できないものは制約として書かず、自動テストできない範囲は末尾に分けます。

## 完了条件

`npm run verify`（`npm run check` + `npm run knip` + `npm test` + `npm run test:coverage`）が通ること。フックが通っても CI が通らなければ未完了です。CI は同じ `verify` を Node 22.19 / 24 で実行します。カバレッジは `test/unit` と `test/integration` で計測します。下の表の「検証」列は個別の検証箇所であり、自動検証はすべて `verify` に含まれます。

## 制約

### フック面

| 制約 | 検証 | 定義・実装箇所 |
|---|---|---|
| モデル向けのツールは `skill` 1つだけ | `test/contract/surface.test.ts` | `src/index.ts` |
| ツールは `name` 1パラメータを取る | `test/integration/extension.test.ts` | `src/index.ts` |
| ツールの常時コストは tools セクション1行（promptSnippet）に収まる | `test/contract/surface.test.ts` | `src/index.ts` |
| イベントは `before_agent_start` と `context_with_system` のみで、各1ハンドラ | `test/contract/surface.test.ts` | `src/index.ts` |
| コマンド・ショートカット・フラグを登録しない | `test/contract/surface.test.ts` | `src/index.ts` |

### セクションの書き換え

| 制約 | 検証 | 定義・実装箇所 |
|---|---|---|
| `<location>` をリクエストから除去する | `test/integration/extension.test.ts` | `src/index.ts` の `rewriteSection` |
| 指示文を `skill` ツール向けに差し替える | `test/integration/extension.test.ts` | `src/skills.ts` の `renderSkillSection` |
| 変更するのは実効セクションを持つ1メッセージだけ | `test/integration/extension.test.ts` | `src/index.ts` の `lastSectionMessageIndex` |
| transcript を変更しない | `test/integration/extension.test.ts` | `src/index.ts` の `context_with_system` |
| ツールが有効でないときは何も返さず、registry も空にする | `test/integration/extension.test.ts` | `src/index.ts` の `forgetSkills` |
| セクション不在なら何も返さない | `test/integration/extension.test.ts` | `src/index.ts` |
| 解析結果が0件または一部のみなら何も返さない | `test/unit/section.test.ts` と `test/integration/extension.test.ts` | `src/skills.ts` の `parseSkillIndex` |
| XML entities を解析時に復号し、描画時にエスケープする | `test/unit/section.test.ts` | `src/skills.ts` の `unescapeXml` / `escapeXml` |
| `skill` 有効・read / bash 無効・可視スキルありで Pi 形式の一覧を補う | `test/integration/extension.test.ts` | `src/index.ts` の `before_agent_start` |
| read か bash が有効なら skills セクションに触れない | `test/integration/extension.test.ts` | `src/index.ts` の `before_agent_start` |
| ツール無効または可視スキル0件なら一覧を補わない | `test/integration/extension.test.ts` | `src/index.ts` の `before_agent_start` |
| 他拡張が設定した `sections.skills` を上書きしない | `test/integration/extension.test.ts` | `src/index.ts` の `before_agent_start` |

### ツール

| 制約 | 検証 | 定義・実装箇所 |
|---|---|---|
| frontmatter と前後空白を除いた本文を返す | `test/integration/extension.test.ts` | `src/index.ts` の `execute` |
| 結果は `/skill:name` の展開と同一形式 | `test/unit/section.test.ts` | `src/skills.ts` の `formatSkillBlock` |
| 基準ディレクトリを結果に含める | `test/integration/extension.test.ts` | `src/skills.ts` の `formatSkillBlock` |
| セクションに無いスキルは読めない | `test/integration/extension.test.ts` | `src/index.ts` の `SkillRegistry` |
| 未知の名前はエラーと利用可能な一覧を返す | `test/integration/extension.test.ts` | `src/index.ts` の `execute` |
| registry が空ならその旨を返す | `test/integration/extension.test.ts` | `src/index.ts` の `execute` |
| 読み取り失敗は `isError` で返し、throw しない | `test/integration/extension.test.ts` | `src/index.ts` の `execute` |

### 一覧の形式

| 制約 | 検証 | 定義・実装箇所 |
|---|---|---|
| 一覧は Pi の XML 形式を保ち、`<location>` を含めない | `test/unit/section.test.ts` | `src/skills.ts` の `renderSkillSection` |
| 一覧は Pi の実出力（`formatSkillsForPrompt`）を fixture に解析できる | `test/unit/section.test.ts` | `src/skills.ts` の `parseSkillIndex` |
| `disable-model-invocation` のスキルは一覧にも registry にも載らない | `test/unit/section.test.ts` | `src/skills.ts` の `parseSkillIndex` |

### 依存関係・import

| 制約 | 検証 | 定義・実装箇所 |
|---|---|---|
| 実行時依存を持たない（`dependencies` は空） | `test/contract/dependencies.test.ts` | `package.json` |
| `src` の import は node builtin・相対 `.ts`・Pi 提供パッケージのみ | `test/contract/dependencies.test.ts` | `test/contract/dependencies.test.ts` の `ALLOWED_PEER_DEPENDENCIES` |
| 循環依存を作らない | `npx biome check .` | `biome.jsonc` の `noImportCycles` |
| 未宣言の依存を import しない | `npx biome check .` | `biome.jsonc` の `noUndeclaredDependencies` |
| 未使用の export・依存・ファイルを残さない | `npm run knip` | `knip.jsonc` |
| devDependency は allowlist 内のみ | `test/contract/dependencies.test.ts` | `test/contract/dependencies.test.ts` の `ALLOWED_DEV_DEPENDENCIES` |

### 配布・ビルド

| 制約 | 検証 | 定義・実装箇所 |
|---|---|---|
| 配布物は `files` の whitelist 内のみ | `test/ci/package-contents.test.ts` | `package.json` の `files` |
| `pi.extensions` のエントリが配布物に含まれる | `test/ci/package-contents.test.ts` | `package.json` の `pi.extensions` |
| ビルド工程を持たない（TS を直接配布） | `test/ci/package-contents.test.ts` | `package.json`（`build` script なし、`pi.extensions` が `./src/index.ts`） |

### コード品質

| 制約 | 検証 | 定義・実装箇所 |
|---|---|---|
| `enum` / `namespace` / parameter properties を使わない | `npx tsc --noEmit` | `tsconfig.json` の `erasableSyntaxOnly` |
| 型は `any` なし、非null断言なし、浮いた Promise なし | `npx biome check .` | `biome.jsonc` の `suspicious` / `nursery` |
| `console` を使わない | `npx biome check .` | `biome.jsonc` |
| 認知複雑度は 12 以下 | `npx biome check .` | `biome.jsonc` の `noExcessiveCognitiveComplexity` |
| 相対 import は `.ts` 拡張子付き、パスエイリアスなし | `npx tsc --noEmit` + Node 実行 | `tsconfig.json` |

## 変更時の手順

- 一覧や読み出しブロックの文言を変える場合は `test/unit/section.test.ts` の golden 値を先に更新します。モデルが見る文字列そのものなので、テストが変更の入口になります。
- Pi の形式に追随する場合は `test/unit/section.test.ts` の fixture（`formatSkillsForPrompt` の実出力）を先に更新し、[DESIGN.md](DESIGN.md) の前提表と根拠表を更新します。
- 解析・書き換えの規則を変える場合は `test/unit/section.test.ts` と `test/integration/extension.test.ts` を先に更新します。
- 登録物を増減する場合は `test/contract/surface.test.ts` の `EXPECTED_EVENTS` / `EXPECTED_TOOLS` を先に更新します。1つ落とすと機能が静かに消えるため、契約が変更の入口になります。
- 依存を追加する場合は devDependency のみ可能です。`ALLOWED_DEV_DEPENDENCIES` の更新とコミットメッセージの理由をセットで行います。実行時依存（`dependencies`）の追加は不可です。
- ドキュメントの段落内では改行しません。改行は段落の区切りにだけ使います。

## 手動確認

自動検証の対象外の確認は [docs/manual-checks.md](docs/manual-checks.md) に書きます。
