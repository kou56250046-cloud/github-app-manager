import fs from 'node:fs/promises';
import { scanLocal } from './lib/localScan.mjs';
import { scanGitHub } from './lib/githubScan.mjs';
import { reconcile } from './lib/reconcile.mjs';
import { loadPorts } from './lib/ports.mjs';
import { DATA_DIR, LOCAL_JSON, META_JSON, PROJECTS_ROOT, GITHUB_OWNER, toPosix } from './lib/config.mjs';

const localOnly = process.argv.includes('--local-only');

async function loadMeta() {
  try {
    const raw = JSON.parse(await fs.readFile(META_JSON, 'utf8'));
    return raw.projects ?? raw ?? {};
  } catch {
    return {};
  }
}

export async function runScan({ localOnly: skipGitHub = false } = {}) {
  const locals = await scanLocal();

  let gh = { repos: [], authenticated: false, authSource: null, warnings: [] };
  if (!skipGitHub) {
    try {
      gh = await scanGitHub();
    } catch (err) {
      gh.warnings = [`GitHub の取得に失敗しました: ${err.message}`];
    }
  }

  const projects = reconcile(locals, gh.repos, await loadMeta());

  // ローカル起動ポートは ~/projects/PORTS.md から引く。GitHub のみのものは localDir が無いので空
  const ports = await loadPorts();
  for (const p of projects) p.ports = (p.localDir && ports.map.get(p.localDir)) || [];
  const localDirs = new Set(projects.map((p) => p.localDir).filter(Boolean));
  const unmatched = [...ports.map.keys()].filter((d) => !localDirs.has(d));
  const warnings = [...ports.warnings];
  if (unmatched.length) {
    warnings.push(`PORTS.md のプロジェクト名がディレクトリと一致しません: ${unmatched.join(', ')}`);
  }

  // 主ステータスとフラグは別集計にする（同名キーで混ざると二重計上になるため）
  const counts = { states: {}, flags: {} };
  for (const p of projects) {
    counts.states[p.syncState] = (counts.states[p.syncState] ?? 0) + 1;
    for (const f of p.flags) counts.flags[f] = (counts.flags[f] ?? 0) + 1;
  }

  return {
    scannedAt: new Date().toISOString(),
    projectsRoot: toPosix(PROJECTS_ROOT),
    owner: GITHUB_OWNER,
    github: {
      authenticated: gh.authenticated,
      authSource: gh.authSource,
      repoCount: gh.repos.length,
      warnings: gh.warnings ?? [],
    },
    counts,
    warnings,   // GitHub 以外の警告（今は PORTS.md の読み込みだけ）
    projects,
  };
}

async function main() {
  const result = await runScan({ localOnly });
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(LOCAL_JSON, JSON.stringify(result, null, 2), 'utf8');

  console.log(`スキャン完了: ${result.projects.length} 件`);
  console.log(`  ローカル ${result.projects.filter((p) => p.hasLocal).length} 件 / GitHub ${result.github.repoCount} 件`);
  console.log('  ステータス:', JSON.stringify(result.counts.states));
  console.log('  フラグ    :', JSON.stringify(result.counts.flags));
  for (const w of [...result.github.warnings, ...result.warnings]) console.warn(`  ⚠ ${w}`);
  console.log(`  出力: ${LOCAL_JSON}`);
}

// 直接実行されたときのみ main を走らせる（Vite の API からは runScan を import して使う）
const invokedDirectly =
  process.argv[1] && toPosix(process.argv[1]).endsWith('/scripts/scan.mjs');
if (invokedDirectly) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
