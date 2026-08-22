import { post } from './api.js';
import { openModal, alertModal, el } from './modal.js';

const ACTION_LABEL = {
  push: 'GitHub へ push',
  'commit-push': 'コミットして push',
  'init-repo': 'リポジトリを作成して push',
  clone: 'ローカルへ clone',
};

const ENDPOINT = {
  push: '/git/push',
  'commit-push': '/git/commit-push',
  'init-repo': '/git/init-repo',
  clone: '/git/clone',
};

function renderLog(box, log) {
  for (const step of log) {
    box.append(el('p', 'hint', `[${step.label}] ${step.command}`));
    const out = [step.stdout, step.stderr].filter((s) => s?.trim()).join('\n').trim();
    box.append(el('pre', null, out || `(出力なし / 終了コード ${step.code})`));
  }
}

/**
 * 実行前に必ずプレビューを出し、ユーザーが承認したときだけ実際のコマンドを走らせる。
 * @returns {Promise<object|null>} 成功時は再スキャン後のデータ（呼び出し側で再描画する）
 */
export async function runAction(project, action, extra = {}) {
  const preview = await post('/git/preview', { key: project.key, action, ...extra });
  if (!preview.ok) {
    await alertModal('実行できません', preview.data.error ?? '不明なエラー');
    return null;
  }

  const { commands, warnings = [], secrets = [], files = [], blocked } = preview.data;

  const approved = await openModal({
    title: `${ACTION_LABEL[action]} — ${project.name}`,
    confirmLabel: blocked ? null : '実行する',
    danger: action !== 'clone',
    build: (box) => {
      if (secrets.length) {
        box.append(el('div', 'alert',
          `秘密情報らしきファイルが ${secrets.length} 件含まれています。実行をブロックしました。` +
          '.gitignore に追加してから再スキャンしてください。'));
        const ul = el('ul', 'filelist');
        for (const f of secrets) ul.append(el('li', null, f));
        box.append(ul);
      }
      for (const w of warnings) box.append(el('div', 'alert alert--warn', w));

      box.append(el('p', 'hint', '以下のコマンドを順に実行します:'));
      box.append(el('pre', null, commands.join('\n')));

      if (files.length) {
        box.append(el('p', 'hint', `コミット対象 ${files.length} 件:`));
        const ul = el('ul', 'filelist');
        for (const f of files.slice(0, 200)) ul.append(el('li', null, f));
        if (files.length > 200) ul.append(el('li', null, `… 他 ${files.length - 200} 件`));
        box.append(ul);
      }
    },
  });

  if (!approved) return null;

  const res = await post(ENDPOINT[action], { key: project.key, ...extra });
  const log = res.data.log ?? [];
  const succeeded = res.ok && res.data.ok !== false;

  await alertModal(succeeded ? '完了しました' : '失敗しました', (box) => {
    box.append(el('div', `alert alert--${succeeded ? 'ok' : ''}`.trim(),
      succeeded ? `${ACTION_LABEL[action]} が完了しました。` : (res.data.error ?? '実行中にエラーが発生しました。')));
    renderLog(box, log);
  });

  if (!succeeded) return null;
  const fresh = await post('/rescan', {});
  return fresh.ok ? fresh.data : null;
}

/** コミットメッセージを入力させてから commit-push を実行する */
export async function promptCommitAndPush(project) {
  let message = '';
  const ok = await openModal({
    title: `コミットメッセージ — ${project.name}`,
    confirmLabel: '次へ',
    build: (box) => {
      const label = el('label', 'field');
      label.append(el('span', null, `未コミット ${project.dirtyCount} 件をまとめてコミットします`));
      const input = el('input');
      input.type = 'text';
      input.placeholder = '例: 表示崩れを修正';
      input.addEventListener('input', () => { message = input.value; });
      label.append(input);
      box.append(label);
      setTimeout(() => input.focus(), 0);
    },
  });
  if (!ok) return null;
  if (!message.trim()) {
    await alertModal('メッセージが空です', 'コミットメッセージを入力してください。');
    return null;
  }
  return runAction(project, 'commit-push', { message: message.trim() });
}

/** 新規リポジトリ名と公開設定を確認してから init-repo を実行する */
export async function promptInitRepo(project) {
  let name = project.localDir ?? project.name;
  let visibility = 'public';

  const ok = await openModal({
    title: `GitHub リポジトリを作成 — ${project.name}`,
    confirmLabel: '次へ',
    build: (box) => {
      const l1 = el('label', 'field');
      l1.append(el('span', null, 'リポジトリ名'));
      const input = el('input');
      input.type = 'text';
      input.value = name;
      input.addEventListener('input', () => { name = input.value; });
      l1.append(input);

      const l2 = el('label', 'field');
      l2.append(el('span', null, '公開設定'));
      const sel = el('select');
      for (const [v, t] of [['public', 'public（誰でも閲覧可・GitHub Pages が使える）'], ['private', 'private（自分のみ）']]) {
        const o = el('option', null, t);
        o.value = v;
        sel.append(o);
      }
      sel.addEventListener('change', () => { visibility = sel.value; });
      l2.append(sel);

      box.append(l1, l2);
      box.append(el('p', 'hint', 'ローカルの全ファイルが初回コミットとして push されます。'));
      setTimeout(() => input.focus(), 0);
    },
  });
  if (!ok) return null;
  return runAction(project, 'init-repo', { repoName: name.trim(), visibility });
}
