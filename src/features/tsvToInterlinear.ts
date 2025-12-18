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
      const { lines, headers } = parseTSV(raw);
      const gb4e = toGb4e(lines, headers);
      const cfg = vscode.workspace.getConfiguration('lingtex');
      const mode = cfg.get<string>('interlinear.outputMode', 'insert');
      progress.report({ message: mode === 'clipboard' ? 'Copying to clipboard…' : 'Inserting at cursor…' });
      await insertIntoTargetOrClipboard(gb4e + '\n', mode as any);
      await vscode.commands.executeCommand('setContext', 'lingtex.tsvInterlinearTemplateOpen', false);
      // Optionally close the template editor
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
    const { lines, headers } = parseTSV(raw);
    const gb4e = toGb4e(lines, headers);
    const cfg = vscode.workspace.getConfiguration('lingtex');
    const mode = cfg.get<string>('interlinear.outputMode', 'insert');
    await insertIntoTargetOrClipboard(gb4e + '\n', mode as any);
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

function parseTSV(raw: string): { lines: string[][]; headers: string[] } {
  const rows = raw.split(/\r?\n/).filter(r => r.trim().length > 0);
  const headers = rows[0].split('\t').map(h => h.trim().toLowerCase());
  const lines = rows.slice(1).map(r => r.split('\t').map(c => c.trim()));
  return { lines, headers };
}

function toGb4e(lines: string[][], headers: string[]): string {
  // Try to map common header names to tiers.
  const idx = (names: string[]) => {
    for (const n of names) {
      const i = headers.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };
  const iForm = idx(['form', 'line1', 'orth', 'tok']);
  const iMorph = idx(['morph', 'seg', 'line2']);
  const iGloss = idx(['gloss', 'line3']);
  const iTrans = idx(['translation', 'trans']);

  const joinCol = (i: number) => (i >= 0 ? lines.map(r => r[i]).join(' ') : '');
  const L1 = joinCol(iForm);
  const L2 = joinCol(iMorph);
  const L3 = joinCol(iGloss);
  const T = iTrans >= 0 ? lines.map(r => r[iTrans]).join(' ') : '';

  const body: string[] = [];
  if (L1 || L2 || L3) {
    body.push('  \\gll ' + [L1, L2, L3].filter(s => s && s.length > 0).join(' \\ '));
  }
  if (T) {
    body.push('  \\trans ' + latexEscape(T));
  }
  return ['\\begin{exe}', '\\ex', ...body, '\\end{exe}', ''].join('\n');
}

function expandWorkspaceFolder(p: string): string {
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (!ws) return p;
  return p.replace('${workspaceFolder}', ws.uri.fsPath);
}

function latexEscape(s: string): string {
  return s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([#%&_{}])/g, '{\\$1}')
    .replace(/\^/g, '{\\textasciicircum}')
    .replace(/~/g, '{\\textasciitilde}');
}

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
    '# Expected header row includes columns like form/morph/gloss/translation.',
    '# Paste TSV after the --- line. First row is headers, subsequent rows are data.',
    infoLine,
    `Label: ${label}`,
    '---',
    'form\tmorph\tgloss\ttranslation',
    'pu\tpu\tCL\tA classifier example',
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
