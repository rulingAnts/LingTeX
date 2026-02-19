import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export function registerTsvToInterlinearCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('lingtex.tsvToInterlinear', async () => {
    const activeEditor = vscode.window.activeTextEditor;
    const activeDoc = activeEditor?.document;
    const content = activeDoc?.getText() ?? '';
    const isTemplate = content.includes('# TSV → Interlinear input') && content.includes('\n---\n');

    if (!isTemplate) {
      const mode = cfg.get<string>('interlinear.outputMode', 'insert');
      const targetInfo = activeEditor ? { file: require('path').basename(activeEditor.document.fileName), line: activeEditor.selection.active.line + 1 } : null;
      const tmpl = buildEditorTemplate({ outputMode: mode, targetInfo });
      const doc = await vscode.workspace.openTextDocument({ language: 'plaintext', content: tmpl });
      await vscode.window.showTextDocument(doc);
      await vscode.commands.executeCommand('setContext', 'lingtex.tsvInterlinearTemplateOpen', true);
      if (activeEditor) {
        pendingTarget = { uri: activeEditor.document.uri, position: activeEditor.selection.active };
      } else {
        pendingTarget = null;
      }
      vscode.window.showInformationMessage('LingTeX: Paste TSV after the --- line, then run “TSV → Interlinear” again to generate output.');
      return;
    }

    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'LingTeX: TSV → Interlinear', cancellable: false }, async (progress) => {
      progress.report({ message: 'Parsing editor content…' });
      const parsed = parseEditorContent(content);
      const raw = parsed.tsv;
      const cfg = vscode.workspace.getConfiguration('lingtex');
      const doMerge = cfg.get<boolean>('interlinear.mergeMorphemeBreaks', true);
          let preprocessed = doMerge ? preprocessMorphemeBreaks(raw) : raw;
          const doWrap = cfg.get<boolean>('interlinear.wrapGrammaticalGlosses', false);
          if (doWrap) preprocessed = wrapGrammaticalGlosses(preprocessed);
      const examples = parseExamples(preprocessed);
      if (examples.length === 0) {
        vscode.window.showErrorMessage('LingTeX: No examples found. Ensure tier lines like "Morphemes", "Lex. Gloss", "Word Gloss", and a "Free" line or a blank line to separate examples.');
        return;
      }

      // Choose options depending on single vs multiple examples
      let choice: string | undefined;
      if (examples.length === 1) {
        const picks = [
          { label: 'Snippet (single interlinear example)', value: 'single-snippet' },
          { label: 'New list example (this as first item)', value: 'single-list-starter' },
          { label: 'Add to existing list (one item)', value: 'single-list-item' },
        ];
        const sel = await vscode.window.showQuickPick(picks, { placeHolder: 'Select interlinear output for single example' });
        choice = sel?.value;
        if (!choice) return;
      } else {
        const picks = [
          { label: 'New list example (sub-examples a, b, c, …)', value: 'multi-new-list' },
          { label: 'Add to existing list (items only)', value: 'multi-list-items' },
          { label: 'Interlinear text (sequence of numbered examples)', value: 'multi-text' },
        ];
        const sel = await vscode.window.showQuickPick(picks, { placeHolder: `Detected ${examples.length} examples. Choose output.` });
        choice = sel?.value;
        if (!choice) return;
      }

      // Render one output according to the selection
      let output = '';
      if (examples.length === 1) {
        const ex = examples[0];
        if (choice === 'single-snippet') output = asSingleExample(ex);
        else if (choice === 'single-list-starter') output = asListStarter(ex);
        else if (choice === 'single-list-item') output = asListItem(ex);
        else return;
      } else {
        if (choice === 'multi-new-list') output = asListOfExamples(examples);
        else if (choice === 'multi-list-items') output = asItemsForExistingList(examples);
        else if (choice === 'multi-text') output = asInterlinearText(examples);
        else return;
      }

      const mode = cfg.get<string>('interlinear.outputMode', 'insert');
      progress.report({ message: mode === 'clipboard' ? 'Copying to clipboard…' : 'Inserting at cursor…' });
      await insertIntoTargetOrClipboard(output + '\n', mode as any);
      await vscode.commands.executeCommand('setContext', 'lingtex.tsvInterlinearTemplateOpen', false);
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
  });
  context.subscriptions.push(disposable);

  // Accept/Cancel title bar actions
  const accept = vscode.commands.registerCommand('lingtex.acceptTsvToInterlinear', async () => {
    const doc = vscode.window.activeTextEditor?.document;
    if (!doc) return;
    const content = doc.getText();
    if (!content.includes('# TSV → Interlinear input') || !content.includes('\n---\n')) return;
    const parsed = parseEditorContent(content);
    const raw = parsed.tsv;
    const cfg = vscode.workspace.getConfiguration('lingtex');
    const doMerge = cfg.get<boolean>('interlinear.mergeMorphemeBreaks', true);
      let preprocessed = doMerge ? preprocessMorphemeBreaks(raw) : raw;
      const doWrap = cfg.get<boolean>('interlinear.wrapGrammaticalGlosses', false);
      if (doWrap) preprocessed = wrapGrammaticalGlosses(preprocessed);
    const exs = parseExamples(preprocessed);
    if (exs.length === 0) { vscode.window.showErrorMessage('LingTeX: No examples found in pasted TSV.'); return; }
    let choice: string | undefined;
    if (exs.length === 1) {
      const picks = [
        { label: 'Snippet (single interlinear example)', value: 'single-snippet' },
        { label: 'New list example (this as first item)', value: 'single-list-starter' },
        { label: 'Add to existing list (one item)', value: 'single-list-item' },
      ];
      const sel = await vscode.window.showQuickPick(picks, { placeHolder: 'Select interlinear output for single example' });
      choice = sel?.value;
      if (!choice) return;
    } else {
      const picks = [
        { label: 'New list example (sub-examples a, b, c, …)', value: 'multi-new-list' },
        { label: 'Add to existing list (items only)', value: 'multi-list-items' },
        { label: 'Interlinear text (sequence of numbered examples)', value: 'multi-text' },
      ];
      const sel = await vscode.window.showQuickPick(picks, { placeHolder: `Detected ${exs.length} examples. Choose output.` });
      choice = sel?.value;
      if (!choice) return;
    }
    let out = '';
    if (exs.length === 1) {
      const ex = exs[0];
      if (choice === 'single-snippet') out = asSingleExample(ex);
      else if (choice === 'single-list-starter') out = asListStarter(ex);
      else if (choice === 'single-list-item') out = asListItem(ex);
      else return;
    } else {
      if (choice === 'multi-new-list') out = asListOfExamples(exs);
      else if (choice === 'multi-list-items') out = asItemsForExistingList(exs);
      else if (choice === 'multi-text') out = asInterlinearText(exs);
      else return;
    }
    const mode = cfg.get<string>('interlinear.outputMode', 'insert');
    await insertIntoTargetOrClipboard(out + '\n', mode as any);
    await vscode.commands.executeCommand('setContext', 'lingtex.tsvInterlinearTemplateOpen', false);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });
  const cancel = vscode.commands.registerCommand('lingtex.cancelTsvToInterlinear', async () => {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    await vscode.commands.executeCommand('setContext', 'lingtex.tsvInterlinearTemplateOpen', false);
  });
  context.subscriptions.push(accept, cancel);

  const closeSub = vscode.workspace.onDidCloseTextDocument(async (doc) => {
    const text = doc.getText();
    if (text.includes('# TSV → Interlinear input') && text.includes('\n---\n')) {
      await vscode.commands.executeCommand('setContext', 'lingtex.tsvInterlinearTemplateOpen', false);
      pendingTarget = null;
    }
  });
  context.subscriptions.push(closeSub);
}

