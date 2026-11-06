# markdown-next rewrite baseline

この資料と golden は現行動作の記録であり、Markdown の正しさを判定する仕様ではない。
`src/`、既存テスト、lockfile、依存関係は変更しない。新しい依存関係も追加していない。

## 凍結元と再現コマンド

- package: `@minamorl/markdown-next` 2.2.4
- local `main` / `origin/main`: `f71fb55dd35cd102c64135ae15a9837ee3ca6b21`
- Node: `v26.12.1` (CI と同じ)、V8: `14.6.202.34-node.40`
- Parsimmon: `1.18.1`、TypeScript: `6.0.2`、Mocha: `11.7.5`
- 現行の `test/test-parser.ts` は 178 tests。実行中の全 `Parser.parse` 呼出しから、
  `(input, plugin profile)` が同じものだけをまとめ、179 入力を保存した。
  `sources` に元の test full title を残している。入力を正規表現で抜き出してはいない。

依存関係の導入済み checkout で、リポジトリ直下から実行する。以下は外部通信を必要としない。

```sh
# 元のテスト。pnpm 11 の自動 install を明示的に無効にする。
pnpm_config_verify_deps_before_run=false pnpm test

# build + consumer API 型検査 + golden 比較 + 検査器自身の negative controls
npm run test:characterization

# 全 corpus、HTML と AST の両方。出力先は bench/ 内、通常実行は既存ファイルを拒否する。
npm run bench -- --output=bench/results/recheck.json

# 中断時は同じ引数に resume を追加する。保存済み child は再実行しない。
npm run bench -- --output=bench/results/recheck.json --resume=true

# 一入力だけの smoke run (各 cold n=5、warm n=5)
npm run bench -- --case=plugin-inline --warm-samples=5 --output=bench/results/smoke.json

# この baseline checkout で raw・journal・hash・集計を再照合 (再計測はしない)
npm run bench:verify
```

`npm run build` は既存の `tsc` を使い、既存設定どおり ignored な `lib/` を生成する。
新 runner の `.cjs` は build 対象に加えず、型の consumer 契約だけ `.ts` として検査する。
plain `pnpm test` はこのホストの pnpm 11 の自動 install が workspace 外の store を開こうとして
停止したため、上の環境変数を付けた。lockfile / workspace 設定の修正や install は行っていない。

`characterization:freeze` は初回採取専用である。元 commit 以外、元ソースとの差異、既存の
`corpus.json` / `golden.json` がある場合は拒否する。通常テストと bench は golden を書かない。
将来の書き直しで差分が出ても、自動再採取で通してはいけない。

## corpus と比較の範囲

287 入力: legacy 179、機能境界 92、plugin 5、組合せ 2、長文 9。
長文は日本語・英語・両者を混ぜた文書をそれぞれ 1,000 / 10,000 / 60,000 UTF-16 code units
に固定したもの。seed の末尾を切るため、途中で切れた Markdown も含む。
元テストの入力と追加入力に重なりがあっても、出所を保つため追加分との統合はしない。

- heading / setext / 強調 / link / image / list / quote / math
- 青空文庫 ruby、空の読み・未閉鎖・改行・ASCII pipe との差
- HTML の属性・大小文字・不整合・未閉鎖・self closing・script・文字実体
- inline / block / 未定義 / 不正名 / 例外を投げる plugin
- table の pipe escape、backslash の連続、backtick の連続、列数差、不正 separator、空セル
- footnote のソート・重複・未定義・空の定義・継続行
- code span の run 長 1–6 と不一致、fence の空内容・短い閉鎖・長い閉鎖・未閉鎖・CRLF
- 空入力、全角空白、CR / LF / CRLF、NUL、日本語、英語、絵文字、結合文字

HTML は既定では公開 `parse(input)`、plugin があれば `new Parser({ export: asHTML, plugins })`。
AST は `new Parser({ export: asAST, plugins })`。両方の return 値または例外 name/message、
`console.error` の整形済み出力、plugin callback の引数・content・mapper/join の型・呼出し順を
JSON に保存する。JSON 往復で変わる値は採取を拒否し、暗黙の正規化はしない。

通常 runner は fresh parser に加え、plugin profile ごとに同じ Parser を使って corpus 全体を
正順・逆順に再実行する。合計 1,722 回の exact deep comparison で list 等の状態漏れも調べる。
HTML / AST / plugin 引数を意図的に壊した隔離プロセスが非ゼロ終了する negative control と、
percentile の既知値・最小サンプル数・bench worker の出力照合も別途検査する。

公開 runtime export の名前集合も固定する。consumer 型検査は `parse`、`Parser`、`asAST`、
`asHTML`、`Plugin`、`Mapper`、`ExportType` の利用例を build する。
README の `ASTNode` は現行 `.d.ts` に存在せず、`parse` / `Parser.parse` の戻り値型は `any`。
これは既存との差異として記録し、この lane では型を追加・修正しない。
tuple の実際の形は AST golden で比較する。

## 計測方法

