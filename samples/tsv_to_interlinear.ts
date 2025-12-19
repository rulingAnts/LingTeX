import fs from 'fs';
import os from 'os';
import path from 'path';
import child_process from 'child_process';

type TierName = 'Word' | 'Morphemes' | 'Lex. Gloss' | 'Word Gloss' | string;

type Example = {
  number?: string; // optional leading number
  tiers: Record<TierName, string[]>; // token arrays per tier
  tierOrder: TierName[]; // preserve the order encountered in TSV
  freeTranslations: { lang?: string; text: string }[]; // one or more
};

// Default maximum number of aligned interlinear tiers to render.
// Override via CLI flag --max-lines N (minimum 2).
function getMaxAlignedFromArgs(): number {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--max-lines');
  if (idx >= 0) {
    const raw = args[idx + 1];
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= 2) return n;
  }
  return 5;
}

function stripInvisible(s: string): string {
  // Remove LRM/RLM and embedding marks often present from copy/paste
  return s.replace(/[\u200E\u200F\u202A-\u202E]/g, '');
}

function readInputText(args: string[]): Promise<string> {
  const fileIdx = args.indexOf('--input-file');
  const openIdx = args.indexOf('--open-editor');
  if (fileIdx >= 0 && args[fileIdx + 1]) {
    return Promise.resolve(fs.readFileSync(path.resolve(args[fileIdx + 1]), 'utf8'));
  }
  if (openIdx >= 0) {
    return openEditorAndGetText();
  }
  // Fallback: read from stdin
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
  });
}

function openEditorAndGetText(): Promise<string> {
  const tmp = path.join(os.tmpdir(), `ilg_paste_${Date.now()}.tsv`);
  const template = [
    '# Paste TSV below. Lines starting with # are ignored.',
    '# Example tiers: (Number)\tMorphemes\t... or Word\t..., Lex. Gloss\t..., Word Gloss\t..., Free\t... ',
    '# Leave a blank line between examples, or include a Free line to terminate an example.',
    '',
    'Morphemes\tpa sɛn\tɛɾi\ta\t=bo\tɾi\tobwi\tnaʉ\t-ɥo',
    'Lex. Gloss\t***\tDET\t1SG\tERG\t2SG\tword\tsay\tINCMP',
    'Word Gloss\tMr. Seth\tthis\tI\t\tyou\tinform\t\t',
    'Free\tMr. Seth, I\'m telling you this:',
    ''
  ].join('\n');
  fs.writeFileSync(tmp, template, 'utf8');

  const codeCmd = `code -w "${tmp}"`;
  try {
    child_process.execSync(codeCmd, { stdio: 'inherit' });
  } catch {
    const editor = process.platform === 'darwin' ? `open -W -a TextEdit "${tmp}"` : `vi "${tmp}"`;
    child_process.execSync(editor, { stdio: 'inherit' });
  }
  const out = fs.readFileSync(tmp, 'utf8');
  fs.unlinkSync(tmp);
  return Promise.resolve(out);
}

function openEditorWithText(content: string, preferredPath?: string): string {
  // Write content to a file and open it for easy copy/paste.
  const target = preferredPath
    ? path.resolve(preferredPath)
    : path.join(os.tmpdir(), `ilg_output_${Date.now()}.tex`);
  fs.writeFileSync(target, content, 'utf8');
  const codeCmd = `code -r "${target}"`;
  try {
    child_process.execSync(codeCmd, { stdio: 'ignore' });
  } catch {
    const editor = process.platform === 'darwin' ? `open -a TextEdit "${target}"` : `xdg-open "${target}"`;
    try { child_process.execSync(editor, { stdio: 'ignore' }); } catch {}
  }
  return target;
}

function tokenizeTSVLine(line: string): string[] {
  const normalizeCell = (s: string): string => {
    const cleaned = stripInvisible(s).replace(/\u00A0/g, ' ').trim();
    if (!cleaned) return '~';
    return cleaned.replace(/ /g, '~');
  };
  return line.split('\t').map(normalizeCell);
}

