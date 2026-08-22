import { GITHUB_OWNER } from './config.mjs';

const norm = (s) => (s ?? '').toLowerCase().replace(/[-_.\s]/g, '');

/** 公開URLを推定する。GitHub の homepage → Pages → Vercel の順。 */
function resolveLiveUrl(local, gh) {
  if (gh?.homepage) return gh.homepage;
  if (gh?.hasPages) {
    return `https://${(gh.repoOwner ?? GITHUB_OWNER).toLowerCase()}.github.io/${gh.repoName}/`;
  }
  const vercelName = gh?.repoName ?? local?.repoName;
  if (local?.stack.includes('Vercel') && vercelName) {
    return `https://${vercelName}.vercel.app`;
  }
  return null;
}

/** 概要は「手動 > GitHub description > ローカル抽出」の順で確定する。 */
function resolveSummary(meta, local, gh) {
  if (meta?.summary?.trim()) return { summary: meta.summary.trim(), source: 'manual' };
  if (gh?.description?.trim()) return { summary: gh.description.trim(), source: 'github' };
  if (local?.localSummary) return { summary: local.localSummary, source: local.localSummarySource };
  return { summary: null, source: null };
}

/** 主ステータスと付随フラグを決める。主ステータスは「今いちばん対応が必要なもの」を優先。 */
function resolveSync(local, gh) {
  const flags = [];
  if (!local) return { syncState: 'remote-only', flags };
  if (!local.repoName) return { syncState: 'local-only', flags };

  // remote は設定されているのに GitHub 側で見つからない = private か、削除済みか、認証不足
  if (!gh) flags.push('repo-unverified');

  if (local.dirtyCount > 0) flags.push('uncommitted');
  if (local.ahead > 0) flags.push('unpushed');
  if (local.behind > 0) flags.push('behind');
  if (!local.hasUpstream) flags.push('no-upstream');
  if (norm(local.localDir) !== norm(local.repoName)) flags.push('name-mismatch');

  let syncState = 'synced';
  if (local.ahead > 0) syncState = 'unpushed';
  else if (local.dirtyCount > 0) syncState = 'uncommitted';
  else if (local.behind > 0) syncState = 'behind';
  else if (!gh) syncState = 'local-only';

  return { syncState, flags };
}

function latest(...dates) {
  const valid = dates.filter(Boolean).map((d) => new Date(d)).filter((d) => !Number.isNaN(+d));
  return valid.length ? new Date(Math.max(...valid)).toISOString() : null;
}

/**
 * ローカル走査結果と GitHub 取得結果を突き合わせ、1プロジェクト = 1レコードに統合する。
 * @param {object[]} locals   scanLocal() の結果
 * @param {object[]} ghRepos  scanGitHub().repos
 * @param {Record<string, object>} metaMap  projects-meta.json の中身（key -> 上書き情報）
 */
export function reconcile(locals, ghRepos, metaMap = {}) {
  const ghByName = new Map(ghRepos.map((r) => [norm(r.repoName), r]));
  const usedGh = new Set();
  const projects = [];

  for (const local of locals) {
    let gh = null;
    if (local.repoName) {
      gh = ghByName.get(norm(local.repoName)) ?? null;
      if (gh) usedGh.add(norm(gh.repoName));
    }

    const key = gh?.repoName ?? local.repoName ?? local.localDir;
    const meta = metaMap[key] ?? metaMap[local.localDir] ?? null;
    const { syncState, flags } = resolveSync(local, gh);
    const { summary, source } = resolveSummary(meta, local, gh);

    projects.push({
      key,
      name: meta?.name ?? local.localDir,
      localDir: local.localDir,
      localPath: local.localPath,
      hasLocal: true,
      hasGit: local.hasGit,
      repoName: gh?.repoName ?? local.repoName ?? null,
      repoUrl: gh?.repoUrl ?? (local.repoName ? `https://github.com/${local.repoOwner}/${local.repoName}` : null),
      cloneUrl: gh?.cloneUrl ?? null,
      isPrivate: gh?.isPrivate ?? null,
      isArchived: gh?.isArchived ?? false,
      defaultBranch: gh?.defaultBranch ?? null,
      syncState,
      flags,
      branch: local.branch,
      ahead: local.ahead,
      behind: local.behind,
      hasUpstream: local.hasUpstream,
      dirtyCount: local.dirtyCount,
      dirtyFiles: local.dirtyFiles,
      lastCommit: local.lastCommit,
      lastPush: gh?.pushedAt ?? null,
      lastLocalMtime: local.lastLocalMtime,
      lastUpdated: latest(local.lastCommit, gh?.pushedAt, local.lastLocalMtime),
      stack: meta?.stack ?? local.stack,
      language: gh?.language ?? null,
      summary,
      summarySource: source,
      liveUrl: meta?.liveUrl ?? resolveLiveUrl(local, gh),
      status: meta?.status ?? (gh?.isArchived ? 'archived' : 'active'),
      tags: meta?.tags ?? gh?.topics ?? [],
      screenshot: meta?.screenshot ?? null,
    });
  }

  // ローカルに存在しない GitHub リポジトリ
  for (const gh of ghRepos) {
    if (usedGh.has(norm(gh.repoName))) continue;
    const meta = metaMap[gh.repoName] ?? null;
    const { summary, source } = resolveSummary(meta, null, gh);

    projects.push({
      key: gh.repoName,
      name: meta?.name ?? gh.repoName,
      localDir: null,
      localPath: null,
      hasLocal: false,
      hasGit: false,
      repoName: gh.repoName,
      repoUrl: gh.repoUrl,
      cloneUrl: gh.cloneUrl,
      isPrivate: gh.isPrivate,
      isArchived: gh.isArchived,
      defaultBranch: gh.defaultBranch,
      syncState: 'remote-only',
      flags: [],
      branch: null, ahead: null, behind: null, hasUpstream: false,
      dirtyCount: 0, dirtyFiles: [],
      lastCommit: null,
      lastPush: gh.pushedAt,
      lastLocalMtime: null,
      lastUpdated: gh.pushedAt,
      stack: meta?.stack ?? (gh.language ? [gh.language] : []),
      language: gh.language,
      summary,
      summarySource: source,
      liveUrl: meta?.liveUrl ?? resolveLiveUrl(null, gh),
      status: meta?.status ?? (gh.isArchived ? 'archived' : 'active'),
      tags: meta?.tags ?? gh.topics ?? [],
      screenshot: meta?.screenshot ?? null,
    });
  }

  return projects.sort((a, b) => (b.lastUpdated ?? '').localeCompare(a.lastUpdated ?? ''));
}