// =====================
// Parsing and rendering
// =====================

type TierName = 'Word' | 'Morphemes' | 'Lex. Gloss' | 'Word Gloss' | string;

type Example = {
  number?: string;
  tiers: Record<TierName, string[]>;
  tierOrder: TierName[];
  freeTranslations: { lang?: string; text: string }[];
};

function stripInvisible(s: string): string {
  return s.replace(/[\u200E\u200F\u202A-\u202E]/g, '');
}

function tokenizeTSVLine(line: string): string[] {
  const normalizeCell = (s: string): string => {
    const cleaned = stripInvisible(s).replace(/\u00A0/g, ' ').trim();
    if (!cleaned) return '~';
    return cleaned.replace(/ /g, '~');
  };
  return line.split('\t').map(normalizeCell);
}

function preprocessMorphemeBreaks(tsvRaw: string): string {
  const breakChars = new Set(['=', '.', '-']);
  // Split examples by blank lines (preserve blocks)
  const examples = tsvRaw.split(/\r?\n\s*\r?\n/);
  const processed = examples.map((block) => {
    const rows = block.split(/\r?\n/).filter((r) => r.trim().length > 0);
    if (rows.length === 0) return block;
    const cells = rows.map((r) => r.split('\t'));

    const normFirst = (arr: string[], i: number) => (arr[i] || '').trim().toLowerCase();
    let morphemeRow = -1;
    let lexRow = -1;
    for (let i = 0; i < cells.length; i++) {
      const c0 = (cells[i][0] || '').trim().toLowerCase();
      const c1 = (cells[i][1] || '').trim().toLowerCase();
      if (c0.startsWith('morpheme') || c1.startsWith('morpheme') || c0.startsWith('morphemes') || c1.startsWith('morphemes')) morphemeRow = i;
      if (c0.startsWith('lex') || c1.startsWith('lex')) lexRow = i;
    }
    if (morphemeRow === -1 || lexRow === -1) return block;

    // Build aligned morpheme and lex arrays starting at dataStart
    const mRow = cells[morphemeRow];
    const lRow = cells[lexRow];
    const mHasNum = /^\d+$/.test((mRow[0] || '').trim());
    const labelInSecond = (mRow[0] || '').trim() === '' && (mRow[1] || '').toLowerCase().startsWith('morpheme');
    const dataStart = mHasNum ? 2 : (labelInSecond ? 2 : 1);

    const mTokens = mRow.slice(dataStart).map((c) => (c || '').trim());
    const lTokens = lRow.slice(dataStart).map((c) => (c || '').trim());
    const maxLen = Math.max(mTokens.length, lTokens.length);
    while (mTokens.length < maxLen) mTokens.push('');
    while (lTokens.length < maxLen) lTokens.push('');

    const newM: string[] = [];
    const newL: string[] = [];
    for (let i = 0; i < maxLen; i++) {
      let curM = mTokens[i] || '';
      let curL = lTokens[i] || '';
      if (!curM && !curL) {
        newM.push(''); newL.push('');
        continue;
      }
      // detect leading or trailing break sequences
      const lead = (curM.match(/^([=\.\-]+)(.*)$/) || [])[1];
      const trail = (curM.match(/^(.*?)([=\.\-]+)$/) || [])[2];
      if (lead && newM.length > 0) {
        // attach leading break to previous token
        newM[newM.length - 1] = (newM[newM.length - 1] || '') + curM;
        // attach break + current lex to previous lex
        newL[newL.length - 1] = (newL[newL.length - 1] || '') + lead + curL;
        continue;
      }
      if (trail && i + 1 < maxLen) {
        // merge current and next token
        const nextM = mTokens[i + 1] || '';
        const nextL = lTokens[i + 1] || '';
        newM.push(curM + nextM);
        newL.push((curL || '') + trail + (nextL || ''));
        i++; // skip next
        continue;
      }
      newM.push(curM);
      newL.push(curL);
    }

    // Reconstruct rows: keep pre-data columns as-is
    const prefixRows = cells.map((r) => r.slice(0, dataStart));
    const outRows = cells.map((r, idx) => {
      const pre = prefixRows[idx] || [];
      if (idx === morphemeRow) return pre.concat(newM).join('\t');
      if (idx === lexRow) return pre.concat(newL).join('\t');
      return r.join('\t');
    });
    return outRows.join('\n');
  });
  return processed.join('\n\n');
}