function parseExamples(tsvRaw: string): Example[] {
  const lines = tsvRaw.split(/\r?\n/).map((l) => l.replace(/\u00A0/g, ' ').trimEnd());
  const filtered = lines.filter((l) => l.trim() !== '' && !l.trim().startsWith('#'));
  const examples: Example[] = [];
  let current: Example | null = null;

  function pushCurrent() {
    if (current && Object.keys(current.tiers).length > 0) examples.push(current);
    current = null;
  }

  for (const raw of filtered) {
    const line = stripInvisible(raw).trim();
    if (!line) { pushCurrent(); continue; }
    const cols = tokenizeTSVLine(line);
    if (cols.length === 0) continue;

    // Detect Free translation lines (may have language tag)
    const first = (cols[0] || '').toLowerCase();
    if (first.startsWith('free')) {
      if (!current) current = { tiers: {}, tierOrder: [], freeTranslations: [] };
      const lang = cols[0].slice(4).trim() || undefined; // e.g., 'Free Eng'
      const text = cols.slice(1).join(' ').trim();
      current.freeTranslations.push({ lang, text });
      pushCurrent();
      continue;
    }

    // Start new example when a new block begins (number + tier or named tier)
    const startsWithNumber = /^\d+$/.test(cols[0]);
    let tierName: TierName;
    let values: string[];
    if (startsWithNumber) {
      tierName = (cols[1] || 'Morphemes') as TierName;
      values = cols.slice(2);
      if (!current) current = { number: cols[0], tiers: {}, tierOrder: [], freeTranslations: [] };
    } else {
      tierName = (cols[0] || 'Morphemes') as TierName;
      values = cols.slice(1);
      if (!current) current = { tiers: {}, tierOrder: [], freeTranslations: [] };
    }

    current.tiers[tierName] = values;
    if (!current.tierOrder.includes(tierName)) current.tierOrder.push(tierName);
  }
  pushCurrent();
  return examples;
}

function chooseTier(ex: Example, preferred: TierName[]): string[] | null {
  for (const t of preferred) if (ex.tiers[t]) return ex.tiers[t];
  // fallback to any tier with non-empty tokens
  const entry = Object.entries(ex.tiers).find(([, v]) => v && v.length > 0);
  return entry ? entry[1] : null;
}

function gatherAlignedLines(ex: Example): string[] {
  const normalize = (name: TierName) => (name || '').toLowerCase();
  const canonicalOrder = ['word', 'morphemes', 'lex. gloss', 'word gloss', 'word cat.', 'pos'];
  const orderedTiers: TierName[] = [];
  const seen = new Set<string>();

  // First, place canonical tiers in preferred order if present
  for (const c of canonicalOrder) {
    const match = ex.tierOrder.find((t) => normalize(t) === c);
    if (match && !seen.has(normalize(match))) {
      orderedTiers.push(match);
      seen.add(normalize(match));
    }
  }

  // Then, append any remaining non-Free tiers in original encountered order
  for (const t of ex.tierOrder) {
    const lower = normalize(t);
    if (lower.startsWith('free')) continue;
    if (seen.has(lower)) continue;
    orderedTiers.push(t);
    seen.add(lower);
  }

  const lines: string[] = [];
  for (const t of orderedTiers) {
    const toks = ex.tiers[t] || [];
    const nonEmpty = toks.some((v) => (v ?? '').toString().trim().length > 0);
    if (!nonEmpty) continue;
    // Join tokens with '~' to avoid spaces and keep alignment placeholders
    lines.push(toks.join('~'));
  }
  return lines;
}

function renderGLLLines(ex: Example): { gCmd: string; lines: string[] } {
  const lines = gatherAlignedLines(ex);
  const n = lines.length;
  // Dynamically select macro: \gll (2), \glll (3), \gllll (4), \glllll (5), etc.
  // Many gb4e/langsci-gb4e setups define up to 5 lines; we emit as many 'l' as needed.
  const maxAligned = getMaxAlignedFromArgs();
  const count = Math.max(2, Math.min(n, maxAligned));
  const gCmd = 'g' + 'l'.repeat(count);
  return { gCmd, lines: lines.slice(0, count) };
}

function renderGlt(ex: Example): string | null {
  if (!ex.freeTranslations.length) return null;
  // join multiple free translations with separators and language tags if present
  const joined = ex.freeTranslations
    .map((f) => (f.lang ? `[${f.lang.trim()}] ${f.text}` : f.text))
    .filter(Boolean)
    .join(' ');
  return joined || null;
}

