# ローカル起動ポートの表示 — タスク

## T1 PORTS.md のパーサー
- 触るファイル: scripts/lib/ports.mjs（新規）
- やること: `parsePortsMarkdown(text)` と `loadPorts()` を書く
- **完了条件:** `node -e` で実際の PORTS.md を読ませると、ディレクトリ名が 26 種類、ai-scraping の配列が 2 件、`成城教会` が 1 件、file-cleaning の `url` が `ブラウザでは開かない` になる。空文字や `## 一覧` の無い文字列を渡すと空の Map を返す

## T2 スキャン結果に ports を付ける
- 触るファイル: scripts/scan.mjs
- やること: `reconcile()` の後で各プロジェクトに `ports` を付ける
- **完了条件:** `pnpm scan:local` の後、`data/projects.local.json` の github-app-manager の `ports[0].port` が 5178 になり、ポートの無いプロジェクトは `[]` になる。`PROJECTS_ROOT` を PORTS.md の無いディレクトリに向けて実行しても例外で落ちない

## T3 カードに表示
- 触るファイル: src/cards.js, src/style.css
- やること: `card__foot` の末尾に `span.card__ports` を足し、その中にポートを並べる
- **完了条件:** `pnpm dev` の画面で、github-app-manager のカードに「:5178 ↗」が出る。クリックすると新しいタブで http://127.0.0.1:5178 が開き、モーダルは開かない。ai-scraping のカードでは「:5173 ↗ :8787 ↗」が隣り合って 1 行に収まり、マウスを乗せると注記が出る。file-cleaning のカードでは `:5183` がリンクにならない。ポートの無いカードの見た目は変わらない

## T4 詳細モーダルに表示
- 触るファイル: src/detail.js
- やること: 基本情報に「ローカル起動」の行を足す
- **完了条件:** ai-scraping の詳細で 5173 と 8787 の 2 行が出て、それぞれに注記・起動方法・設定の場所が表示され、番号がリンクになっている。file-cleaning の詳細では 5183 がリンクにならず「ブラウザでは開かない」が併記される。ポートの無いプロジェクトでは「ローカル起動」の行自体が出ない

## T5 公開版に出ないことを保証
- 触るファイル: scripts/publish.mjs
- やること: 漏洩チェックの `forbidden` に `'"ports"'` を足す
- **完了条件:** `pnpm publish:pages` が成功し、`docs/projects.public.json` に `ports` と `127.0.0.1:` が含まれない。
  実行すると `docs/` が書き換わる（普段の「プロジェクト一覧を更新」と同じ差分）。コミットはせず、差分はそのまま残す
