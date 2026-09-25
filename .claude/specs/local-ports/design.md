# ローカル起動ポートの表示 — 設計

## データ構造

プロジェクトのレコード（`data/projects.local.json` の `projects[]`）に 1 フィールド足す。

```js
/**
 * @typedef {Object} LocalPort
 * @property {number} port      5178
 * @property {string} label     注記。無ければ ''（例: 'AI Radar 画面'）
 * @property {string} command   起動方法（例: 'pnpm dev'）。バッククォートは外す
 * @property {string} url       開く URL 列の値そのまま（例: 'http://127.0.0.1:5178'、'ブラウザでは開かない'）
 * @property {string} config    設定の場所（バッククォートは外す）
 */
// project.ports: LocalPort[]   // 常に配列。remote-only のレコードも []
```

既存データの移行は不要。`projects.local.json` は毎回スキャンで作り直し、`ports` が無い古いファイルでも
画面側は `p.ports ?? []` で扱う。

## 処理の流れ

1. `scripts/scan.mjs` の `runScan()` で、`reconcile()` の後に `loadPorts()` を 1 回呼ぶ
2. `loadPorts()`（新規 `scripts/lib/ports.mjs`）
   - `path.join(PROJECTS_ROOT, 'PORTS.md')` を読む。読めなければ空の Map を返す
   - `## 一覧` 見出しの次の表だけを対象にする（次の `## ` 見出しまで）
   - ヘッダ行と区切り行（`|---|`）を飛ばし、各行を `|` で分割してセルにする
   - 1 列目が整数でない行は捨てる
   - 「プロジェクト」列を `/^(.+?)（(.+)）$/` で「ディレクトリ名」と「注記」に分ける
   - 戻り値: `Map<ディレクトリ名, LocalPort[]>`
3. `runScan()` で `projects.forEach(p => p.ports = map.get(p.localDir) ?? [])`
   - `localDir` が無いレコード（GitHub のみ）は `[]`
4. 画面
   - `src/cards.js`: ポートが 1 件以上あるとき、`span.card__ports` を 1 つ作って `card__foot` の末尾に入れる
     （`card__foot` は `justify-content: space-between` なので、ポートを個別に入れると要素が散らばる）。
     中身はポートごとに、URL が `^https?://` なら `a.card__link`（`title` に注記、`stopPropagation` あり）、そうでなければ `span`（`stopPropagation` なし）
   - `src/style.css`: `.card__ports { display: inline-flex; gap: 8px; }` を足す
   - `src/detail.js`: 「基本情報」の `['公開URL', …]` の直後に `['ローカル起動', 要素]` を足す。要素はポートごとに 1 行（`div`）で、
     「ポート番号（http のとき既存の `link()` でリンク）/ 注記 / 起動方法（`code`）/ 設定の場所（`code`）」を並べる。
     URL が http でない行は番号の後に URL 列の文字を併記する。ポートが 0 件なら null を渡し、`kv()` の既存の空行スキップに任せる
5. `scripts/publish.mjs`: `forbidden` に `'"ports"'` を追加する

### 失敗経路

| 状況 | 挙動 |
|---|---|
| PORTS.md が無い | 空の Map。全件 `ports: []`。警告は出さない |
| `## 一覧` が無い | 空の Map |
| 列数が足りない行 | その行だけ捨てる |
| ディレクトリ名が実在しない行 | 対応するプロジェクトが無いので、どこにも出ない |

## 触るファイル

| ファイル | 変更内容 |
|---|---|
| scripts/lib/ports.mjs | 新規。`loadPorts()` と `parsePortsMarkdown(text)` |
| scripts/scan.mjs | `reconcile()` の後で `ports` を付ける |
| src/cards.js | カード下部にポートのリンクを出す |
| src/style.css | `.card__ports` を足す |
| src/detail.js | 基本情報に「ローカル起動」の行を足す |
| scripts/publish.mjs | 漏洩チェックに `"ports"` を足す |

## 検討した代替案

| 案 | 採らなかった理由 |
|---|---|
| `localScan.mjs` の `scanOne` で付ける | `reconcile.mjs` がフィールドを列挙して組み立て直すため、2 箇所に足す必要がある。reconcile の後で付ければ 1 箇所で済む |
| 各プロジェクトの vite.config や bat から直接ポートを検出する | 書き方がプロジェクトごとにばらばらで、検出の誤りが出る。PORTS.md を正とするほうが確実 |
| `reconcile.mjs` の `norm()` で名前を正規化して照合する | 表のプロジェクト名はディレクトリ名そのままで書いてあり、26 件すべて完全一致する。正規化すると `seijo-mapping` と `seijomapping` のような別物まで一致しうる |
| 漏洩チェックに `localhost:` を足す | README から抜き出した概要文に `localhost:5173` などが含まれることがあり、誤検知で公開が止まる |
| ポートを `projects-meta.json` で上書き可能にする | PORTS.md と二重管理になる |
