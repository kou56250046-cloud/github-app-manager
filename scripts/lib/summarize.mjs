import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_LEN = 120;

/** 自動生成テンプレ由来の無意味な説明文。概要として採用しない。 */
const BOILERPLATE = [
  /this is a next\.js project bootstrapped/i,
  /this file provides guidance to claude/i,
  /first, run the development server/i,
  /^getting started/i,
  /^to learn more about next\.js/i,
  /create react app|vite \+ react|npm run dev/i,
  /^welcome to your new project/i,
  /this version has breaking changes/i,
  /open http:\/\/localhost/i,
  /you can start editing the page/i,
  /next\/font.*(automatically )?optimi/i,
  /^learn more/i,
  /deploy on vercel|next\.js deployment documentation|vercel platform/i,
  /check out (our|the) \[?next\.js/i,
  /the page auto-updates as you edit/i,
  /this project (was|is) (bootstrapped|generated) (with|by)/i,
];

function isBoilerplate(s) {
  return BOILERPLATE.some((re) => re.test(s));
}

/** Markdown から最初の「意味のある段落」を取り出す */
function firstParagraph(md) {
  const cleaned = md
    .replace(/^---\n[\s\S]*?\n---\n/, '')      // front matter
    .replace(/<!--[\s\S]*?-->/g, '')            // HTMLコメント
    .replace(/```[\s\S]*?```/g, '')             // コードフェンス
    .replace(/^\s*[-*+]\s+\[[ x]\]\s.*$/gm, ''); // チェックリスト

  for (const block of cleaned.split(/\n\s*\n/)) {
    let line = block.trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;                 // 見出し
    if (/^[|>]/.test(line)) continue;                   // 表・引用
    if (/^\s*[-*+]\s/.test(line)) continue;             // 箇条書き
    if (/^!\[/.test(line)) continue;                    // 画像のみ
    if (/^\[!\[/.test(line)) continue;                  // バッジ
    if (/^<\w/.test(line)) continue;                    // 生HTML
    if (/^@/.test(line)) continue;                      // @AGENTS.md 等のインポート指示
    if (/^[\w.\-/]+\.(md|json|txt|js|ts|html)$/i.test(line)) continue; // ファイル名だけの行

    line = line
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')             // 画像
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')          // リンク→テキスト
      .replace(/[*_`~]/g, '')                           // 強調記号
      .replace(/\s+/g, ' ')
      .trim();

    if (line.length >= 8 && !isBoilerplate(line)) return line;
  }
  return null;
}

function truncate(s) {
  if (!s) return null;
  return s.length > MAX_LEN ? `${s.slice(0, MAX_LEN - 1)}…` : s;
}

async function readIfExists(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }
}

/**
 * ローカルのファイル群から概要を抽出する。
 * 上位（meta の手動上書き・GitHub description）は reconcile 側で適用するため、ここでは扱わない。
 *
 * @returns {{ summary: string|null, source: string|null }}
 */
export async function summarizeLocal(dirPath, entries, pkg) {
  if (pkg?.description && String(pkg.description).trim()) {
    return { summary: truncate(String(pkg.description).trim()), source: 'package.json' };
  }

  const readme = [...entries].find((e) => /^readme\.md$/i.test(e));
  if (readme) {
    const p = firstParagraph((await readIfExists(path.join(dirPath, readme))) ?? '');
    if (p) return { summary: truncate(p), source: 'README' };
  }

  // 要件定義書 / 設計書の類
  const docCandidates = [...entries].filter((e) =>
    /要件定義|仕様|ARCHITECTURE\.md$|^Architecture\.md$/i.test(e) && /\.md$/i.test(e)
  );
  for (const doc of docCandidates) {
    const p = firstParagraph((await readIfExists(path.join(dirPath, doc))) ?? '');
    if (p) return { summary: truncate(p), source: doc };
  }

  const agents = [...entries].find((e) => /^agents\.md$/i.test(e));
  if (agents) {
    const p = firstParagraph((await readIfExists(path.join(dirPath, agents))) ?? '');
    if (p) return { summary: truncate(p), source: 'AGENTS.md' };
  }

  const claude = [...entries].find((e) => /^claude\.md$/i.test(e));
  if (claude) {
    const p = firstParagraph((await readIfExists(path.join(dirPath, claude))) ?? '');
    if (p) return { summary: truncate(p), source: 'CLAUDE.md' };
  }

  return { summary: null, source: null };
}
