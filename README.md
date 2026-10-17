# pi-skill

Pi のスキルを `skill` ツールで読み出す Pi 拡張です。

Pi は、すべてのスキルの名前・説明・SKILL.md の絶対パスを毎リクエストのシステムプロンプトに載せ、モデルに `read` で SKILL.md を読ませます。
パスは毎回コンテキストを消費し、`read` は limit 指定などで本文を全部返さないことがあります。
pi-skill は、一覧からパスを外し、読み出しを `skill` ツールに替えます。

## インストール

動作要件は次のとおりです。

- Pi 1.0.3 で動作確認しています。それ以前のバージョンは未検証です。
- Node.js 22.19 以上

```bash
pi install git:github.com/kurowashi/pi-skill
```

バージョンを固定する場合は `pi install git:github.com/kurowashi/pi-skill@<tag|commit>` を使います。
ローカルの作業コピーを使う場合は `pi install /path/to/pi-skill` を使います。

## 使い方


設定はありません。インストールすると、次のリクエストから有効になります。

モデルは、一覧の説明が作業に合うスキルを `skill` ツールで読みます。

```
モデル: skill({ name: "pdf-tools" })
```

ユーザーが直接呼ぶ場合は、Pi 本体の `/skill:name` を使います。引数はスキルの本文の後ろに続きます。

```
/skill:pdf-tools extract report.pdf
```

## コマンド

コマンドは登録しません。モデル向けのツール `skill` を登録します。

## 仕組み

### 動作


1. 一覧からスキルの場所（`<location>`）を外して、モデルに送る
2. モデルは一覧の名前と説明だけでスキルを選ぶ
3. `skill({ name })` で、スキルの本文と基準ディレクトリを受け取る

ユーザーが `/skill:name` と入力したときは、Pi 本体の展開がそのまま使われます。pi-skill は介入しません。

モデルが見る一覧は次のように変わります。下は要点だけを抜き出した例です。

Pi 既定（`read` で読むよう指示し、場所を含む）:

```xml
<available_skills>
  <skill>
    <name>pdf-tools</name>
    <description>...</description>
    <location>/home/me/.agents/skills/pdf-tools/SKILL.md</location>
  </skill>
</available_skills>
```

pi-skill（場所を含まず、`skill` ツールで読むよう指示）:

```xml
<available_skills>
  <skill>
    <name>pdf-tools</name>
    <description>...</description>
  </skill>
</available_skills>
```

`skill` ツールの結果は、ユーザーが `/skill:name` で呼んだときと同じ形式です。frontmatter と本文の前後の空白は除かれ、基準ディレクトリが添えられます。

```text
<skill name="pdf-tools" location="/home/me/.agents/skills/pdf-tools/SKILL.md">
References are relative to /home/me/.agents/skills/pdf-tools.

# PDF tools
...
</skill>
```

### 挙動


| 条件 | 挙動 |
|---|---|
| `skill` が有効で、`read` か `bash` が有効 | 一覧から `<location>` を外し、読み出しを `skill` ツールに替える |
| `skill` が有効で、`read` と `bash` が無効 | Pi と同じ形式の一覧を pi-skill が補う。`<location>` は含まない |
| `skill` が無効 | 一覧を書き換えず、Pi 既定に戻す。`read` と `bash` の有無は問わない |
| `skill`・`read`・`bash` がすべて無効 | 一覧は生成されない（Pi の仕様） |
| 一覧が解析できない、または一部のスキルだけが解析できた | 一覧を書き換えず、Pi 既定のまま送る |
| 他の拡張が `skills` の一覧を既に設定している | 補完はしない。その一覧が解析できれば、他の行と同じく書き換える |
| 一覧にない名前を指定した | エラーと、利用できるスキルの名前の一覧を返す |
| 利用できるスキルが無い状態で呼んだ | 「利用できるスキルがない」旨のエラーを返す |
| SKILL.md が読めない | エラーを返す。セッションは止まらない |
| `disable-model-invocation: true` のスキル | 一覧に載らないため、`skill` ツールでも読めない。`/skill:name` では使える |
| pi-switch などがスキルを無効化した | 一覧から消え、`skill` ツールでも読めない |
| セッションの保存内容 | 変わらない。圧縮・再開・`/reload` の影響を受けない |

## 制限


- 1 回の呼び出しで読むのは 1 つのスキルです。複数のスキルをまとめて読むことはできません。
- `read` と `bash` が無効なときの一覧は、`before_agent_start` の時点で拡張が見ているスキルから作ります。pi-switch を使う場合は、pi-switch を pi-skill より先に読み込んでください。後から絞り込まれたスキルが一覧に残るのを防ぐためです。
- `forceSystemPrompt` でシステムプロンプトを丸ごと差し替えている場合は、一覧が無いため何もしません。
- スキルの名前は一覧に表示されるとおりに指定してください。

## ライセンス

[MIT](LICENSE)
