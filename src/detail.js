import { STATE_META, FLAG_LABEL, STATUS_LABEL, fmtDate, relDays } from './constants.js';
import { state, post } from './api.js';
import { runAction, promptCommitAndPush, promptInitRepo } from './actions.js';
import { el } from './modal.js';
import { alertModal } from './modal.js';

function kv(pairs) {
  const dl = el('dl', 'kv');
  for (const [k, v] of pairs) {
    if (v == null || v === '') continue;
    dl.append(el('dt', null, k));
    const dd = el('dd');
    if (v instanceof Node) dd.append(v);
    else dd.textContent = String(v);
    dl.append(dd);
  }
  return dl;
}

function link(href, text) {
  const a = el('a', 'card__link', text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

/** ローカル起動ポート（~/projects/PORTS.md）。1 ポート 1 行。無ければ null で行ごと出さない */
function portList(ports) {
  if (!ports?.length) return null;
  const wrap = el('div', 'ports');
  for (const pt of ports) {
    const row = el('div', 'ports__row');
    const web = /^https?:\/\//.test(pt.url);
    row.append(web ? link(pt.url, `:${pt.port}`) : el('span', null, `:${pt.port}（${pt.url}）`));
    if (pt.label) row.append(el('span', null, pt.label));
    if (pt.command) row.append(el('code', null, pt.command));
    if (pt.config) row.append(el('span', 'hint', pt.config));
    wrap.append(row);
  }
  return wrap;
}

/** 概要・状態・タグの手動上書きフォーム */
function metaSection(p, onData) {
  const sec = el('section');
  sec.append(el('h3', null, '手動設定'));

  const summary = el('textarea');
  summary.rows = 3;
  summary.value = p.summarySource === 'manual' ? (p.summary ?? '') : '';
  summary.placeholder = p.summary ?? 'このアプリが何をするものか書いておくと一覧で分かりやすくなります';

  const status = el('select');
  for (const [v, t] of Object.entries(STATUS_LABEL)) {
    const o = el('option', null, t);
    o.value = v;
    if (p.status === v) o.selected = true;
    status.append(o);
  }

  const live = el('input');
  live.type = 'url';
  live.value = p.liveUrl ?? '';
  live.placeholder = 'https://…（自動推定を上書きしたいとき）';

  const tags = el('input');
  tags.type = 'text';
  tags.value = (p.tags ?? []).join(', ');
  tags.placeholder = 'カンマ区切り（例: 教会, PWA, 個人用）';

  for (const [labelText, node] of [
    ['概要', summary], ['状態', status], ['公開URL', live], ['タグ', tags],
  ]) {
    const l = el('label', 'field');
    l.append(el('span', null, labelText), node);
    sec.append(l);
  }

  const save = el('button', 'btn btn--sm', '保存');
  save.addEventListener('click', async () => {
    save.disabled = true;
    save.textContent = '保存中…';
    const patch = {
      summary: summary.value.trim() || null,
      status: status.value,
      liveUrl: live.value.trim() || null,
      tags: tags.value.split(',').map((s) => s.trim()).filter(Boolean),
    };
    if (!patch.tags.length) patch.tags = null;

    const res = await post('/meta', { key: p.key, patch });
    save.disabled = false;
    save.textContent = '保存';
    if (res.ok) onData(res.data);
    else await alertModal('保存に失敗しました', res.data.error ?? '不明なエラー');
  });

  const row = el('div', 'btnrow');
  row.append(save);
  sec.append(row);
  return sec;
}

/** 状態に応じて実行可能なアクションだけを出す */
function actionSection(p, onData) {
  const sec = el('section');
  sec.append(el('h3', null, '操作'));
  const row = el('div', 'btnrow');

  const add = (label, cls, handler) => {
    const b = el('button', `btn btn--sm${cls ? ` ${cls}` : ''}`, label);
    b.addEventListener('click', async () => {
      b.disabled = true;
      const fresh = await handler();
      b.disabled = false;
      if (fresh) onData(fresh);
    });
    row.append(b);
  };

  if (p.syncState === 'remote-only') {
    add('ローカルへ clone', null, () => runAction(p, 'clone'));
  } else if (p.syncState === 'local-only') {
    add('リポジトリを作成して push', 'btn--danger', () => promptInitRepo(p));
  } else {
    if (p.ahead > 0) add(`未pushの ${p.ahead} コミットを push`, 'btn--danger', () => runAction(p, 'push'));
    if (p.dirtyCount > 0) add(`${p.dirtyCount} 件をコミットして push`, 'btn--danger', () => promptCommitAndPush(p));
  }

  if (!row.children.length) {
    sec.append(el('p', 'hint', '同期済みです。実行できる操作はありません。'));
  } else {
    sec.append(row);
    sec.append(el('p', 'hint', '実行前に必ずコマンド内容の確認画面が出ます。'));
  }
  return sec;
}

export function renderDetail(panel, p, { onClose, onData }) {
  panel.replaceChildren();
  panel.hidden = false;

  const close = el('button', 'detail__close', '×');
  close.setAttribute('aria-label', '閉じる');
  close.addEventListener('click', onClose);
  panel.append(close);

  const meta = STATE_META[p.syncState] ?? { label: p.syncState, color: 'var(--text-dim)' };
  const head = el('section');
  head.append(el('h2', null, p.name));
  const badge = el('span', 'state', meta.label);
  badge.style.setProperty('--c', meta.color);
  const badgeRow = el('div', 'tags');
  badgeRow.append(badge);
  // 主バッジと同じ内容のフラグは重複するので出さない
  for (const f of (p.flags ?? []).filter((f) => f !== p.syncState)) {
    badgeRow.append(el('span', 'tag tag--warn', `⚠ ${FLAG_LABEL[f] ?? f}`));
  }
  head.append(badgeRow);
  if (p.summary) head.append(el('p', 'hint', `${p.summary}（出典: ${p.summarySource ?? '—'}）`));
  panel.append(head);

  const info = el('section');
  info.append(el('h3', null, '基本情報'));
  info.append(kv([
    ['ローカル', p.localPath ?? '未取得'],
    ['リポジトリ', p.repoUrl ? link(p.repoUrl, p.repoName) : '未登録'],
    ['公開URL', p.liveUrl ? link(p.liveUrl, p.liveUrl) : null],
    ['ローカル起動', portList(p.ports)],
    ['スタック', (p.stack ?? []).join(' / ') || null],
    ['ブランチ', p.branch],
    ['差分', p.hasUpstream ? `未push ${p.ahead} / 未取得 ${p.behind}` : (p.hasGit ? 'upstream 未設定' : null)],
    ['最終コミット', p.lastCommit ? `${fmtDate(p.lastCommit)} (${relDays(p.lastCommit)})` : null],
    ['最終push', p.lastPush ? `${fmtDate(p.lastPush)} (${relDays(p.lastPush)})` : null],
    ['状態', STATUS_LABEL[p.status] ?? p.status],
    ['公開範囲', p.isPrivate == null ? null : (p.isPrivate ? 'private' : 'public')],
  ]));
  panel.append(info);

  if (p.dirtyFiles?.length) {
    const sec = el('section');
    sec.append(el('h3', null, `未コミットのファイル (${p.dirtyCount})`));
    const ul = el('ul', 'filelist');
    for (const f of p.dirtyFiles.slice(0, 100)) ul.append(el('li', null, f));
    if (p.dirtyFiles.length > 100) ul.append(el('li', null, `… 他 ${p.dirtyFiles.length - 100} 件`));
    sec.append(ul);
    panel.append(sec);
  }

  if (state.isDev) {
    panel.append(actionSection(p, onData));
    panel.append(metaSection(p, onData));
  } else {
    panel.append(el('p', 'hint', '閲覧専用モードです。編集や操作はローカル（pnpm dev）で行えます。'));
  }
}
