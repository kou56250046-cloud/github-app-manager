import fs from 'node:fs/promises';
import path from 'node:path';
import { runScan } from './scan.mjs';
import { run } from './lib/exec.mjs';
import { ROOT, LOCAL_JSON, PUBLIC_JSON, DATA_DIR } from './lib/config.mjs';

const DOCS = path.join(ROOT, 'docs');

/** 公開版に載せてよいフィールドだけを明示的に列挙する（除外リストではなく許可リスト） */
const PUBLIC_FIELDS = [
  'key', 'name', 'summary', 'stack', 'repoUrl', 'repoName',
  'liveUrl', 'lastUpdated', 'status', 'tags', 'screenshot', 'language', 'isPrivate',
];

/** 公開版のステータスは粒度を落とす。どのファイルが未コミットかまでは出さない。 */
function coarseState(p) {
  if (p.syncState === 'remote-only' || p.syncState === 'local-only') return p.syncState;
  // 未push / 未コミット / リモート先行 の区別は公開しない（作業状況が細かく漏れるため）
  return p.syncState === 'synced' ? 'synced' : 'attention';
}

function toPublic(p) {
  const out = {};
  for (const f of PUBLIC_FIELDS) if (p[f] != null) out[f] = p[f];
  out.syncState = coarseState(p);
  // 日付は日単位まで（作業時刻が分かると生活パターンが漏れるため）
  if (out.lastUpdated) out.lastUpdated = out.lastUpdated.slice(0, 10);
  return out;
}

async function main() {
  const data = await runScan();
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(LOCAL_JSON, JSON.stringify(data, null, 2), 'utf8');

  const publicData = {
    generatedAt: new Date().toISOString().slice(0, 10),
    owner: data.owner,
    projects: data.projects.map(toPublic),
  };

  // emptyOutDir:false のままだと古いハッシュ付きアセットが残り続けるので、assets だけ掃除する
  await fs.rm(path.join(DOCS, 'assets'), { recursive: true, force: true });

  console.log('vite build を実行中…');
  const build = await run('node', [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: ROOT });
  process.stdout.write(build.stdout);
  if (!build.ok) {
    process.stderr.write(build.stderr);
    throw new Error('vite build に失敗しました');
  }

  const dest = path.join(DOCS, PUBLIC_JSON);
  await fs.writeFile(dest, JSON.stringify(publicData, null, 2), 'utf8');
  // GitHub Pages が _ 始まりのパスを Jekyll 扱いしないようにする
  await fs.writeFile(path.join(DOCS, '.nojekyll'), '', 'utf8');

  // 許可リストの取りこぼしを機械的に検査する（人力レビューに頼らない）
  const raw = await fs.readFile(dest, 'utf8');
  const forbidden = ['localPath', 'localDir', 'dirtyFiles', 'dirtyCount', 'branch', 'ahead', 'behind', 'lastLocalMtime', 'summarySource', 'C:/Users'];
  const leaked = forbidden.filter((k) => raw.includes(k));
  // "ports" はタグ等の本文にも現れうるので、文字列ではなくキーの有無で見る
  if (JSON.parse(raw).projects.some((p) => 'ports' in p)) leaked.push('ports');
  if (leaked.length) throw new Error(`公開版に含めてはいけない情報が混入しています: ${leaked.join(', ')}`);

  console.log(`公開版を書き出しました: ${dest}`);
  console.log(`  ${publicData.projects.length} 件 / 漏洩チェック OK`);
  console.log('  GitHub の Settings > Pages で source を main / docs に設定してください。');
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
