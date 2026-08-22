import fs from 'node:fs/promises';
import path from 'node:path';
import { git, gitOut } from './exec.mjs';
import { detectStack } from './detectStack.mjs';
import { summarizeLocal } from './summarize.mjs';
import { IGNORED_DIRS, PROJECTS_ROOT, toPosix } from './config.mjs';

/** remote URL からリポジトリ名を取り出す（https / ssh 両対応） */
export function repoNameFromRemote(url) {
  if (!url) return null;
  const m = url.trim().match(/[/:]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** ahead/behind を取得。upstream 未設定なら null を返す。 */
async function aheadBehind(dir) {
  const out = await gitOut(dir, ['rev-list', '--left-right', '--count', '@{u}...HEAD']);
  if (!out) return { ahead: null, behind: null, hasUpstream: false };
  const [behind, ahead] = out.split(/\s+/).map(Number);
  return { ahead: ahead ?? 0, behind: behind ?? 0, hasUpstream: true };
}

async function scanOne(name) {
  const dirPath = path.join(PROJECTS_ROOT, name);
  const rawEntries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  const entries = new Set(rawEntries.map((e) => e.name));

  const pkg = entries.has('package.json')
    ? await readJson(path.join(dirPath, 'package.json'))
    : null;

  const hasWorkflows = await exists(path.join(dirPath, '.github', 'workflows'));
  const hasPyFiles = rawEntries.some((e) => e.isFile() && e.name.endsWith('.py'));

  const stack = detectStack({ entries, pkg, hasWorkflows, hasPyFiles });
  const { summary, source } = await summarizeLocal(dirPath, entries, pkg);

  const stat = await fs.stat(dirPath).catch(() => null);

  const base = {
    localDir: name,
    localPath: toPosix(dirPath),
    hasGit: entries.has('.git'),
    remoteUrl: null,
    repoName: null,
    repoOwner: null,
    branch: null,
    ahead: null,
    behind: null,
    hasUpstream: false,
    dirtyCount: 0,
    dirtyFiles: [],
    lastCommit: null,
    lastLocalMtime: stat ? stat.mtime.toISOString() : null,
    stack,
    localSummary: summary,
    localSummarySource: source,
    pkgName: pkg?.name ?? null,
  };

  if (!base.hasGit) return base;

  const remoteUrl = await gitOut(dirPath, ['remote', 'get-url', 'origin']);
  const parsed = repoNameFromRemote(remoteUrl);
  const status = await git(dirPath, ['status', '--porcelain']);
  const dirtyFiles = status.ok
    ? status.stdout.split('\n').map((l) => l.slice(3).trim()).filter(Boolean)
    : [];
  const ab = await aheadBehind(dirPath);

  return {
    ...base,
    remoteUrl,
    repoName: parsed?.repo ?? null,
    repoOwner: parsed?.owner ?? null,
    branch: await gitOut(dirPath, ['rev-parse', '--abbrev-ref', 'HEAD']),
    ...ab,
    dirtyCount: dirtyFiles.length,
    dirtyFiles,
    lastCommit: await gitOut(dirPath, ['log', '-1', '--format=%cI']),
  };
}

/** projects ルート直下のディレクトリを全走査する */
export async function scanLocal() {
  const dirents = await fs.readdir(PROJECTS_ROOT, { withFileTypes: true });
  const names = dirents
    .filter((d) => d.isDirectory() && !IGNORED_DIRS.has(d.name) && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, 'ja'));

  return Promise.all(names.map(scanOne));
}
