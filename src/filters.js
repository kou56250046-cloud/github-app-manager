import { URGENCY } from './constants.js';

export const filters = {
  syncState: '',   // サマリーチップ由来。'name-mismatch' などフラグも受ける
  stack: '',
  status: '',
  q: '',
  sort: 'updated',
};

const FLAG_KEYS = new Set(['name-mismatch', 'no-upstream', 'behind', 'repo-unverified']);

function matches(p) {
  if (filters.syncState) {
    const hit = FLAG_KEYS.has(filters.syncState)
      ? (p.flags ?? []).includes(filters.syncState)
      : p.syncState === filters.syncState;
    if (!hit) return false;
  }
  if (filters.stack && !(p.stack ?? []).includes(filters.stack)) return false;
  if (filters.status && p.status !== filters.status) return false;

  if (filters.q) {
    const hay = [p.name, p.localDir, p.repoName, p.summary, ...(p.stack ?? []), ...(p.tags ?? [])]
      .filter(Boolean).join(' ').toLowerCase();
    if (!hay.includes(filters.q.toLowerCase())) return false;
  }
  return true;
}

const byUpdatedDesc = (a, b) => (b.lastUpdated ?? '').localeCompare(a.lastUpdated ?? '');

const SORTERS = {
  updated: byUpdatedDesc,
  'updated-asc': (a, b) => (a.lastUpdated ?? '').localeCompare(b.lastUpdated ?? ''),
  name: (a, b) => a.name.localeCompare(b.name, 'ja'),
  state: (a, b) => {
    const d = (URGENCY[a.syncState] ?? 9) - (URGENCY[b.syncState] ?? 9);
    return d !== 0 ? d : byUpdatedDesc(a, b);
  },
};

export function applyFilters(projects) {
  return projects.filter(matches).sort(SORTERS[filters.sort] ?? byUpdatedDesc);
}

/** スタック絞り込みの選択肢を、実際に存在するものだけで作る */
export function collectStacks(projects) {
  const counts = new Map();
  for (const p of projects) {
    for (const s of p.stack ?? []) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
    .map(([name, n]) => ({ name, n }));
}
