# Project Manager

`~/projects` 配下のローカルディレクトリと GitHub リポジトリを突き合わせ、
**何のアプリか / GitHub と同期しているか / どこで動いているか** をカード一覧で管理するダッシュボード。

- 依存パッケージは `vite` のみ。DB・認証基盤・外部サービスは使わない（**完全無料**）
- ローカル起動時はローカルの git 状態が実データで見え、push などの操作もできる
- 同じ画面を GitHub Pages に公開でき、スマホから閲覧できる（公開版は情報を間引く）

## 使い方

```bash
pnpm install
pnpm scan          # ローカル走査 + GitHub 取得 → data/projects.local.json
pnpm dev           # http://127.0.0.1:5178
pnpm publish:pages # docs/ にビルド + projects.public.json を生成
```

`pnpm dev` を起動していれば画面右上の「再スキャン」でいつでも最新化できる。

## GitHub 認証

`gh` CLI のログイン情報を最優先で使い、無ければ `.env` の `GITHUB_TOKEN` にフォールバックする。
トークンが無効な場合は public リポジトリのみを取得し、画面上に警告を出す。

```bash
# 無効な GITHUB_TOKEN が環境変数に残っていると gh はそれを優先してしまう
[Environment]::SetEnvironmentVariable('GITHUB_TOKEN', $null, 'User')   # PowerShell
gh auth login
```

認証しないと **private リポジトリが「GitHub側で確認できず」と表示される**。

## 画面の見かた

| バッジ | 意味 |
|---|---|
| 同期済み | ローカルとGitHubが一致 |
| 未コミット | ローカルに未コミットの変更がある |
| 未push | コミット済みだが push されていない |
| ローカルのみ | Git 管理外、または remote 未設定 |
| GitHubのみ | GitHub にあるがローカルに無い |
| ⚠ 名前不一致 | ディレクトリ名とリポジトリ名が違う |
| ⚠ GitHub側で確認できず | remote はあるが API で見つからない（private か削除済み） |

### スタックで絞り込む

サマリー行の右側に **Streamlit / FastAPI / Django / Flask** のチップが出る（該当が1件以上あるときだけ）。
クリックでそのスタックだけに絞り込め、カード上のタグも色付きで表示される。
`スタック: すべて` のセレクトからも同じ絞り込みができ、両者は連動する。

Streamlit の判定は次のいずれかに当たったとき。サブディレクトリのツール（例: `tools/csv_converter/`）も
拾えるよう **深さ2まで** 探索する。

- `requirements*.txt` / `pyproject.toml` / `Pipfile` / `environment.yml` / `setup.py` / `setup.cfg` に記載がある
  （行頭 `#` のコメント行は無視する）
- ルート直下または1階層下の `.py` に `import streamlit` / `from streamlit ...` がある

そのため、本体は Next.js でも付属ツールが Streamlit なら両方のタグが付く。

カードをクリックすると詳細パネルが開き、概要・状態・タグ・公開URLを手動で上書きできる。
手動設定は `data/projects-meta.json` に保存され、自動抽出より常に優先される。

## 操作機能（ローカル起動時のみ）

- **push** — 未pushコミットを push
- **コミットして push** — メッセージを入力して `add -A` → commit → push
- **リポジトリを作成して push** — `git init` → `gh repo create` （Git未管理のプロジェクト向け）
- **ローカルへ clone** — GitHub にしか無いリポジトリを取得

安全のため以下を必ず通す。

1. 実行されるコマンド全文を確認画面に表示し、承認するまで走らせない
2. 対象はスキャン済みプロジェクトのパスのみ（`PROJECTS_ROOT` 配下であることを検証）
3. コミット系は `git add -A --dry-run` で追加対象を列挙し、`.env` / `*.key` / `credentials` 等が
   含まれていれば**実行をブロック**する
4. dev サーバーは `127.0.0.1` のみバインド。ビルド成果物に `/api` は含まれず、公開版は閲覧専用になる

## 公開版に含まれない情報

`docs/projects.public.json` は許可リスト方式で生成し、書き出し後に機械的な漏洩チェックを通す。

- 含まれない: ローカルパス / 未コミットファイル名・件数 / ブランチ名 / ahead・behind / 作業時刻
- 含まれる: 名前・概要・スタック・リポジトリURL・公開URL・更新日（日単位）・状態・タグ

GitHub の **Settings → Pages** で source を `main` / `/docs` に設定すると公開される。

## 公開ページを更新する手順

### 1. スキャン + 公開版の生成

```bash
pnpm publish:pages
```

このコマンドが内部でまとめて行うこと。

1. ローカル走査 + GitHub 取得 → `data/projects.local.json`（gitignore 済み・コミット対象外）
2. `vite build` で `docs/` に静的ファイルを出力（`docs/assets` は毎回削除して作り直す）
3. 許可リスト `PUBLIC_FIELDS` で絞った `docs/projects.public.json` を書き出し
4. 漏洩チェック — `localPath` / `dirtyFiles` / `branch` / `C:/Users` 等が混ざっていれば**その場で失敗**する

`pnpm scan` 単体では `data/projects.local.json` が更新されるだけで公開ページには反映されない。
**公開に必要なのは `publish:pages` の方**。

### 2. 差分を確認

```bash
git status --short
git diff docs/projects.public.json
```

`docs/` 以外に想定外の変更が出ていないか、公開 JSON にパスや作業状況が入っていないかを目視でも確認する。

### 3. コミットして push

```bash
git add docs
git add -A --dry-run   # .env や *.key が混ざっていないか事前確認
git commit -m "プロジェクト一覧を更新"
git push origin main
```

`git add -A` ではなく **`git add docs` とパスを限定する**。関係ない作業ファイルを巻き込まないため。

### 4. 公開を確認

`main` に push すると GitHub Pages が自動で再デプロイされる。1〜2分待ってから公開 URL を開く。

## 構成

```
scripts/scan.mjs          スキャンのエントリポイント
scripts/lib/localScan     ディレクトリ走査 + git 状態
scripts/lib/githubScan    GitHub API（トークン検証つき・失敗時は public にフォールバック）
scripts/lib/detectStack   スタック判定（Streamlit 等の Python フレームワーク含む）
scripts/lib/summarize     README 等からの概要抽出（テンプレ文は除外）
scripts/lib/reconcile     ローカル↔GitHub の突き合わせ
scripts/publish.mjs       公開版の生成
server/apiPlugin.mjs      dev サーバーにだけ生える /api
src/                      画面（バニラJS）
```
