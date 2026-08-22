import fs from 'node:fs/promises';
import path from 'node:path';
import { runScan } from '../scripts/scan.mjs';
import { run, git } from '../scripts/lib/exec.mjs';
import { LOCAL_JSON, META_JSON, PROJECTS_ROOT, isSecretPath, toPosix } from '../scripts/lib/config.mjs';

const json = (res, code, body) => {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

async function loadData() {
  try {
    return JSON.parse(await fs.readFile(LOCAL_JSON, 'utf8'));
  } catch {
    const fresh = await runScan();
    await fs.writeFile(LOCAL_JSON, JSON.stringify(fresh, null, 2), 'utf8');
    return fresh;
  }
}

/**
 * key からプロジェクトを引き、ローカルパスが PROJECTS_ROOT 配下であることを検証する。
 * 任意パスを実行対象にされないための関門。
 */
async function resolveProject(key, { requireLocal = true } = {}) {
  const data = await loadData();
  const p = data.projects.find((x) => x.key === key);
  if (!p) return { error: `プロジェクト '${key}' が見つかりません（再スキャンしてください）` };
  if (!requireLocal) return { project: p };
  if (!p.localPath) return { error: `'${key}' はローカルに存在しません` };

  const rel = path.relative(PROJECTS_ROOT, path.resolve(p.localPath));
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { error: `'${key}' のパスがスキャン対象外です: ${p.localPath}` };
  }
  return { project: p };
}

/** git add -A で追加される予定のファイルを列挙し、秘密情報らしきものを抽出する */
async function inspectStaging(cwd) {
  const r = await git(cwd, ['add', '-A', '--dry-run']);
  const files = r.stdout
    .split('\n')
    .map((l) => l.match(/^(?:add|remove) '(.+)'$/)?.[1])
    .filter(Boolean);
  return { files, secrets: files.filter(isSecretPath) };
}

/** コマンド列を順に実行し、1つでも失敗したらそこで止めてログを返す */
async function runSteps(steps) {
  const log = [];
  for (const { label, cmd, args, cwd } of steps) {
    const r = await run(cmd, args, cwd ? { cwd } : {});
    log.push({ label, command: `${cmd} ${args.join(' ')}`, ...r });
    if (!r.ok) return { ok: false, log };
  }
  return { ok: true, log };
}

