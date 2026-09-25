import { STATE_META, FLAG_LABEL, QUICK_STACKS, fmtDate, relDays } from './constants.js';
import { state } from './api.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const quickStack = (name) => QUICK_STACKS.find((s) => s.name === name);

function renderCard(p, onOpen) {
  const meta = STATE_META[p.syncState] ?? { label: p.syncState, color: 'var(--text-dim)' };
  const card = el('button', 'card');
  card.type = 'button';
  card.style.setProperty('--c', meta.color);
  card.setAttribute('aria-label', `${p.name} の詳細を開く`);

  const head = el('div', 'card__head');
  const titleWrap = el('div');
  titleWrap.append(el('h2', 'card__name', p.name));
  if (p.repoName && p.repoName !== p.name) {
    titleWrap.append(el('span', 'card__repo', p.repoName));
  } else if (!p.repoName) {
    titleWrap.append(el('span', 'card__repo', 'GitHub 未登録'));
  }
  const state = el('span', 'state', meta.label);
  state.style.setProperty('--c', meta.color);
  head.append(titleWrap, state);

  const summary = el(
    'p',
    p.summary ? 'card__summary' : 'card__summary card__summary--empty',
    p.summary ?? (state.isDev ? '概要未設定 — クリックして記入できます' : '概要未設定')
  );

  const tags = el('div', 'tags');
  // Streamlit のように実行環境が変わるスタックは、並び順でも色でも目立たせる
  const stack = [...(p.stack ?? [])].sort(
    (a, b) => (quickStack(b) ? 1 : 0) - (quickStack(a) ? 1 : 0)
  );
  for (const t of stack.slice(0, 4)) {
    const hit = quickStack(t);
    const tag = el('span', hit ? 'tag tag--stack' : 'tag', t);
    if (hit) tag.style.setProperty('--c', hit.color);
    tags.append(tag);
  }
  for (const f of p.flags ?? []) {
    if (f === 'name-mismatch' || f === 'repo-unverified') {
      tags.append(el('span', 'tag tag--warn', `⚠ ${FLAG_LABEL[f]}`));
    }
  }
  if (p.isPrivate) tags.append(el('span', 'tag', 'private'));

  const foot = el('div', 'card__foot');
  const when = relDays(p.lastUpdated);
  foot.append(el('span', null, `${fmtDate(p.lastUpdated)}${when ? ` (${when})` : ''}`));
  if (p.liveUrl) {
    const a = el('a', 'card__link', '公開ページ ↗');
    a.href = p.liveUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.addEventListener('click', (e) => e.stopPropagation());
    foot.append(a);
  }
  // ローカル起動ポート（~/projects/PORTS.md）。複数あっても 1 か所にまとめる
  if (p.ports?.length) {
    const wrap = el('span', 'card__ports');
    for (const pt of p.ports) {
      if (/^https?:\/\//.test(pt.url)) {
        const a = el('a', 'card__link', `:${pt.port} ↗`);
        a.href = pt.url;
        a.target = '_blank';
        a.rel = 'noopener';
        if (pt.label) a.title = pt.label;
        a.addEventListener('click', (e) => e.stopPropagation());
        wrap.append(a);
      } else {
        const s = el('span', null, `:${pt.port}`);
        s.title = [pt.label, pt.url].filter(Boolean).join(' / ');
        wrap.append(s);
      }
    }
    foot.append(wrap);
  }

  card.append(head, summary, tags, foot);
  card.addEventListener('click', () => onOpen(p));
  return card;
}

export function renderGrid(root, projects, onOpen) {
  root.replaceChildren();
  if (!projects.length) {
    root.append(el('p', 'empty', '条件に一致するプロジェクトがありません。'));
    return;
  }
  const frag = document.createDocumentFragment();
  for (const p of projects) frag.append(renderCard(p, onOpen));
  root.append(frag);
}
