import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

const LATEX_HEADER = '\\renewcommand{\\arraystretch}{1.2}\n' + '\\setlength{\\tabcolsep}{6pt}\n';
const HEADER_ROW_GRAY = '0.95';

export function registerTsvToTabularxCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('lingtex.tsvToTabularx', async () => {
    const active = vscode.window.activeTextEditor?.document;
    const content = active?.getText() ?? '';
    const isTemplate = content.includes('# TSV → LaTeX tabularx input') && content.includes('\n---\n');

    if (!isTemplate) {
      const tmpl = buildEditorTemplate({});
      const doc = await vscode.workspace.openTextDocument({ language: 'plaintext', content: tmpl });
      await vscode.window.showTextDocument(doc);
      await vscode.commands.executeCommand('setContext', 'lingtex.tsvTabularxTemplateOpen', true);
      vscode.window.showInformationMessage('LingTeX: Paste TSV after the --- line, then run “TSV → LaTeX tabularx” again to generate output.');
      return;
    }

    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'LingTeX: TSV → LaTeX tabularx', cancellable: false }, async (progress) => {
      progress.report({ message: 'Parsing editor content…' });
      const parsed = parseEditorContent(content);
      const data = parseTSV(parsed.tsv);
      if (data.length === 0) {
        vscode.window.showErrorMessage('No rows parsed from TSV. Ensure you pasted lines after the --- divider.');
        return;
      }

      progress.report({ message: 'Rendering LaTeX…' });
      const tex = renderTSVToTex(data, parsed.caption, parsed.label, parsed.headerColumn);

      const docOut = await vscode.workspace.openTextDocument({ language: 'latex', content: tex });
      await vscode.window.showTextDocument(docOut);
      await vscode.commands.executeCommand('setContext', 'lingtex.tsvTabularxTemplateOpen', false);
    });
  });
  context.subscriptions.push(disposable);

  // Accept/Cancel title bar actions
  const accept = vscode.commands.registerCommand('lingtex.acceptTsvToTabularx', async () => {
    const doc = vscode.window.activeTextEditor?.document;
    if (!doc) return;
    const content = doc.getText();
    if (!content.includes('# TSV → LaTeX tabularx input') || !content.includes('\n---\n')) return;
    const parsed = parseEditorContent(content);
    const data = parseTSV(parsed.tsv);
    if (data.length === 0) {
      vscode.window.showErrorMessage('No rows parsed from TSV. Ensure you pasted lines after the --- divider.');
      return;
    }
    const tex = renderTSVToTex(data, parsed.caption, parsed.label, parsed.headerColumn);
    const docOut = await vscode.workspace.openTextDocument({ language: 'latex', content: tex });
    await vscode.window.showTextDocument(docOut);
    await vscode.commands.executeCommand('setContext', 'lingtex.tsvTabularxTemplateOpen', false);
  });
  const cancel = vscode.commands.registerCommand('lingtex.cancelTsvToTabularx', async () => {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    await vscode.commands.executeCommand('setContext', 'lingtex.tsvTabularxTemplateOpen', false);
  });
  context.subscriptions.push(accept, cancel);

  // Clear context if the template is closed without action
  const closeSub = vscode.workspace.onDidCloseTextDocument(async (doc) => {
    const text = doc.getText();
    if (text.includes('# TSV → LaTeX tabularx input') && text.includes('\n---\n')) {
      await vscode.commands.executeCommand('setContext', 'lingtex.tsvTabularxTemplateOpen', false);
    }
  });
  context.subscriptions.push(closeSub);
}

function latexEscape(s: string): string {
  if (s == null) return '';
  return s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

function makecellIfNeeded(text: string, align: 'l' | 'c' | 'r' = 'l'): string {
  if (!text) return '';
  if (text.includes('\n')) {
    const parts = text.split('\n').map(p => latexEscape(p.trim()));
    return `\\makecell[${align}]{` + parts.join(' \\ ') + '}';
  }
  return latexEscape(text);
}

function buildTabularxSpec(ncols: number): string {
  return '|' + Array.from({ length: ncols }, () => 'X').join('|') + '|';
}

function sanitizeLabel(s: string): string {
  return s.split('').map(ch => /[a-z0-9]/i.test(ch) ? ch.toLowerCase() : '-').join('').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function parseTSV(input: string): string[][] {
  const rows = input.replace(/\r\n?/g, '\n').split('\n').filter(line => line.length > 0);
  return rows.map(line => line.split('\t'));
}

function renderTSVToTex(data: string[][], caption: string | null, labelBase: string, headerColumn: boolean): string {
  const ncols = Math.max(0, ...data.map(r => r.length));
  const lines: string[] = [];
  lines.push('% Auto-generated by LingTeX');
  lines.push(LATEX_HEADER.trim());
  lines.push('\\begin{table}[htbp!]');
  lines.push('\\centering');
  if (caption) {
    lines.push(`\\caption{${latexEscape(caption)}}`);
    lines.push(`\\label{tbl:${sanitizeLabel(labelBase)}}`);
  }
  lines.push(`\\begin{tabularx}{\\linewidth}{${buildTabularxSpec(ncols)}}`);
  lines.push('\\hline');
  if (data.length > 0) lines.push(`\\rowcolor[gray]{${HEADER_ROW_GRAY}}`);

  const renderRow = (row: string[], isHeader: boolean): string => {
    const cells = row.map((raw, idx) => {
      let content = makecellIfNeeded(raw ?? '', 'l');
      if (isHeader || (headerColumn && idx === 0)) content = `\\textbf{${content}}`;
      if (headerColumn && !isHeader && idx === 0) content = `\\cellcolor[gray]{${HEADER_ROW_GRAY}}` + content;
      return content;
    });
    return cells.join(' & ') + ' \\';
  };

  if (data.length > 0) {
    lines.push(renderRow(data[0], true));
    lines.push('\\hline');
  }
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row.every(cell => !cell || cell.trim() === '')) continue; // skip empty
    lines.push(renderRow(row, false));
    lines.push('\\hline');
  }

  lines.push('\\end{tabularx}');
  lines.push('\\end{table}');
  return lines.join('\n') + '\n';
}

function buildEditorTemplate(defaults: { caption?: string | null; label?: string | null; headerColumn?: boolean }): string {
  const caption = defaults.caption ?? 'My Table';
  const label = defaults.label ?? 'my-table';
  const headerCol = defaults.headerColumn ?? false;
  const infoLine = '# Output destination: new unsaved LaTeX document (you choose where to save)';
  return [
    '# TSV → LaTeX tabularx input',
    '# Fill the fields below, then paste TSV after the --- line.',
    infoLine,
    `Caption: ${caption}`,
    `Label: ${label}`,
    `HeaderColumn: ${headerCol ? 'yes' : 'no'}`,
    '---',
    '# Example: header\tcol2\tcol3',
    '# Paste your TSV rows below this line:',
    '',
  ].join('\n');
}

function parseEditorContent(content: string): { caption: string | null; label: string; headerColumn: boolean; tsv: string } {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  let caption: string | null = null;
  let label = 'tsv-table';
  let headerColumn = false;
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
    const m = line.match(/^(Caption|Label|HeaderColumn):\s*(.*)$/);
    if (m) {
      const key = m[1];
      const val = m[2].trim();
      if (key === 'Caption') caption = val || null;
      else if (key === 'Label') label = val || label;
      else if (key === 'HeaderColumn') headerColumn = /^(yes|true|1)$/i.test(val);
    }
  }
  return { caption, label, headerColumn, tsv: bodyLines.join('\n') };
}

// (Out path removed) Tabularx now always opens as a new unsaved LaTeX document.