計測も全 287 入力を使う。各入力・各 mode を順番に実行し、並列 worker は使わない。
local subprocess は計測の隔離用で、agent は起動しない。

- **cold n=5**: 毎回新しい Node process を起動し、module と corpus の読込み後、GC を一度実行して
  最初の parse 一回を測る。process 起動・module import・corpus IO・GC の時間は含めない。
  OS の cold cache やアプリ起動全体を表す値ではない。
- **warm n=20**: 最初の cold process で、その一回の後に 10 回追加 warmup し、連続 20 回を測る。
  各回で新しい Parser を構築する。再利用 Parser のスループットとは異なる。
- `process.hrtime.bigint()` で parse と Parser 構築の時間を測り、ms に換算する。
  callback の観測と例外捕捉は含むが、hash 化・golden 照合・ファイル IO は時間外。
  全測定の出力を golden の digest と照合し、違えば停止する。
- p50 / p95 は nearest rank (`sorted[ceil(p*n)-1]`)。cold n=5 の p95 は最大値なので、
  安定した tail 推定ではない。raw sample を必ず併読する。
- メモリは各呼出し前後の `heapUsed` の差を時間外で記録する。割当総量ではない。
  測定中の GC により負になりうるため、allocation の改善率をこの値から主張しない。
- 正常 return と例外は raw の `status` で区別する。例外入力の時間を正常 parse の速度と解釈しない。
- raw は全サンプル、各入力の p50/p95、文字数・code point 数・UTF-8 bytes、source/corpus/harness
  SHA-256、Node/V8 と依存関係、CPU/OS、開始終了時刻、前後の load average を含む。
- 各 child の終了・golden 照合後、`<output>.journal.jsonl` に raw を追記して `fsync` する。
  `--resume=true` は source / compiled parser / golden / harness の hash、runtime、引数を照合し、
  保存済み child を再利用する。書込み途中の末尾行だけ切り捨てる。完了後も journal を残す。
  最終 JSON の書込み中に停止した場合も、同じ journal を使って `--resume=true` で再構成できる。

ホストは共有環境で CPU pinning / 周波数固定を行わない。比較は同じホスト・Node/V8・corpus・
同じ harness で、他の重い処理を避けて複数回行うこと。
CEO 手元の「59,250 字 / 16.8 ms」は入力・mode・warmup 等が未確認なので比較の基準には使わない。

## 計測結果

全入力の raw と集計は [`bench/results/baseline.json`](../bench/results/baseline.json)、
child ごとの永続記録は [`baseline.json.journal.jsonl`](../bench/results/baseline.json.journal.jsonl)。
`npm run bench` を既定値 (cold n=5 / warm n=20 / 追加 warmup=10) で実行した。
計測は 2026-11-06 17:30:56.825–17:39:55.821 UTC (2026-11-07 02:30:56.825–02:39:55.821 JST)。
Node `v26.12.1` / V8 `14.6.202.34-node.40`、Linux `7.0.0-38-generic` x64、
AMD Ryzen 5 3600 6-Core Processor、logical CPU / available parallelism はともに 12。

load average (1 / 5 / 15 分) は開始時 `13.44 / 13.36 / 14.94`、終了時
`30.52 / 30.78 / 23.71`。**共有ホストの負荷下で得た値であり、隔離された性能測定ではない。**
別の時刻・ホストの数値との速度比をこの一回から主張しない。再現用 harness と corpus は固定されて
いるが、速度比較時は同じ環境と負荷条件で baseline と候補を改めて測る必要がある。

以下は長文入力の抜粋。ms は小数第 3 位、net heap は KiB の小数第 1 位に丸めている。
全 574 input/mode の未丸め値と全 14,350 観測値 (cold 2,870 / warm 11,480) は raw を参照。
全サンプルの出力 digest・status を golden に照合し、p50/p95/heap median を raw の独立した
ソートで再計算した。例外観測は 75、net heap delta が負の観測は 2,405。
**net heap の欄は割当総量ではなく、GC をまたぐ正味の変化**である。