const routes = {
  'GET /api/health': async (_req, res) => json(res, 200, { dev: true, projectsRoot: toPosix(PROJECTS_ROOT) }),

  'GET /api/data': async (_req, res) => json(res, 200, await loadData()),

  'POST /api/rescan': async (_req, res) => {
    const fresh = await runScan();
    await fs.writeFile(LOCAL_JSON, JSON.stringify(fresh, null, 2), 'utf8');
    json(res, 200, fresh);
  },

  // 実行前の確認用。実際のコマンドと警告を返すだけで副作用はない。
  'POST /api/git/preview': async (req, res, body) => {
    const { key, action, message, repoName, visibility = 'public' } = body;
    const requireLocal = action !== 'clone';
    const { project, error } = await resolveProject(key, { requireLocal });
    if (error) return json(res, 400, { error });

    const cwd = project.localPath;
    const name = repoName || project.repoName || project.localDir;
    let commands = [];
    let warnings = [];

    if (action === 'push') {
      commands = [`git -C "${cwd}" push origin ${project.branch ?? 'HEAD'}`];
      if (!project.hasUpstream) {
        commands = [`git -C "${cwd}" push -u origin ${project.branch ?? 'HEAD'}`];
        warnings.push('upstream が未設定のため -u を付けて push します。');
      }
    } else if (action === 'commit-push') {
      const { files, secrets } = await inspectStaging(cwd);
      commands = [
        `git -C "${cwd}" add -A`,
        `git -C "${cwd}" commit -m "${message ?? ''}"`,
        `git -C "${cwd}" push${project.hasUpstream ? '' : ' -u'} origin ${project.branch ?? 'HEAD'}`,
      ];
      return json(res, 200, { commands, warnings, files, secrets, blocked: secrets.length > 0 });
    } else if (action === 'init-repo') {
      const { secrets } = await inspectStaging(cwd);
      commands = [
        `git -C "${cwd}" init -b main`,
        `git -C "${cwd}" add -A`,
        `git -C "${cwd}" commit -m "初回コミット"`,
        `gh repo create ${name} --${visibility} --source="${cwd}" --push`,
      ];
      return json(res, 200, { commands, warnings, secrets, blocked: secrets.length > 0 });
    } else if (action === 'clone') {
      const dest = path.join(PROJECTS_ROOT, name);
      commands = [`git clone ${project.cloneUrl} "${dest}"`];
      try {
        await fs.access(dest);
        warnings.push(`${toPosix(dest)} は既に存在します。clone は失敗します。`);
      } catch { /* 存在しないのが正常 */ }
    } else {
      return json(res, 400, { error: `未知のアクション: ${action}` });
    }

    json(res, 200, { commands, warnings, secrets: [], blocked: false });
  },

  'POST /api/git/push': async (req, res, body) => {
    const { project, error } = await resolveProject(body.key);
    if (error) return json(res, 400, { error });
    const branch = project.branch ?? 'HEAD';
    const args = project.hasUpstream
      ? ['-C', project.localPath, 'push', 'origin', branch]
      : ['-C', project.localPath, 'push', '-u', 'origin', branch];
    json(res, 200, await runSteps([{ label: 'push', cmd: 'git', args }]));
  },

  'POST /api/git/commit-push': async (req, res, body) => {
    const { project, error } = await resolveProject(body.key);
    if (error) return json(res, 400, { error });
    const message = String(body.message ?? '').trim();
    if (!message) return json(res, 400, { error: 'コミットメッセージが空です' });

    const { secrets } = await inspectStaging(project.localPath);
    if (secrets.length && !body.force) {
      return json(res, 409, { error: '秘密情報らしきファイルが含まれています', secrets });
    }

    const p = project.localPath;
    const branch = project.branch ?? 'HEAD';
    json(res, 200, await runSteps([
      { label: 'add', cmd: 'git', args: ['-C', p, 'add', '-A'] },
      { label: 'commit', cmd: 'git', args: ['-C', p, 'commit', '-m', message] },
      { label: 'push', cmd: 'git', args: project.hasUpstream
          ? ['-C', p, 'push', 'origin', branch]
          : ['-C', p, 'push', '-u', 'origin', branch] },
    ]));
  },

  'POST /api/git/init-repo': async (req, res, body) => {
    const { project, error } = await resolveProject(body.key);
    if (error) return json(res, 400, { error });
    if (project.repoName) return json(res, 400, { error: 'すでに remote が設定されています' });

    const name = String(body.repoName || project.localDir).trim();
    if (!/^[\w.-]+$/.test(name)) {
      return json(res, 400, { error: `リポジトリ名に使えない文字が含まれています: ${name}` });
    }
    const visibility = body.visibility === 'private' ? 'private' : 'public';
    const p = project.localPath;

    const { secrets } = await inspectStaging(p);
    if (secrets.length && !body.force) {
      return json(res, 409, { error: '秘密情報らしきファイルが含まれています', secrets });
    }

    const steps = [];
    if (!project.hasGit) {
      steps.push({ label: 'init', cmd: 'git', args: ['-C', p, 'init', '-b', 'main'] });
    }
    steps.push(
      { label: 'add', cmd: 'git', args: ['-C', p, 'add', '-A'] },
      { label: 'commit', cmd: 'git', args: ['-C', p, 'commit', '-m', String(body.message || '初回コミット')] },
      { label: 'repo create', cmd: 'gh', args: ['repo', 'create', name, `--${visibility}`, '--source', p, '--push'] },
    );
    json(res, 200, await runSteps(steps));
  },

  'POST /api/git/clone': async (req, res, body) => {
    const { project, error } = await resolveProject(body.key, { requireLocal: false });
    if (error) return json(res, 400, { error });
    if (!project.cloneUrl) return json(res, 400, { error: 'clone URL がありません' });

    const dest = path.join(PROJECTS_ROOT, project.repoName);
    try {
      await fs.access(dest);
      return json(res, 409, { error: `${toPosix(dest)} は既に存在します` });
    } catch { /* 存在しないので続行 */ }

    json(res, 200, await runSteps([
      { label: 'clone', cmd: 'git', args: ['clone', project.cloneUrl, dest] },
    ]));
  },

  'POST /api/meta': async (req, res, body) => {
    const { key, patch } = body;
    if (!key || typeof patch !== 'object') return json(res, 400, { error: 'key と patch が必要です' });

    let meta = { projects: {} };
    try {
      meta = JSON.parse(await fs.readFile(META_JSON, 'utf8'));
      meta.projects ??= {};
    } catch { /* 初回作成 */ }

    const current = meta.projects[key] ?? {};
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') delete current[k];
      else current[k] = v;
    }
    if (Object.keys(current).length) meta.projects[key] = current;
    else delete meta.projects[key];

    await fs.writeFile(META_JSON, JSON.stringify(meta, null, 2), 'utf8');

    // メタ更新は表示に即反映したいので再スキャンして返す
    const fresh = await runScan();
    await fs.writeFile(LOCAL_JSON, JSON.stringify(fresh, null, 2), 'utf8');
    json(res, 200, fresh);
  },
};

/** Vite dev サーバーにのみ /api/* を生やすプラグイン。build 成果物には含まれない。 */
export function apiPlugin() {
  return {
    name: 'github-app-manager-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (!url.startsWith('/api/')) return next();

        const handler = routes[`${req.method} ${url}`];
        if (!handler) return json(res, 404, { error: `不明なエンドポイント: ${req.method} ${url}` });

        try {
          const body = req.method === 'POST' ? await readBody(req) : {};
          if (body === null) return json(res, 400, { error: 'JSON の解析に失敗しました' });
          await handler(req, res, body);
        } catch (err) {
          json(res, 500, { error: String(err?.stack ?? err) });
        }
      });
    },
  };
}
