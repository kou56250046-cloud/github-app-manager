/**
 * プロジェクトの技術スタック・種別を判定してタグ配列を返す。
 * 排他ではなく複数付与する（例: ["Next.js", "Vercel"]）。
 *
 * @param {{ entries: Set<string>, pkg: object|null, hasWorkflows: boolean, hasPyFiles: boolean,
 *          pyDeps: Set<string> }} ctx
 */
export function detectStack(ctx) {
  const { entries, pkg, hasWorkflows, hasPyFiles, pyDeps = new Set() } = ctx;
  const tags = [];
  const deps = pkg ? { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) } : {};
  const has = (name) => Object.prototype.hasOwnProperty.call(deps, name);

  // --- フレームワーク（上位のものが付いたら下位は付けない） ---
  if (has('next')) tags.push('Next.js');
  else if (has('electron') || has('electron-vite')) tags.push('Electron');
  else if (has('astro')) tags.push('Astro');
  else if (has('react')) tags.push('React');

  if (has('vite') && !tags.includes('Next.js') && !tags.includes('Astro')) tags.push('Vite');
  if (has('typescript') || entries.has('tsconfig.json')) tags.push('TypeScript');
  if (has('tailwindcss')) tags.push('Tailwind');

  // --- 言語・ランタイム ---
  const isPython = entries.has('requirements.txt') || entries.has('pyproject.toml') || hasPyFiles;

  // Python 側のフレームワーク。Streamlit は「どこで動かすか」が変わるので必ず出す。
  if (pyDeps.has('streamlit')) tags.push('Streamlit');
  else if (pyDeps.has('fastapi')) tags.push('FastAPI');
  else if (pyDeps.has('django')) tags.push('Django');
  else if (pyDeps.has('flask')) tags.push('Flask');

  if (isPython) tags.push('Python');

  // --- 配信形態 ---
  const hasManifest = entries.has('manifest.json') || entries.has('manifest.webmanifest');
  const hasSw = entries.has('sw.js') || entries.has('service-worker.js');
  if (hasManifest && hasSw) tags.push('PWA');

  if (entries.has('index.html') && !pkg) tags.push('静的HTML');

  // --- インフラ ---
  if (hasWorkflows) tags.push('GitHub Actions');
  if (entries.has('vercel.json') || entries.has('.vercel')) tags.push('Vercel');

  // 何も当たらなかった場合の受け皿
  if (tags.length === 0) tags.push(pkg ? 'Node.js' : '不明');

  return [...new Set(tags)];
}

/** カードのプレースホルダ色を決めるための代表タグ */
export function primaryStack(tags) {
  const order = ['Next.js', 'Electron', 'Astro', 'React', 'Streamlit', 'FastAPI', 'Django', 'Flask',
    'Python', 'PWA', '静的HTML', 'Vite', 'Node.js'];
  return order.find((t) => tags.includes(t)) ?? tags[0] ?? '不明';
}
