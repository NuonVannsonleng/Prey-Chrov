// Builds the Khmer & cultural review pack: every string written in Khmer script, and every English
// line that touches Khmer culture or belief (Neak Ta, Ap, Arak, shrines, offerings, places and
// names), with where it lives and what it labels — from the game data and the code.
// Usage: npm run l10n:export              → docs/l10n/REVIEW_PACK.md and docs/l10n/review_pack.csv
//        npm run l10n:export -- --check   (exit 1 if either committed file is out of date)
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Paths from the repository root, wherever the script is run from.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA = join(ROOT, 'src/data');
const OUT_DIR = join(ROOT, 'docs/l10n');
const KHMER = /[\u1780-\u17FF\u19E0-\u19FF]/;
const CULTURAL = /\b(neak ta|ap|arak|shrines?|offerings?|spirits?|incense|krama|sampot|monks?|pagoda|temple|ancestors?|blessing|promise|guardian|khmer|cambodia\w*|angkor|tonle|mekong)\b/i;
// In code, only the specific terms (the generic ones match too many UI strings).
const CODE_CULTURAL = /\b(neak ta|shrines?|offerings?|ap and arak|incense|khmer)\b/i;

/** Walks a JSON value, yielding [path, string, context] for every string. */
function* strings(value, path, context) {
  if (typeof value === 'string') {
    yield [path, value, context];
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield* strings(value[i], `${path}[${i}]`, context);
    return;
  }
  if (value && typeof value === 'object') {
    const label = value.id ?? value.name ?? context;
    for (const [k, v] of Object.entries(value)) yield* strings(v, path ? `${path}.${k}` : k, typeof label === 'string' ? label : context);
  }
}

/** String literals in TypeScript source, skipping comment lines (each distinct string once). */
function codeStrings(source) {
  const code = source
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
  const out = new Set();
  const literal = /(['"`])((?:(?!\1)[^\n\\]|\\.)*?)\1/g;
  for (const m of code.matchAll(literal)) if (m[2].length >= 3) out.add(m[2]);
  return [...out];
}

export function buildPack() {
  const rows = [];
  for (const file of readdirSync(DATA).filter((f) => f.endsWith('.json')).sort()) {
    const json = JSON.parse(readFileSync(join(DATA, file), 'utf8'));
    for (const [path, text, context] of strings(json, '', '')) {
      // ids and keys are code, not text
      if (/(^|\.)(id|key|item|tile|sprite|lootTable|event|look|where|traveler|kind|category)$/.test(path) || /^[a-z0-9_]+$/.test(text)) continue;
      const kind = KHMER.test(text) ? 'Khmer' : CULTURAL.test(text) ? 'Cultural' : null;
      if (kind) rows.push({ file, path, context, kind, text });
    }
  }
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? (d.name === 'tests' ? [] : walk(join(dir, d.name))) : d.name.endsWith('.ts') ? [join(dir, d.name)] : []));
  for (const file of walk(join(ROOT, 'src')).sort()) {
    for (const text of codeStrings(readFileSync(file, 'utf8'))) {
      const kind = KHMER.test(text) ? 'Khmer' : /\s/.test(text) && CODE_CULTURAL.test(text) ? 'Cultural' : null;
      if (kind) rows.push({ file: relative(ROOT, file).split('\\').join('/'), path: '(code)', context: '', kind, text });
    }
  }
  return rows;
}

const md = (rows) => {
  const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const khmer = rows.filter((r) => r.kind === 'Khmer').length;
  const out = [
    '# Khmer & cultural review pack',
    '',
    'Generated from `src/data/*.json` and the code by `npm run l10n:export`. Do not edit by hand; regenerate after content changes.',
    '',
    `**${rows.length} lines to review:** ${khmer} in Khmer script, ${rows.length - khmer} English lines that touch Khmer culture or belief.`,
    '',
    'For each line, a native Khmer speaker (and, for cultural lines, a cultural advisor) can mark it OK, suggest a correction, or flag it to cut. The CSV beside this file (`review_pack.csv`) has the same rows with empty **status**, **suggestion** and **reviewer** columns for a spreadsheet.',
    '',
    'Ground rules from the design: Neak Ta are guardian spirits and never enemies. Ap and Arak are hostile *fictional interpretations*. The game must not depict or instruct literal religious practice. The fiction disclaimer stays in the credits.',
    '',
  ];
  rows.forEach((r, i) => {
    if (i === 0 || rows[i - 1].file !== r.file) out.push(`## ${r.file}`, '', '| Kind | Where | Labels | Text |', '| --- | --- | --- | --- |');
    out.push(`| ${r.kind} | \`${esc(r.path)}\` | ${esc(r.context)} | ${esc(r.text)} |`);
    if (i === rows.length - 1 || rows[i + 1].file !== r.file) out.push('');
  });
  return out.join('\n');
};

const csv = (rows) => {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return ['file,path,labels,kind,text,status,suggestion,reviewer', ...rows.map((r) => [r.file, r.path, r.context, r.kind, r.text, '', '', ''].map(q).join(','))].join('\n') + '\n';
};

const rows = buildPack();
const files = [
  ['REVIEW_PACK.md', md(rows)],
  // BOM so spreadsheet apps read Khmer as UTF-8
  ['review_pack.csv', '\uFEFF' + csv(rows)],
];
if (process.argv.includes('--check')) {
  const same = files.every(([f, text]) => existsSync(join(OUT_DIR, f)) && readFileSync(join(OUT_DIR, f), 'utf8') === text);
  console.log(same ? `Review pack is up to date (${rows.length} lines).` : 'Review pack is out of date: run npm run l10n:export');
  process.exit(same ? 0 : 1);
}
mkdirSync(OUT_DIR, { recursive: true });
for (const [f, text] of files) writeFileSync(join(OUT_DIR, f), text);
console.log(`Wrote ${rows.length} lines (${rows.filter((r) => r.kind === 'Khmer').length} Khmer) to docs/l10n/`);
