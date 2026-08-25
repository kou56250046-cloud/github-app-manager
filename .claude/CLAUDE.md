# Project Manager（github-app-manager）

`~/projects` 配下のローカルディレクトリと GitHub リポジトリを突き合わせ、カード一覧で管理する
ダッシュボード。**このリポジトリだけは親ディレクトリの汎用テンプレ（Next.js / Supabase / Stripe）に
従わない。** 依存は `vite` のみで、DB・認証基盤・外部サービスは一切使わない。

## スタック

- ビルド: Vite 5（`pnpm` 管理）
- 画面: バニラ JS（フレームワークなし）+ 素の CSS。DOM は `document.createElement` で組む
- サーバー: dev 時だけ生える Vite プラグイン（`server/apiPlugin.mjs`）。本番は静的ファイルのみ
- データ: JSON ファイル（`data/*.json`）。DB は使わない
- 公開: GitHub Pages（`main` / `/docs`）

## コマンド

```bash
pnpm scan          # ローカル走査 + GitHub 取得 → data/projects.local.json
pnpm scan:local    # GitHub を叩かずローカルのみ
pnpm dev           # http://127.0.0.1:5178
pnpm publish:pages # scan + vite build + docs/projects.public.json 生成
```

## 構成

```
scripts/scan.mjs          スキャンのエントリポイント
scripts/lib/config        PROJECTS_ROOT・除外設定・秘密情報パターン
scripts/lib/localScan     ディレクトリ走査 + git 状態 + Python 依存の収集
scripts/lib/githubScan    GitHub API（トークン検証つき・失敗時は public にフォールバック）
scripts/lib/detectStack   スタック判定
scripts/lib/summarize     README 等からの概要抽出（テンプレ文は除外）
scripts/lib/reconcile     ローカル↔GitHub の突き合わせ
scripts/publish.mjs       公開版の生成（許可リスト + 漏洩チェック）
server/apiPlugin.mjs      dev サーバーにだけ生える /api
src/                      画面（main / cards / detail / filters / modal / api / constants）
data/projects.local.json  スキャン結果（gitignore 済み）
data/projects-meta.json   手動で上書きしたメタ情報（コミット対象）
```

## 守ること

- **公開版は許可リスト方式**。`scripts/publish.mjs` の `PUBLIC_FIELDS` に足さない限り出力されない。
  ローカルパス・未コミットファイル名・ブランチ名・作業時刻は絶対に載せない。
  追加後は `publish:pages` が走らせる漏洩チェックを必ず通す
- **git 操作は確認 → 実行**。コマンド全文を提示し、`PROJECTS_ROOT` 配下であることを検証し、
  `add -A --dry-run` で `.env` や `*.key` が混ざっていないか調べてから走らせる（`isSecretPath`）
- dev サーバーは `127.0.0.1` のみにバインドする。ビルド成果物に `/api` を含めない
- 新しい npm 依存を足さない。素の JS / CSS で解く
- 画面テキスト・コメントは日本語

## スタック判定を足すとき

`scripts/lib/detectStack.mjs` にタグを足す。判定材料は `localScan.mjs` の `scanOne` で集めて渡す。

- JS 側は `package.json` の依存を見る
- Python 側は `collectPyDeps()` が `requirements*.txt` / `pyproject.toml` / `Pipfile` /
  `environment.yml` / `setup.py` / `setup.cfg` と `.py` の import を **深さ2まで** 探す
  （`tools/xxx/` のような付属ツールも拾うため）
- サマリー行にチップとして出したいものは `src/constants.js` の `QUICK_STACKS` に追加する
  （該当0件なら自動で非表示）

## 変更後の確認

`pnpm dev` を上げて Playwright MCP で実際に触る。スクリーンショットはリポジトリ直下に置かない
（`/*.png` は gitignore 済み）。
