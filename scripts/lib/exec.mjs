import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * コマンドを実行し、必ず {ok, stdout, stderr, code} を返す。
 * 失敗を例外にしないのは、スキャン中に1プロジェクトが壊れていても走査を続けたいため。
 */
export async function run(cmd, args, opts = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
      ...opts,
    });
    return { ok: true, stdout, stderr, code: 0 };
  } catch (err) {
    return {
      ok: false,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? String(err.message ?? err),
      code: typeof err.code === 'number' ? err.code : 1,
    };
  }
}

/** git をリポジトリ指定で実行。日本語ファイル名がエスケープされないよう quotepath を切る。 */
export function git(cwd, args, opts = {}) {
  return run('git', ['-c', 'core.quotepath=false', '-C', cwd, ...args], opts);
}

/** 成功時のみ trim した stdout、失敗時は null */
export async function gitOut(cwd, args) {
  const r = await git(cwd, args);
  return r.ok ? r.stdout.trim() : null;
}