function latexEscape(s: string): string {
  return s
    .replace(/([%$#&_{}])/g, '\\$1')
    .replace(/\u00A0/g, ' ');
}

function renderExampleN(ex: Example): string {
  const { gCmd, lines } = renderGLLLines(ex);
  const glt = renderGlt(ex);
  // If no aligned lines, emit only translation (if any) to avoid a bare \gll
  if (!lines.length) {
    const transOnly = glt ? `\\glt ${latexEscape(glt)}` : '';
    return transOnly || '% (no aligned interlinear lines)';
  }

  const head = `\\${gCmd} ${latexEscape(lines[0])} \\\\`;
  const rest = lines.slice(1).map((ln) => `${latexEscape(ln)} \\\\`).join('\n');
  const gllBlock = [head, rest].filter(Boolean).join('\n');
  const trans = glt ? `\\glt ${latexEscape(glt)}` : '';
  return [gllBlock.trimEnd(), trans].filter(Boolean).join('\n');
}

// Legacy single/multi-line renderer (kept for reference, not used). Left intact without debug prefixes.
function renderExample(ex: Example): string {
  const { gCmd, lines } = renderGLLLines(ex);
  const glt = renderGlt(ex);
  if (!lines.length) return glt ? `\\glt ${latexEscape(glt)}` : '% (no aligned interlinear lines)';
  const parts: string[] = [`\\${gCmd} ${latexEscape(lines[0])} \\\\`];
  for (const ln of lines.slice(1)) parts.push(`${latexEscape(ln)} \\\\`);
  const gllBlock = parts.join('\n');
  const trans = glt ? `\\glt ${latexEscape(glt)}` : '';
  return [gllBlock.trimEnd(), trans].filter(Boolean).join('\n');
}

function asSingleExample(ex: Example): string {
  return [
    '\n% Single example',
    '\n\\begin{exe}',
    '\\ex % \\label{ex:KEY}',
    renderExampleN(ex),
    '\\end{exe}\n'
  ].join('\n');
}

function asListStarter(first: Example): string {
  return [
    '\n% Start a list example with this as (a).',
    '\n\\begin{exe}',
    '\\ex % \\label{ex:KEY}',
    '\\begin{xlist}',
    '\\ex % \\label{ex:KEY-a}',
    renderExampleN(first),
    '% Add more items as needed...',
    '\\end{xlist}',
    '\\end{exe}\n'
  ].join('\n');
}

function asListItem(ex: Example): string {
  return [
    '\n% List item to add inside an existing xlist',
    '\\ex % \\label{ex:KEY-?}',
    renderExampleN(ex),
    ''
  ].join('\n');
}

function asListOfExamples(exs: Example[]): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const items = exs
    .map((e, i) => ['\\ex % \\label{ex:KEY-' + (letters[i] || String(i + 1)) + '}', renderExampleN(e)].join('\n'))
    .join('\n');
  return [
    '\n% List example (numbered subexamples a, b, c, ...)',
    '\n\\begin{exe}',
    '\\ex % \\label{ex:KEY}',
    '\\begin{xlist}',
    items,
    '\\end{xlist}',
    '\\end{exe}\n'
  ].join('\n');
}

function asInterlinearText(exs: Example[]): string {
  const items = exs
    .map((e, i) => ['\\ex % \\label{ex:KEY-' + String(i + 1) + '}', renderExampleN(e)].join('\n'))
    .join('\n');
  return [
    '\n% Interlinear text (sequence of numbered examples)',
    '\n\\begin{exe}',
    items,
    '\\end{exe}\n'
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const raw = await readInputText(args);
  const examples = parseExamples(raw);
  if (examples.length === 0) {
    console.error('No examples found. Ensure TSV tiers like "Morphemes", "Lex. Gloss", "Word Gloss", and a "Free" line.');
    process.exit(1);
  }

  let output = '';
  if (examples.length === 1) {
    const ex = examples[0];
    const blocks = [
      ['(1) Single example', asSingleExample(ex)],
      ['(2) Start list example (this as first item)', asListStarter(ex)],
      ['(3) List item (to add into existing xlist)', asListItem(ex)]
    ];
    for (const [title, code] of blocks) {
      output += `\n===== ${title} =====\n\n${code}\n`;
    }
  } else {
    const blocks = [
      ['(1) List Example', asListOfExamples(examples)],
      ['(2) Interlinear text (sequence)', asInterlinearText(examples)]
    ];
    for (const [title, code] of blocks) {
      output += `\n===== ${title} =====\n\n${code}\n`;
    }
  }

  // Decide output sink: editor by default when using --open-editor or --input-file; otherwise stdout.
  const outFileIdx = args.indexOf('--out-file');
  const outFile = outFileIdx >= 0 ? args[outFileIdx + 1] : undefined;
  const usedOpenEditor = args.includes('--open-editor');
  const usedInputFile = args.includes('--input-file');
  if (usedOpenEditor || usedInputFile || outFile) {
    const target = openEditorWithText(output.trimStart(), outFile);
    console.error(`Output opened for copy/paste: ${target}`);
  } else {
    console.log(output.trimStart());
  }

  // Guidance: langsci-gb4e options worth prompting for
  console.error('Notes: Consider labels (\\label{...}), xlist grouping, and choosing \\gll vs \\glll.');
}

main().catch((e) => { console.error(e?.message || e); process.exit(1); });
