/**
 * dev 時は Vite プラグインの /api を使い、GitHub Pages 上では静的 JSON を読む。
 * isDev が false のとき操作系ボタンは表示しない。
 */
export const state = { isDev: false, projectsRoot: null };

/** dev サーバーは localhost でしか動かないので、それ以外では問い合わせない
 *  （公開ページのコンソールに 404 を残さないため） */
function couldBeDev() {
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '';
}

export async function detectMode() {
  if (!couldBeDev()) {
    state.isDev = false;
    return false;
  }
  try {
    const res = await fetch('./api/health', { cache: 'no-store' });
    if (!res.ok) return false;
    const h = await res.json();
    state.isDev = Boolean(h.dev);
    state.projectsRoot = h.projectsRoot ?? null;
  } catch {
    state.isDev = false;
  }
  return state.isDev;
}

export async function loadData() {
  if (state.isDev) {
    const res = await fetch('./api/data', { cache: 'no-store' });
    if (!res.ok) throw new Error(`データ取得に失敗しました (${res.status})`);
    return res.json();
  }
  const res = await fetch('./projects.public.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('projects.public.json を読み込めませんでした');
  return res.json();
}

export async function post(endpoint, body) {
  const res = await fetch(`./api${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({ error: '応答の解析に失敗しました' }));
  return { ok: res.ok, status: res.status, data };
}
