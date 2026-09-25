import fs from 'node:fs/promises';
import path from 'node:path';
import { PROJECTS_ROOT } from './config.mjs';

/** ~/projects/PORTS.md。ポートの割り当てはこのファイルを正とする */
const PORTS_MD = path.join(PROJECTS_ROOT, 'PORTS.md');

/** `pnpm dev` のようなバッククォートを外す */
const unquote = (s) => s.replace(/`/g, '').trim();

/** セル内の `\|` は区切りとみなさない（仮の文字に逃がしてから分割し、戻す） */
const ESCAPED_PIPE = '\u0000';

function splitRow(line) {
  return line
    .replace(/\\\|/g, ESCAPED_PIPE)
    .replace(/^\s*\|/, '').replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.split(ESCAPED_PIPE).join('|').trim());
}

/**
 * PORTS.md の「## 一覧」の表を読み、ディレクトリ名 → ポート一覧 の Map にする。
 * 同じファイルにある「帯域」表は列が違うので読まない。
 * 書き方の崩れで黙って 0 件にならないよう、見出しが無いときと読めなかった行は warnings に出す。
 * @returns {{ map: Map<string, {port:number,label:string,command:string,url:string,config:string}[]>, warnings: string[] }}
 */
export function parsePortsMarkdown(text) {
  const map = new Map();
  const warnings = [];
  if (!text) return { map, warnings };

  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+一覧\s*$/.test(l));
  if (start < 0) {
    warnings.push('PORTS.md に「## 一覧」の見出しが無いため、ポートを読み込めませんでした。');
    return { map, warnings };
  }

  const skipped = [];
  let header = true;
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    if (!line.trim().startsWith('|')) continue;
    const cells = splitRow(line);
    // 表の先頭にあるヘッダ行と区切り行（|---|）は読み飛ばす
    if (header) {
      if (cells.every((c) => /^:?-+:?$/.test(c))) header = false;
      continue;
    }
    if (cells.length < 5 || !/^\d+$/.test(cells[0])) {
      skipped.push(cells[0] || line.trim());
      continue;
    }

    // 「ai-scraping（AI Radar 画面）」→ ディレクトリ名と注記に分ける
    const name = unquote(cells[1]);
    const m = name.match(/^(.+?)（(.+)）$/);
    const dir = (m ? m[1] : name).trim();
    const entry = {
      port: Number(cells[0]),
      label: m ? m[2].trim() : '',
      command: unquote(cells[2]),
      url: cells[3],
      config: unquote(cells[4]),
    };
    if (!map.has(dir)) map.set(dir, []);
    map.get(dir).push(entry);
  }
  if (skipped.length) {
    warnings.push(`PORTS.md の一覧で ${skipped.length} 行を読めませんでした（ポート列が数字でないか、列が足りません）: ${skipped.join(', ')}`);
  }
  return { map, warnings };
}

/** PORTS.md を読む。無い・読めないときは空（スキャンは止めない。ファイルが無いのは正常扱い） */
export async function loadPorts() {
  let text;
  try {
    text = await fs.readFile(PORTS_MD, 'utf8');
  } catch {
    return { map: new Map(), warnings: [] };
  }
  return parsePortsMarkdown(text);
}
