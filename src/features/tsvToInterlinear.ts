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
      const cfg = vscode.workspace.getConfiguration('lingtex');
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
      const examples = parseExamples(raw);
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

      const cfg = vscode.workspace.getConfiguration('lingtex');
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
    const exs = parseExamples(raw);
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
    const cfg = vscode.workspace.getConfiguration('lingtex');
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
  return joined || null;
}

function latexEscape(s: string): string {
  return s.replace(/([%$#&_{}])/g, '\\$1').replace(/\u00A0/g, ' ');
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
