import './style.css';
import { detectMode, loadData, post, state } from './api.js';
import { STATE_META, FLAG_LABEL, QUICK_STACKS, fmtDate } from './constants.js';
import { renderGrid } from './cards.js';
import { renderDetail } from './detail.js';
import { filters, applyFilters, collectStacks } from './filters.js';
import { el, alertModal } from './modal.js';

const $ = (id) => document.getElementById(id);
const dom = {
  grid: $('grid'), summary: $('summary'), detail: $('detail'), overlay: $('overlay'),
  search: $('search'), stack: $('stackFilter'), status: $('statusFilter'), sort: $('sort'),
  count: $('resultCount'), info: $('scanInfo'), mode: $('modeBadge'),
  rescan: $('btnRescan'), warnings: $('warnings'),
};

let data = null;
let openKey = null;

/** サマリーチップ。表示するのは「対応が必要な状態」を優先した順序。 */
const CHIP_ORDER = ['unpushed', 'uncommitted', 'attention', 'local-only', 'remote-only', 'behind', 'synced'];

/** 公開版は counts を持たないので、常に projects から数え直す */
function tally() {
  const states = {};
  const flags = {};
  for (const p of data.projects) {
    states[p.syncState] = (states[p.syncState] ?? 0) + 1;
    for (const f of p.flags ?? []) flags[f] = (flags[f] ?? 0) + 1;
  }
  return { states, flags };
}

/** スタック絞り込みは select とチップの両方から操作するので、必ずここを通す */
function setStack(name) {
  filters.stack = filters.stack === name ? '' : name;
  dom.stack.value = filters.stack;
  render();
}

function renderSummary() {
  dom.summary.replaceChildren();
  const { states, flags } = tally();

  const chip = (key, label, n, color) => {
    if (!n) return;
    const b = el('button', 'chip');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(filters.syncState === key));
    const dot = el('span', 'chip__dot');
    dot.style.setProperty('--c', color);
    b.append(dot, el('span', 'chip__n', String(n)), el('span', null, label));
    b.addEventListener('click', () => {
      filters.syncState = filters.syncState === key ? '' : key;
      render();
    });
    dom.summary.append(b);
  };

  const all = el('button', 'chip');
  all.type = 'button';
  all.setAttribute('aria-pressed', String(!filters.syncState));
  all.append(el('span', 'chip__n', String(data.projects.length)), el('span', null, 'すべて'));
  all.addEventListener('click', () => { filters.syncState = ''; render(); });
  dom.summary.append(all);

  for (const k of CHIP_ORDER) chip(k, STATE_META[k]?.label ?? k, states[k], STATE_META[k]?.color);
  chip('name-mismatch', FLAG_LABEL['name-mismatch'], flags['name-mismatch'], 'var(--s-uncommitted)');
  chip('repo-unverified', FLAG_LABEL['repo-unverified'], flags['repo-unverified'], 'var(--s-behind)');

  renderStackChips();
}

/** Streamlit など「動かし方が違う」スタックをワンタップで絞り込めるようにする */
function renderStackChips() {
  const counts = new Map();
  for (const p of data.projects) {
    for (const st of p.stack ?? []) counts.set(st, (counts.get(st) ?? 0) + 1);
  }
  const shown = QUICK_STACKS.filter(({ name }) => counts.get(name));
  if (!shown.length) return;

  dom.summary.append(el('span', 'summary__sep'));
  for (const { name, color } of shown) {
    const b = el('button', 'chip');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(filters.stack === name));
    const dot = el('span', 'chip__dot');
    dot.style.setProperty('--c', color);
    b.append(dot, el('span', 'chip__n', String(counts.get(name))), el('span', null, name));
    b.addEventListener('click', () => setStack(name));
    dom.summary.append(b);
  }
}

function renderStackOptions() {
  const current = dom.stack.value;
  dom.stack.replaceChildren(el('option', null, 'スタック: すべて'));
  dom.stack.firstChild.value = '';
  for (const { name, n } of collectStacks(data.projects)) {
    const o = el('option', null, `${name} (${n})`);
    o.value = name;
    dom.stack.append(o);
  }
  dom.stack.value = current;
}

function renderWarnings() {
  const warns = data.github?.warnings ?? [];
  dom.warnings.replaceChildren();
  dom.warnings.hidden = !warns.length;
  for (const w of warns) {
    const p = el('p');
    // 警告文中のコマンド部分だけ <code> にする
    const parts = String(w).split('`');
    parts.forEach((part, i) => p.append(i % 2 ? el('code', null, part) : document.createTextNode(part)));
    dom.warnings.append(p);
  }
}

function openDetail(p) {
  openKey = p.key;
  dom.overlay.hidden = false;
  renderDetail(dom.detail, p, { onClose: closeDetail, onData: setData });
}

function closeDetail() {
  openKey = null;
  dom.detail.hidden = true;
  dom.overlay.hidden = true;
}

function render() {
  const visible = applyFilters(data.projects);
  renderSummary();
  renderGrid(dom.grid, visible, openDetail);
  dom.count.textContent = `${visible.length} / ${data.projects.length} 件`;

  if (openKey) {
    const p = data.projects.find((x) => x.key === openKey);
    if (p) renderDetail(dom.detail, p, { onClose: closeDetail, onData: setData });
    else closeDetail();
  }
}

function setData(fresh) {
  data = fresh;
  if (state.isDev) {
    const local = data.projects.filter((p) => p.hasLocal).length;
    const time = new Date(data.scannedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    dom.info.textContent =
      `ローカル ${local} 件 / GitHub ${data.github?.repoCount ?? 0} 件 ・ 最終スキャン ${fmtDate(data.scannedAt)} ${time}`;
  } else {
    dom.info.textContent = `全 ${data.projects.length} 件 ・ 生成日 ${fmtDate(data.generatedAt)}`;
  }
  renderWarnings();
  renderStackOptions();
  render();
}

function bind() {
  let t;
  dom.search.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { filters.q = dom.search.value.trim(); render(); }, 150);
  });
  dom.stack.addEventListener('change', () => { filters.stack = dom.stack.value; render(); });
  dom.status.addEventListener('change', () => { filters.status = dom.status.value; render(); });
  dom.sort.addEventListener('change', () => { filters.sort = dom.sort.value; render(); });
  dom.overlay.addEventListener('click', closeDetail);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !dom.detail.hidden) closeDetail();
  });

  dom.rescan.addEventListener('click', async () => {
    dom.rescan.disabled = true;
    dom.rescan.textContent = 'スキャン中…';
    const res = await post('/rescan', {});
    dom.rescan.disabled = false;
    dom.rescan.textContent = '再スキャン';
    if (res.ok) setData(res.data);
    else await alertModal('再スキャンに失敗しました', res.data.error ?? '不明なエラー');
  });
}

async function boot() {
  await detectMode();
  dom.mode.textContent = state.isDev ? 'ローカルモード（操作可）' : '閲覧専用';
  dom.rescan.hidden = !state.isDev;
  bind();

  try {
    setData(await loadData());
  } catch (err) {
    dom.grid.replaceChildren(el('p', 'empty', `読み込みに失敗しました: ${err.message}`));
  }
}

boot();