function wrapGrammaticalGlosses(tsvRaw: string): string {
  const cfg = vscode.workspace.getConfiguration('lingtex');
  const custom = cfg.get<string[]>('interlinear.grammaticalGlosses', []) ?? [];
  const customSet = new Set((custom || []).map((s) => (s || '').toLowerCase()));
  const isGramGloss = (s: string) => /^[A-Z0-9]+(?:\.[A-Z0-9]+)*$/.test(s) || customSet.has(s.toLowerCase());
  const wrapSub = (part: string) => {
    // split on periods, wrap uppercase subparts
    if (isGramGloss(part)) {
      return part.split('.').map(p => `\\gl{${p.toLowerCase()}}`).join('.');
    }
    return part;
  };
  const wrapToken = (token: string) => {
    // preserve = and - as separators
    const parts = token.split(/([=\-])/);
    return parts.map(p => (p === '=' || p === '-') ? p : wrapSub(p)).join('');
  };

  const blocks = tsvRaw.split(/\r?\n\s*\r?\n/);
  const outBlocks = blocks.map(block => {
    const rows = block.split(/\r?\n/);
    const cells = rows.map(r => r.split('\t'));
    // find lex row by label in col0 or col1
    let lexRow = -1;
    for (let i = 0; i < cells.length; i++) {
      const c0 = (cells[i][0] || '').trim().toLowerCase();
      const c1 = (cells[i][1] || '').trim().toLowerCase();
      if (c0.startsWith('lex') || c1.startsWith('lex')) { lexRow = i; break; }
    }
    if (lexRow === -1) return block;
    const lRow = cells[lexRow];
    const hasNumber = /^\d+$/.test((lRow[0] || '').trim());
    const dataStart = hasNumber ? 2 : 1;
    for (let j = dataStart; j < lRow.length; j++) {
      const tok = (lRow[j] || '').trim();
      if (!tok) continue;
      lRow[j] = wrapToken(tok);
    }
    return cells.map(c => c.join('\t')).join('\n');
  });
  return outBlocks.join('\n\n');
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

    const first = (cols[0] || '').toLowerCase();
    if (first.startsWith('free')) {
      if (!current) current = { tiers: {}, tierOrder: [], freeTranslations: [] };
      const lang = cols[0].slice(4).replace(/~/g, ' ').trim() || undefined;
      // Preserve spaces in free translation: prefer text after first tab; else after label/separators.
      let text = '';
      const tabPos = raw.indexOf('\t');
      if (tabPos >= 0) {
        text = stripInvisible(raw.slice(tabPos + 1)).replace(/\u00A0/g, ' ').trim();
      } else {
        text = stripInvisible(raw.replace(/^\s*free\b.*?[:\-\s]+/i, '')).replace(/\u00A0/g, ' ').trim();
      }
      current.freeTranslations.push({ lang, text });
      pushCurrent();
      continue;
    }

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

function getMaxAligned(): number {
  const cfg = vscode.workspace.getConfiguration('lingtex');
  const n = cfg.get<number>('interlinear.maxLines', 5) ?? 5;
  return Math.max(2, n);
}

function gatherAlignedLines(ex: Example): string[] {
  const normalize = (name: TierName) => (name || '').toLowerCase();
  const canonicalOrder = ['word', 'morphemes', 'lex. gloss', 'word gloss', 'word cat.', 'pos'];
  const orderedTiers: TierName[] = [];
  const seen = new Set<string>();

  for (const c of canonicalOrder) {
    const match = ex.tierOrder.find((t) => normalize(t) === c);
    if (match && !seen.has(normalize(match))) {
      orderedTiers.push(match);
      seen.add(normalize(match));
    }
  }
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
    // Join tab-separated tokens with actual spaces (gb4e item separators).
    // Preserve literal spaces inside tokens as '~' (done during tokenization).
    lines.push(toks.join(' '));
  }
  return lines;
}

