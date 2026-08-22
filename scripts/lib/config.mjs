import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

/** スキャン対象のプロジェクト置き場。既定は本プロジェクトの親ディレクトリ。 */
export const PROJECTS_ROOT = path.resolve(
  process.env.PROJECTS_ROOT ?? path.join(ROOT, '..')
);

/** GitHub のオーナー名。git の user.name ではなく remote から推定した値を既定にする。 */
export const GITHUB_OWNER = process.env.GITHUB_OWNER ?? 'kou56250046-cloud';

export const DATA_DIR = path.join(ROOT, 'data');
export const LOCAL_JSON = path.join(DATA_DIR, 'projects.local.json');
export const META_JSON = path.join(DATA_DIR, 'projects-meta.json');
export const PUBLIC_JSON = 'projects.public.json';

/** 走査から除外するディレクトリ名 */
export const IGNORED_DIRS = new Set([
  '.claude', '.git', 'node_modules', '.vscode', '.idea',
]);

/** コミットに紛れ込ませたくないファイルのパターン（秘密情報ガード） */
export const SECRET_PATTERNS = [
  /(^|\/)\.env($|\.)/i,
  /(^|\/)[^/]*\.(key|pem|p12|pfx|keystore)$/i,
  /(^|\/)(credentials|secrets?)(\.|$)/i,
  /(^|\/)id_(rsa|ed25519|ecdsa)$/i,
  /(^|\/)service-account.*\.json$/i,
];
/** Windows のパス区切りを / に正規化する（正規表現内で表現しづらいので文字コードで扱う） */
export function toPosix(p) {
  return String(p).split(String.fromCharCode(92)).join("/");
}


export function isSecretPath(p) {
  const norm = toPosix(p);
  return SECRET_PATTERNS.some((re) => re.test(norm));
}
