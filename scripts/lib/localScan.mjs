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

/** requirements.txt / pyproject.toml などから拾う Python フレームワーク */
const PY_FRAMEWORKS = ['streamlit', 'fastapi', 'django', 'flask'];

const PY_MANIFESTS = /^(requirements.*\.txt|pyproject\.toml|Pipfile|environment\.ya?ml|setup\.py|setup\.cfg)$/i;

/** Python の依存を探すとき降りない場所 */
const PY_SKIP_DIRS = new Set([
  ...IGNORED_DIRS, '.venv', 'venv', 'env', '__pycache__', '.next', 'dist', 'build',
  '.playwright-mcp', 'docs', 'data', 'results', '.pytest_cache', 'site-packages',
]);

async function readText(file) {
  return fs.readFile(file, 'utf8').catch(() => '');
}

function pickFrameworks(text, into) {
  // 行頭 # のコメントを落としてから名前を探す（説明文での言及を拾わないため）
  const body = text
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith('#'))
    .join('\n')
    .toLowerCase();
  for (const name of PY_FRAMEWORKS) {
    if (new RegExp(`(^|[^a-z0-9_-])${name}([^a-z0-9_-]|$)`, 'm').test(body)) into.add(name);
  }
}

/**
 * Python の依存フレームワークを集める。
 * サブディレクトリのツール（例: tools/csv_converter）も対象にしたいので深さ2まで降りる。
 */
async function collectPyDeps(dirPath, depth = 0, found = new Set()) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);

  for (const e of entries) {
    if (!e.isFile()) continue;
    const file = path.join(dirPath, e.name);
    if (PY_MANIFESTS.test(e.name)) pickFrameworks(await readText(file), found);
    // import 文からも拾う。ルート直下と 1 階層下（pages/ など）のみ。
    else if (depth <= 1 && e.name.endsWith('.py')) {
      const text = await readText(file);
      for (const name of PY_FRAMEWORKS) {
        if (new RegExp(`^[ \\t]*(?:import|from)[ \\t]+${name}(?![a-z0-9_])`, 'im').test(text)) {
          found.add(name);
        }
      }
    }
  }

  if (depth < 2) {
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || PY_SKIP_DIRS.has(e.name)) continue;
      await collectPyDeps(path.join(dirPath, e.name), depth + 1, found);
    }
  }
  return found;
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

  const pyDeps = await collectPyDeps(dirPath);
  const stack = detectStack({ entries, pkg, hasWorkflows, hasPyFiles, pyDeps });
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
