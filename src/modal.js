const root = () => document.getElementById('modalRoot');

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/**
 * 汎用モーダル。resolve(true/false) を返す Promise。
 * @param {{title:string, build:(box:HTMLElement)=>void, confirmLabel?:string,
 *          cancelLabel?:string, danger?:boolean, confirmDisabled?:boolean}} opts
 */
export function openModal(opts) {
  return new Promise((resolve) => {
    const wrap = el('div', 'modal');
    const box = el('div', 'modal__box');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.append(el('h3', null, opts.title));

    opts.build?.(box);

    const foot = el('div', 'modal__foot');
    const cancel = el('button', 'btn btn--ghost', opts.cancelLabel ?? 'キャンセル');
    foot.append(cancel);

    let confirm = null;
    if (opts.confirmLabel) {
      confirm = el('button', `btn${opts.danger ? ' btn--danger' : ''}`, opts.confirmLabel);
      confirm.disabled = Boolean(opts.confirmDisabled);
      foot.append(confirm);
    }
    box.append(foot);
    wrap.append(box);
    root().append(wrap);
    (confirm ?? cancel).focus();

    const close = (v) => {
      document.removeEventListener('keydown', onKey);
      wrap.remove();
      resolve(v);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(false); };

    cancel.addEventListener('click', () => close(false));
    confirm?.addEventListener('click', () => close(true));
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(false); });
    document.addEventListener('keydown', onKey);
  });
}

export function alertModal(title, buildOrText, variant) {
  return openModal({
    title,
    cancelLabel: '閉じる',
    build: (box) => {
      if (typeof buildOrText === 'function') buildOrText(box);
      else box.append(el('div', `alert${variant ? ` alert--${variant}` : ''}`, buildOrText));
    },
  });
}

export { el };
