# 設計思想 — pi-skill

読者は pi-skill を変更する開発者と AI エージェントです。共通の哲学は [PHILOSOPHY.md](PHILOSOPHY.md)、検証可能な制約と変更手順は [AGENTS.md](AGENTS.md) にあります。

## 目指すべきところ

対象は、スキルをインストールして Pi を使う開発者です。Pi はスキル一覧（名前・説明・SKILL.md の絶対パス）をシステムプロンプトに常時載せ、モデルに `read` で読ませます。パスは読み出しにしか使いませんが毎リクエストのコンテキストを消費し、`read` は limit や offset で全文を返さない場合があります。pi-skill は一覧を名前と説明だけに保ち、読み出しを `skill` ツールに置き換えます。

### 達成状態

| 状態 | 観測方法 |
|---|---|
| skills セクションから location が消える | `test/integration/extension.test.ts` の location 除去テスト |
| モデルが frontmatter を除いた本文と基準ディレクトリを得る | 同 の本文読み出しテスト |
| 読み出し結果が `/skill:name` の展開と同一形式 | `test/unit/section.test.ts` の golden 値 |
| 表示されているスキルだけが読める | `test/integration/extension.test.ts` の一覧外の名前テスト |
| ツール無効時は Pi 既定のプロンプトに戻る | 同 のツール無効テスト |
| 形式が想定外でもスキルを黙って落とさない | `test/unit/section.test.ts` の部分解析・想定外形式テスト |
| SKILL.md が読めなくてもセッションが止まらない | `test/integration/extension.test.ts` の読み取り失敗テスト |
| 常時コストがツール1つとイベント1つに収まる | `test/contract/surface.test.ts` |

### 最小の成立条件

| 成立条件 | 達成する状態 |
|---|---|
| `skill` ツールの登録（名前1つ、frontmatter と本文の前後空白を除いた本文と基準ディレクトリを返す） | モデルが `skill` ツールで本文と基準ディレクトリを得る |
| `context_with_system` での skills セクション解析と再構築 | skills セクションから location が消える |
| セクション由来の registry | 表示されているスキルだけが読める |
| Pi の実出力を使った fixture テスト | 形式が変わると気づける |
| 無効・不在・想定外のときの no-op | ツール無効時は Pi 既定のプロンプトに戻る |

### 非目標

次の機能は実装しません。提案時はここを先に確認します。

- 設定ファイル・コマンド・ショートカット。挙動が1つに定まっており、切り替える条件が想定されません。
- `/skill:name` の変更。Pi 本体の機能であり、ユーザーの明示的な呼び出しを置き換える理由がありません。
- ツールによるスキル一覧の列挙。一覧は system prompt にあり、入口を増やすとコンテキストと二重管理が増えます。
- transcript からの location 除去。transcript は Pi の記録であり、送信時だけ変換します。
- スキル探索の再実装。Pi が読み込んだ結果であるセクションを唯一の入力とします。
- `disable-model-invocation` の解除。Pi がモデルからの自動呼び出しを禁止する設定の意味を維持します。
- ツールの TUI レンダラ。既定の表示で足ります。
- 複数スキルの一括読み出し。読み出す単位はモデルが選ぶ1つで足ります。

### 拡張の条件

最小の成立条件を超える機能は、最小構成には含めません。現在の設計に含まれるものも今後の追加も、達成状態への寄与を実測で示せるときだけ維持・追加します。実測で寄与が示せない機能は削除の候補とします。

## 固有の原則

- 書き換えは `context_with_system` で行います。`before_agent_start` の `sections.skills` 上書きはハンドラの実行順に依存し、あとから `options.skills` をフィルタする拡張（pi-switch など）の結果を打ち消すことがあります。`context_with_system` は `before_agent_start` の後に発火するため、そこで確定した一覧を変換できます。
- 書き換えの保証範囲は `before_agent_start` の結果までです。同じ `context_with_system` イベントの後続ハンドラがセクションを再変更した場合は反映しません。ツールの有効判定は `pi.getActiveTools()` とリクエスト時のツール宣言が一致することを前提とします。
- transcript を変更しません。書き換えはリクエスト時だけなので、セッションの保存内容は Pi のままです。compaction・resume・`/reload` が書き換えの影響を受けません。
- 一覧とツールの index は同じセクションから作ります。表示されているスキルだけが読め、表示と実行が食い違いません。
- Pi の形式を再利用します。読み出し結果は `/skill:name` の展開と同じブロックにし、一覧の XML 形式は Pi の出力を保ちます。
- 想定外なら何もしません。セクション不在、解析結果0件、一部のスキルしか解析できないとき、ツール無効のときは Pi 既定のプロンプトをそのまま送ります。
- スキルの場所は `<location>` だけを入力にします。ファイル探索や設定ファイルによる再解決は行わず、`<location>` の親ディレクトリを基準ディレクトリとして結果に含めます。

## Pi 拡張としての前提

Pi 1.0.3 で確認した前提です。

| 前提 | 根拠 |
|---|---|
| `context_with_system` は全 `before_agent_start` の後、送信直前に発火し、返した `messages` がそのまま送信される | `dist/core/extensions/runner.js` の `emitContext` |
| transcript は `context_with_system` の返り値では変更されない | 送信経路の `transformContext`。pi-switch も同じ前提で動いています |
| skills セクションは `systemPromptOptions.skills` から毎回再生成される | `dist/core/system-prompt.js` の `buildSystemPromptSections` |
| `disable-model-invocation` のスキルはセクションから除外される | `dist/core/skills.js` の `formatSkillsForPrompt` |
| `/skill:name` の展開は `<skill name location>` ブロックで、本文は `stripFrontmatter` と `trim` 済み | `dist/core/agent-session.js` の `_expandSkillCommand` |
| `/skill:name` の展開は name / location をエスケープせず属性へ埋める | `dist/core/agent-session.js` の `_expandSkillCommand`。読み出しブロックも同じ扱いに揃えています |
| キャッシュウォーマーは `transformContext` 適用後の context を再送する | `dist/core/sdk.js` と `pi-agent-core` の `streamAssistantResponse` |
| `forceSystemPrompt` 中は structured sections が無い | `dist/core/system-prompt.js` の `buildSystemPromptState` |

## 仕様の根拠

| 対象 | 確認方法 |
|---|---|
| セクションの形式（`<skills>` / `<available_skills>` / `<skill>` / `<name>` / `<description>` / `<location>`） | `dist/core/skills.js` の `formatSkillsForPrompt` と、その出力を fixture にした `test/unit/section.test.ts` |
| 読み出しブロックの形式 | `dist/core/agent-session.js` の `_expandSkillCommand` と golden テスト |
| イベントの発火順と返り値の扱い | `dist/core/extensions/runner.js` と `dist/core/agent-session.js` |
| キャッシュウォームとの整合 | `dist/core/sdk.js` の `cacheWarmer.start` 呼び出し |