function renderGLLLines(ex: Example): { gCmd: string; lines: string[] } {
  const lines = gatherAlignedLines(ex);
  const n = lines.length;
  const maxAligned = getMaxAligned();
  const count = Math.max(2, Math.min(n, maxAligned));
  const gCmd = 'g' + 'l'.repeat(count);
  return { gCmd, lines: lines.slice(0, count) };
}

function renderGlt(ex: Example): string | null {
  if (!ex.freeTranslations.length) return null;
  const joined = ex.freeTranslations
    .map((f) => f.text)
    .filter(Boolean)
    .join(' ');
  // strip leading 'Free' or language label if present
  const cleaned = joined.replace(/^\s*Free\b\s*/i, '').trim();
  return cleaned || null;
}

function latexEscape(s: string): string {
  // Preserve any \gl{...} occurrences while escaping other special chars
  const placeholders: string[] = [];
  const marker = '<<<GLPH>>>';
  const tmp = s.replace(/(\\gl\{[^}]+\})/g, (m) => {
    placeholders.push(m);
    return marker + (placeholders.length - 1) + '<<<';
  });
  let escaped = tmp.replace(/([%$#&_{}])/g, '\\$1').replace(/\u00A0/g, ' ');
  escaped = escaped.replace(new RegExp(marker + '(\\d+)<<<', 'g'), (m, idx) => placeholders[Number(idx)]);
  return escaped;
}

function renderExampleN(ex: Example): string {
  const { gCmd, lines } = renderGLLLines(ex);
  const glt = renderGlt(ex);
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

function asItemsForExistingList(exs: Example[]): string {
  return exs
    .map((e, i) => ['\\ex % \\label{ex:KEY-' + String(i + 1) + '}', renderExampleN(e)].join('\n'))
    .join('\n');
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

function expandWorkspaceFolder(p: string): string {
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (!ws) return p;
  return p.replace('${workspaceFolder}', ws.uri.fsPath);
}

// Removed duplicate latexEscape that was previously used for template metadata parsing.

function buildEditorTemplate(defaults: { label?: string | null; outputMode?: string; targetInfo?: { file: string; line: number } | null }): string {
  const label = defaults.label ?? 'interlinear-example';
  const mode = (defaults.outputMode ?? 'insert').toLowerCase();
  const infoLine = mode === 'clipboard'
    ? '# Output destination: clipboard'
    : (defaults.targetInfo
        ? `# Output destination: insert at ${defaults.targetInfo.file}:${defaults.targetInfo.line}`
        : '# Output destination: insert at current cursor (no target captured yet)');
  return [
    '# TSV → Interlinear input',
    '# Paste tiered TSV after the --- line (no header row). Lines starting with # are ignored.',
    '# Example tiers: (Number)\tMorphemes\t... or Word\t..., Lex. Gloss\t..., Word Gloss\t..., Free\t... ',
    '# Leave a blank line between examples, or include a Free line to terminate an example.',
    infoLine,
    `Label: ${label}`,
    '---',
    'Morphemes\tpa sɛn\tɛɾi\ta\t=bo\tɾi\tobwi\tnaʉ\t-ɥo',
    'Lex. Gloss\t***\tDET\t1SG\tERG\t2SG\tword\tsay\tINCMP',
    'Word Gloss\tMr. Seth\tthis\tI\t\tyou\tinform\t\t',
    'Free Eng\tMr. Seth, I\'m telling you this:',
    '',
  ].join('\n');
}

function parseEditorContent(content: string): { label: string; tsv: string } {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  let label = 'interlinear-example';
  const bodyLines: string[] = [];
  let inBody = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (inBody) {
      if (line.startsWith('#')) continue;
      bodyLines.push(line);
      continue;
    }
    if (line === '---') { inBody = true; continue; }
    if (line.startsWith('#')) continue;
    const m = line.match(/^(Label):\s*(.*)$/);
    if (m) label = (m[2].trim()) || label;
  }
  return { label, tsv: bodyLines.join('\n') };
}

async function resolveInterlinearOutPath(label: string): Promise<string> {
  const cfg = vscode.workspace.getConfiguration('lingtex');
  const outDirSetting = cfg.get<string>('tables.outputDir');
  const ws = vscode.workspace.workspaceFolders?.[0];
  const outDir = outDirSetting && ws ? outDirSetting.replace('${workspaceFolder}', ws.uri.fsPath) : ws?.uri.fsPath ?? process.cwd();
  const outName = `${label}.interlinear.tex`;
  return path.join(outDir, outName);
}

// Track the target editor and position where interlinear should be inserted
let pendingTarget: { uri: vscode.Uri; position: vscode.Position } | null = null;

async function insertIntoTargetOrClipboard(text: string, mode?: 'insert' | 'clipboard' | 'prompt'): Promise<void> {
  if (mode === 'prompt') {
    const choice = await vscode.window.showQuickPick(['Insert at cursor', 'Copy to clipboard'], { placeHolder: 'Interlinear output destination' });
    if (!choice) return;
    mode = choice.startsWith('Insert') ? 'insert' : 'clipboard';
  }
  if (mode === 'clipboard') {
    await vscode.env.clipboard.writeText(text);
    vscode.window.showInformationMessage('LingTeX: Copied interlinear to clipboard.');
    return;
  }
  if (pendingTarget) {
    // Try to find an existing visible editor for the target
    const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === pendingTarget!.uri.toString());
    const doc = editor?.document ?? (await vscode.workspace.openTextDocument(pendingTarget.uri));
    const targetEditor = editor ?? (await vscode.window.showTextDocument(doc, { preview: false }));
    await targetEditor.edit(edit => {
      edit.insert(pendingTarget!.position, text);
    });
    // Move cursor after inserted text
    const endPos = new vscode.Position(pendingTarget!.position.line + text.split('\n').length - 1, (text.split('\n').pop() || '').length);
    targetEditor.selection = new vscode.Selection(endPos, endPos);
    vscode.window.showInformationMessage('LingTeX: Inserted interlinear at cursor.');
    pendingTarget = null;
    return;
  }
  await vscode.env.clipboard.writeText(text);
  vscode.window.showInformationMessage('LingTeX: Copied interlinear to clipboard (no active target editor).');
}
