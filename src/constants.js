export const STATE_META = {
  synced:        { label: '同期済み',     color: 'var(--s-synced)' },
  uncommitted:   { label: '未コミット',   color: 'var(--s-uncommitted)' },
  unpushed:      { label: '未push',       color: 'var(--s-unpushed)' },
  'local-only':  { label: 'ローカルのみ', color: 'var(--s-local)' },
  'remote-only': { label: 'GitHubのみ',   color: 'var(--s-remote)' },
  behind:        { label: 'リモート先行', color: 'var(--s-behind)' },
  attention:     { label: '要対応',       color: 'var(--s-uncommitted)' },
};

export const FLAG_LABEL = {
  'name-mismatch': '名前不一致',
  'no-upstream': 'upstream未設定',
  uncommitted: '未コミット',
  unpushed: '未push',
  behind: 'リモート先行',
  'repo-unverified': 'GitHub側で確認できず',
};

/**
 * サマリー行にクイックチップとして出すスタック。
 * 「どこで動かすものか」が一目で分かるものだけを並べる（該当0件なら出さない）。
 */
export const QUICK_STACKS = [
  { name: 'Streamlit', color: 'var(--s-streamlit)' },
  { name: 'FastAPI', color: 'var(--s-remote)' },
  { name: 'Django', color: 'var(--s-synced)' },
  { name: 'Flask', color: 'var(--s-local)' },
];

export const STATUS_LABEL = { active: '稼働中', wip: '開発中', archived: 'アーカイブ' };

/** 「要対応順」ソートの優先度。数字が小さいほど先に出す。 */
export const URGENCY = {
  unpushed: 0, uncommitted: 1, attention: 1.5, behind: 2, 'local-only': 3, 'remote-only': 4, synced: 5,
};

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '—';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

/** 「3日前」のような相対表記。放置期間が一目で分かるようにする。 */
export function relDays(iso) {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (Number.isNaN(days)) return '';
  if (days <= 0) return '今日';
  if (days === 1) return '昨日';
  if (days < 30) return `${days}日前`;
  if (days < 365) return `${Math.floor(days / 30)}ヶ月前`;
  return `${Math.floor(days / 365)}年前`;
}