| input | mode | cold p50 ms | cold p95 ms | warm p50 ms | warm p95 ms | warm net heap p50 KiB |
|---|---|---:|---:|---:|---:|---:|
| long-ja-1000 | html | 21.181 | 27.489 | 7.418 | 13.018 | 137.6 |
| long-ja-1000 | ast | 21.413 | 33.187 | 6.332 | 7.220 | 89.2 |
| long-en-1000 | html | 19.552 | 22.860 | 4.669 | 7.165 | 1435.4 |
| long-en-1000 | ast | 28.554 | 64.197 | 4.028 | 6.298 | 1396.4 |
| long-mixed-1000 | html | 38.233 | 52.716 | 3.869 | 15.424 | 634.3 |
| long-mixed-1000 | ast | 24.253 | 46.483 | 3.951 | 6.158 | 596.1 |
| long-ja-10000 | html | 104.741 | 137.003 | 80.715 | 135.862 | -1672.9 |
| long-ja-10000 | ast | 124.802 | 234.196 | 55.934 | 97.067 | -2165.7 |
| long-en-10000 | html | 78.477 | 103.532 | 52.672 | 79.176 | -422.2 |
| long-en-10000 | ast | 76.458 | 85.345 | 43.129 | 65.202 | 3132.3 |
| long-mixed-10000 | html | 97.566 | 170.439 | 42.754 | 85.487 | 2946.7 |
| long-mixed-10000 | ast | 83.129 | 91.674 | 42.038 | 114.694 | 2795.5 |
| long-ja-60000 | html | 488.318 | 934.287 | 469.183 | 601.758 | 1972.6 |
| long-ja-60000 | ast | 269.650 | 344.972 | 218.914 | 302.603 | 15800.3 |
| long-en-60000 | html | 180.843 | 188.431 | 155.087 | 197.885 | 1984.1 |
| long-en-60000 | ast | 169.116 | 183.552 | 161.741 | 201.550 | -145.9 |
| long-mixed-60000 | html | 174.147 | 281.151 | 131.181 | 178.204 | -2483.7 |
| long-mixed-60000 | ast | 242.136 | 281.298 | 140.737 | 157.306 | -3738.2 |

中断復旧の smoke は実測済みの先頭 3 child 記録から、末尾 JSONL 行と最終 JSON を意図的に
途中で切ったものを作って実行した。保存済みサンプルが deep equality で維持され、残りのみを
測定し、両 mode の最終 JSON が再構成されたことを `bench/evidence/resume-smoke.txt` に残している。
`smoke.json` / `resume-smoke.json` は復旧試験用であり、上の baseline 表には混ぜていない。


## 気づいた不審な出力（修正しない）

以下は golden から読んだ現物。HTML と AST が意味的に一致するという検査は加えない。

| corpus ID | 観測した出力・差異 |
|---|---|
| `table-invalid-separator` | HTML は文字列 `[object Object]`。AST は `status:false` / `expected:["Not a valid table separator"]` を含む object が最上位に入る。 |
| `table-no-body` | separator に body row がない場合は table でなく `<p>\| a \|<br />\|---\|</p>`。 |
| `table-align` | alignment 指定があっても HTML / AST の属性には残らない。 |
| `html-attrs` | `<div class="x" data-id="1">text</div>` が `<p><div>text</div></p>` になり、属性が落ちる。 |
| `html-mismatch` | `<b class="x">text</i>` が `<p><b>text</i></p>`。属性だけ落ち、不整合な閉じタグを保つ。 |
| `html-selfclosing` | `br` / `hr` は AST node だが、同じ入力の `<img src="x" />` は複数の文字列に分かれる。 |
| `html-entities`, `fence-html` | text と code 内の `<` / `&` を一律 escape しない。例: `<pre data-language="html"><code><script>&</script></code></pre>`。 |
| `plugin-unknown` | inline の `@[missing:x:y]` が `@[missingx:y]` に変わり、最初の `:` がなくなる。block では `:` を保つ。 |
| `plugin-inline` | 一つの plugin が一回の parse 中に二度 callback される。二つの inline plugin で計四回。backtracking の副作用も凍結する。 |
| `plugin-block` | inline の args は `x:y`、block は `:x:y`。block content は HTML で文字列、AST では行ごとの配列。 |
| `legacy-070` | 既存の `extention` plugin は HTML で成功し、AST では `TypeError: content.trim is not a function`。両方をそのまま記録する。 |
| `ruby-newline` | ruby の base に改行が入り、そのまま `<ruby>漢\n字<rt>かんじ</rt></ruby>` になる。 |
| `combination-contexts` | ruby は paragraph/quote で node になるが heading/list/table では文字列。footnote ref も context で扱いが異なる。 |
| `footnote-duplicate` | 同じ `id="fn2"` の `<li>` が二つ生成される。`02` と `2` も区別したまま数値順に並ぶ。 |

## Evidence

コマンド・終了コード・実出力は `bench/evidence/` に保存する。
`initial-pnpm-tests.txt` は元の `pnpm test`、`freeze.txt` は初回採取、
`characterization.txt` は build・golden 比較・negative controls、`harness-lint.txt` は lint の実出力。
`preflight.txt` は高価な計測の前の自己確認、`baseline-run.txt` は全計測コマンドの実出力、
`raw-validation.txt` は全サンプル・集計値・provenance の独立照合結果。
`final-raw-validation.txt` は保存した `bench/verify.cjs` による同じ照合の再実行結果。
`final-checks.txt` は最終の既存テスト・特性テスト・検査器の検査、`final-lint.txt` は最終 lint。
実行コマンドと各出力ファイルの対応は `commands.txt` にある。
`git-delivery.txt` は worker からの `git add` が Git 管理領域の read-only 制限で停止した実出力。
成果物の commit は Git 管理領域に書き込める root の実行環境で行う必要がある。
ローカルの `node_modules/mocha/lib/mocha.js` と Node API の同梱型宣言
(`@types/node/child_process.d.ts`, `process.d.ts`) を読んで使用箇所を確認した。
外部ネットワークにアクセスして API 資料を取得してはいない。
