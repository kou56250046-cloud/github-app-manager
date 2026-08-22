import { run } from './exec.mjs';
import { GITHUB_OWNER } from './config.mjs';

/**
 * トークンを取得する。gh CLI のログイン情報を最優先し、.env の GITHUB_TOKEN はフォールバック。
 * 平文でトークンをファイルに置かせないための順序。
 */
export async function resolveToken() {
  const r = await run('gh', ['auth', 'token']);
  if (r.ok && r.stdout.trim()) return { token: r.stdout.trim(), source: 'gh' };

  const env = process.env.GITHUB_TOKEN?.trim();
  if (env) return { token: env, source: 'env' };

  return { token: null, source: null };
}

async function api(url, token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'github-app-manager',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status} ${res.statusText}: ${url}\n${body.slice(0, 300)}`);
  }
  return { data: await res.json(), link: res.headers.get('link') };
}

function nextPage(link) {
  if (!link) return null;
  const m = link.split(',').find((s) => s.includes('rel="next"'));
  return m ? m.slice(m.indexOf('<') + 1, m.indexOf('>')) : null;
}

/**
 * オーナーの全リポジトリを取得する。
 * 認証済みなら /user/repos（private 含む）、未認証なら /users/:owner/repos（public のみ）。
 */
/** トークンが実際に通るか確認する。無効なトークンを付けたままだと全リクエストが401になるため。 */
async function validateToken(token) {
  if (!token) return false;
  try {
    await api('https://api.github.com/user', token);
    return true;
  } catch {
    return false;
  }
}

export async function scanGitHub() {
  let { token, source } = await resolveToken();

  const warnings = [];
  if (token && !(await validateToken(token))) {
    warnings.push(
      `${source === 'gh' ? 'gh CLI' : '環境変数 GITHUB_TOKEN'} のトークンが無効です。` +
        'public リポジトリのみ取得します（private は見えません）。' +
        'GITHUB_TOKEN 環境変数を削除して `gh auth login` を実行してください。'
    );
    token = null;
    source = null;
  }

  let url = token
    ? 'https://api.github.com/user/repos?per_page=100&affiliation=owner&sort=pushed'
    : `https://api.github.com/users/${GITHUB_OWNER}/repos?per_page=100&sort=pushed`;

  const repos = [];
  while (url) {
    const { data, link } = await api(url, token);
    repos.push(...data);
    url = nextPage(link);
  }

  return {
    authSource: source,
    authenticated: Boolean(token),
    warnings,
    repos: repos.map((r) => ({
      repoName: r.name,
      repoOwner: r.owner?.login ?? GITHUB_OWNER,
      repoUrl: r.html_url,
      cloneUrl: r.clone_url,
      description: r.description ?? null,
      language: r.language ?? null,
      isPrivate: r.private,
      isFork: r.fork,
      isArchived: r.archived,
      hasPages: r.has_pages ?? false,
      homepage: r.homepage || null,
      pushedAt: r.pushed_at ?? null,
      updatedAt: r.updated_at ?? null,
      defaultBranch: r.default_branch ?? 'main',
      stars: r.stargazers_count ?? 0,
      topics: r.topics ?? [],
    })),
  };
}
